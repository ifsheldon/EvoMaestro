import heapq
import math
import time
from typing import Callable, Dict, List, Tuple


Edge = Tuple[int, int, float, float, float]
TaskInfo = Dict[int, Tuple[float, float, float]]
ServerInfo = Dict[int, Tuple[float, float, float]]
Plan = Dict[int, Dict[str, object]]
Case = Dict[str, object]

INVALID_METRICS = (float("inf"), float("inf"), float("inf"))


def build_graph(num_nodes: int, edges: List[Edge]) -> List[List[Tuple[int, float, float, float]]]:
    graph: List[List[Tuple[int, float, float, float]]] = [[] for _ in range(num_nodes)]
    for u, v, base_latency, energy_cost, capacity in edges:
        graph[u].append((v, base_latency, energy_cost, capacity))
        graph[v].append((u, base_latency, energy_cost, capacity))
    return graph


def edge_lookup(edges: List[Edge]) -> Dict[Tuple[int, int], Tuple[float, float, float]]:
    lookup: Dict[Tuple[int, int], Tuple[float, float, float]] = {}
    for u, v, base_latency, energy_cost, capacity in edges:
        lookup[(u, v)] = (base_latency, energy_cost, capacity)
        lookup[(v, u)] = (base_latency, energy_cost, capacity)
    return lookup


def shortest_path(
    num_nodes: int,
    edges: List[Edge],
    source: int,
    target: int,
    latency_weight: float = 1.0,
    energy_weight: float = 0.25,
) -> List[int]:
    graph = build_graph(num_nodes, edges)
    dist = [float("inf")] * num_nodes
    parent = [-1] * num_nodes
    dist[source] = 0.0
    heap: List[Tuple[float, int]] = [(0.0, source)]

    while heap:
        cur_dist, node = heapq.heappop(heap)
        if cur_dist != dist[node]:
            continue
        if node == target:
            break
        for nxt, base_latency, energy_cost, _capacity in graph[node]:
            weight = latency_weight * base_latency + energy_weight * energy_cost
            cand = cur_dist + weight
            if cand < dist[nxt]:
                dist[nxt] = cand
                parent[nxt] = node
                heapq.heappush(heap, (cand, nxt))

    if parent[target] == -1 and source != target:
        return []

    path = [target]
    cur = target
    while cur != source:
        cur = parent[cur]
        if cur == -1:
            return []
        path.append(cur)
    path.reverse()
    return path


def validate_plan(case: Case, plan: Plan) -> Tuple[bool, str]:
    sources = case["task_sources"]
    server_nodes = set(case["server_nodes"])
    num_nodes = int(case["num_nodes"])
    edges = edge_lookup(case["edges"])

    if not isinstance(plan, dict):
        return False, "Plan must be a dict keyed by source node."

    for source in sources:
        item = plan.get(source)
        if not isinstance(item, dict):
            return False, f"Missing plan for source {source}."
        server = item.get("server")
        path = item.get("path")
        if server not in server_nodes:
            return False, f"Invalid server {server} for source {source}."
        if not isinstance(path, list) or len(path) < 2:
            return False, f"Path for source {source} must contain at least source and server."
        if path[0] != source:
            return False, f"Path for source {source} must start at the source node."
        if path[-1] != server:
            return False, f"Path for source {source} must end at the assigned server."
        if len(set(path)) != len(path):
            return False, f"Path for source {source} must be simple without cycles."
        for node in path:
            if not isinstance(node, int) or node < 0 or node >= num_nodes:
                return False, f"Invalid node {node} in path for source {source}."
        for u, v in zip(path, path[1:]):
            if (u, v) not in edges:
                return False, f"Edge ({u}, {v}) is not present for source {source}."
    return True, "Valid routing plan."


def calculate_objectives(plan: Plan, case: Case) -> Tuple[float, float, float]:
    valid, _msg = validate_plan(case, plan)
    if not valid:
        return INVALID_METRICS

    edges = edge_lookup(case["edges"])
    task_info: TaskInfo = case["task_info"]
    server_info: ServerInfo = case["server_info"]

    edge_load: Dict[Tuple[int, int], float] = {}
    server_load: Dict[int, float] = {server: 0.0 for server in case["server_nodes"]}
    total_arrival = 0.0

    for source, item in plan.items():
        arrival_rate, payload_size, compute_demand = task_info[source]
        traffic = arrival_rate * payload_size
        total_arrival += arrival_rate
        for u, v in zip(item["path"], item["path"][1:]):
            ordered = (min(u, v), max(u, v))
            edge_load[ordered] = edge_load.get(ordered, 0.0) + traffic
        server_load[item["server"]] += arrival_rate * compute_demand

    if total_arrival <= 0:
        return INVALID_METRICS

    weighted_latency = 0.0
    routing_energy = 0.0
    hop_penalty_sum = 0.0

    for source, item in plan.items():
        arrival_rate, payload_size, _compute_demand = task_info[source]
        traffic = arrival_rate * payload_size
        transmission_latency = 0.0
        hops = len(item["path"]) - 1
        for u, v in zip(item["path"], item["path"][1:]):
            base_latency, energy_cost, capacity = edges[(u, v)]
            edge_key = (min(u, v), max(u, v))
            load_ratio = edge_load[edge_key] / max(capacity, 1e-6)
            transmission_latency += base_latency * (1.0 + 0.55 * load_ratio)
            routing_energy += traffic * energy_cost
        service_rate, _idle_power, _dynamic_power = server_info[item["server"]]
        load = server_load[item["server"]]
        if load >= service_rate:
            return INVALID_METRICS
        queue_delay = 1.0 / (service_rate - load)
        weighted_latency += arrival_rate * (transmission_latency + queue_delay)
        hop_penalty_sum += arrival_rate * hops

    compute_energy = 0.0
    active_servers = 0
    for server, load in server_load.items():
        if load <= 0:
            continue
        service_rate, idle_power, dynamic_power = server_info[server]
        utilization = load / service_rate
        active_servers += 1
        compute_energy += idle_power + dynamic_power * (utilization ** 1.35)

    avg_latency = weighted_latency / total_arrival
    avg_energy = (routing_energy + compute_energy) / total_arrival
    avg_hops = hop_penalty_sum / total_arrival

    # A multiplicative scalar keeps the two-objective tradeoff sharp for Shinka.
    final_score = avg_latency * avg_energy * (1.0 + 0.05 * avg_hops + 0.03 * active_servers)
    return avg_latency, avg_energy, final_score


def evaluate_single_case(user_func: Callable[..., Plan], case: Case) -> Tuple[float, float, float]:
    try:
        plan = user_func(
            case["num_nodes"],
            case["edges"],
            case["server_nodes"],
            case["task_sources"],
            case["task_info"],
            case["server_info"],
        )
    except Exception:
        return INVALID_METRICS

    return calculate_objectives(plan, case)


class GraphRoutingGrader:
    def __init__(self) -> None:
        self.cases: List[Case] = [
            {
                "name": "mesh-10",
                "num_nodes": 10,
                "edges": [
                    (0, 1, 1.2, 0.8, 8.0),
                    (1, 2, 1.3, 0.8, 9.0),
                    (2, 3, 1.0, 0.7, 7.0),
                    (3, 4, 1.4, 0.9, 6.0),
                    (4, 5, 1.2, 0.8, 8.0),
                    (5, 6, 1.1, 0.7, 7.5),
                    (6, 7, 1.5, 1.0, 6.0),
                    (7, 8, 1.0, 0.7, 7.0),
                    (8, 9, 1.2, 0.8, 8.0),
                    (0, 3, 2.0, 1.1, 5.5),
                    (1, 4, 2.1, 1.1, 5.0),
                    (2, 5, 2.0, 1.0, 5.2),
                    (3, 6, 2.2, 1.2, 4.8),
                    (4, 7, 2.0, 1.1, 5.0),
                    (5, 8, 2.1, 1.1, 5.0),
                    (6, 9, 2.2, 1.2, 4.8),
                ],
                "server_nodes": [2, 7],
                "task_sources": [0, 1, 3, 4, 5, 6, 8, 9],
                "task_info": {
                    0: (1.1, 1.2, 0.7),
                    1: (1.4, 1.0, 0.8),
                    3: (1.2, 1.1, 0.9),
                    4: (1.0, 1.3, 0.7),
                    5: (1.5, 1.0, 1.0),
                    6: (0.9, 1.1, 0.6),
                    8: (1.3, 1.2, 0.9),
                    9: (1.1, 1.0, 0.8),
                },
                "server_info": {
                    2: (8.5, 1.4, 5.8),
                    7: (7.8, 1.2, 5.2),
                },
            },
            {
                "name": "ring-chords-12",
                "num_nodes": 12,
                "edges": [
                    (0, 1, 1.0, 0.7, 7.0),
                    (1, 2, 1.0, 0.7, 7.0),
                    (2, 3, 1.1, 0.8, 6.5),
                    (3, 4, 1.2, 0.8, 6.0),
                    (4, 5, 1.0, 0.7, 7.0),
                    (5, 6, 1.1, 0.8, 6.5),
                    (6, 7, 1.3, 0.9, 5.8),
                    (7, 8, 1.0, 0.7, 7.0),
                    (8, 9, 1.1, 0.8, 6.5),
                    (9, 10, 1.0, 0.7, 7.0),
                    (10, 11, 1.2, 0.8, 6.0),
                    (11, 0, 1.1, 0.8, 6.2),
                    (0, 6, 2.5, 1.4, 4.5),
                    (2, 8, 2.3, 1.3, 4.8),
                    (4, 10, 2.4, 1.3, 4.8),
                    (1, 7, 2.6, 1.5, 4.2),
                    (3, 9, 2.5, 1.4, 4.4),
                ],
                "server_nodes": [0, 6, 10],
                "task_sources": [1, 2, 3, 4, 5, 7, 8, 9, 11],
                "task_info": {
                    1: (1.6, 1.0, 0.8),
                    2: (1.1, 1.4, 0.9),
                    3: (1.3, 1.2, 1.0),
                    4: (1.0, 1.1, 0.7),
                    5: (0.9, 1.3, 0.6),
                    7: (1.5, 1.1, 1.0),
                    8: (1.2, 1.2, 0.8),
                    9: (1.4, 1.0, 0.9),
                    11: (1.0, 1.5, 0.7),
                },
                "server_info": {
                    0: (7.2, 1.3, 5.0),
                    6: (8.4, 1.5, 5.9),
                    10: (6.8, 1.1, 4.7),
                },
            },
            {
                "name": "gridish-14",
                "num_nodes": 14,
                "edges": [
                    (0, 1, 1.0, 0.6, 7.2),
                    (1, 2, 1.1, 0.6, 7.0),
                    (2, 3, 1.0, 0.6, 7.0),
                    (3, 4, 1.2, 0.7, 6.4),
                    (4, 5, 1.0, 0.6, 7.0),
                    (5, 6, 1.1, 0.6, 6.8),
                    (6, 7, 1.0, 0.6, 7.0),
                    (7, 8, 1.2, 0.7, 6.2),
                    (8, 9, 1.1, 0.6, 6.8),
                    (9, 10, 1.0, 0.6, 7.0),
                    (10, 11, 1.1, 0.6, 6.8),
                    (11, 12, 1.0, 0.6, 7.0),
                    (12, 13, 1.2, 0.7, 6.4),
                    (0, 5, 2.1, 1.0, 5.0),
                    (2, 7, 2.0, 1.0, 5.2),
                    (4, 9, 2.3, 1.1, 4.8),
                    (6, 11, 2.2, 1.1, 4.9),
                    (8, 13, 2.0, 1.0, 5.0),
                    (1, 8, 2.5, 1.2, 4.3),
                    (3, 10, 2.5, 1.2, 4.4),
                    (5, 12, 2.4, 1.2, 4.5),
                ],
                "server_nodes": [3, 8, 12],
                "task_sources": [0, 1, 2, 4, 5, 6, 7, 9, 10, 11, 13],
                "task_info": {
                    0: (1.4, 1.2, 0.8),
                    1: (1.1, 1.3, 0.7),
                    2: (0.9, 1.1, 0.6),
                    4: (1.6, 1.0, 1.0),
                    5: (1.3, 1.2, 0.9),
                    6: (1.0, 1.4, 0.7),
                    7: (1.5, 1.1, 1.0),
                    9: (1.2, 1.0, 0.8),
                    10: (1.3, 1.2, 0.9),
                    11: (1.0, 1.3, 0.8),
                    13: (1.4, 1.1, 0.9),
                },
                "server_info": {
                    3: (7.0, 1.3, 4.8),
                    8: (8.6, 1.5, 5.9),
                    12: (7.4, 1.2, 5.0),
                },
            },
            {
                "name": "backbone-16",
                "num_nodes": 16,
                "edges": [
                    (0, 1, 1.0, 0.6, 7.5),
                    (1, 2, 1.1, 0.7, 7.0),
                    (2, 3, 1.0, 0.6, 7.5),
                    (3, 4, 1.3, 0.8, 6.3),
                    (4, 5, 1.0, 0.6, 7.3),
                    (5, 6, 1.2, 0.7, 6.6),
                    (6, 7, 1.0, 0.6, 7.1),
                    (7, 8, 1.1, 0.7, 6.8),
                    (8, 9, 1.0, 0.6, 7.2),
                    (9, 10, 1.2, 0.7, 6.6),
                    (10, 11, 1.0, 0.6, 7.1),
                    (11, 12, 1.2, 0.7, 6.5),
                    (12, 13, 1.0, 0.6, 7.1),
                    (13, 14, 1.1, 0.7, 6.8),
                    (14, 15, 1.0, 0.6, 7.2),
                    (0, 4, 2.2, 1.0, 5.1),
                    (2, 6, 2.1, 1.0, 5.1),
                    (4, 8, 2.3, 1.1, 4.8),
                    (6, 10, 2.2, 1.1, 4.9),
                    (8, 12, 2.3, 1.1, 4.8),
                    (10, 14, 2.2, 1.1, 4.9),
                    (1, 9, 3.0, 1.5, 4.0),
                    (5, 13, 3.0, 1.5, 4.0),
                ],
                "server_nodes": [2, 9, 14],
                "task_sources": [0, 1, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 15],
                "task_info": {
                    0: (1.3, 1.3, 0.8),
                    1: (1.7, 1.1, 1.0),
                    3: (1.2, 1.2, 0.9),
                    4: (1.1, 1.0, 0.7),
                    5: (1.4, 1.4, 1.0),
                    6: (0.9, 1.2, 0.6),
                    7: (1.5, 1.0, 0.9),
                    8: (1.2, 1.3, 0.8),
                    10: (1.3, 1.1, 0.8),
                    11: (1.0, 1.2, 0.7),
                    12: (1.4, 1.3, 0.9),
                    13: (1.1, 1.0, 0.7),
                    15: (1.2, 1.4, 0.8),
                },
                "server_info": {
                    2: (8.1, 1.4, 5.4),
                    9: (9.0, 1.6, 6.2),
                    14: (7.8, 1.2, 5.1),
                },
            },
        ]

    def grade(self, user_func: Callable[..., Plan], timeout: float = 15.0) -> float | None:
        print(f"Start graph routing benchmark: {len(self.cases)} cases, timeout {timeout:.1f}s")
        start = time.time()
        results: List[Tuple[float, float, float]] = []
        for idx, case in enumerate(self.cases, start=1):
            if time.time() - start > timeout:
                print("Evaluation timed out.")
                return None
            result = evaluate_single_case(user_func, case)
            results.append(result)
            print(f"  case {idx}/{len(self.cases)} {case['name']}: {result}")
        if any(math.isinf(score) for _lat, _eng, score in results):
            print("Invalid solution detected.")
            return None
        avg_latency = sum(r[0] for r in results) / len(results)
        avg_energy = sum(r[1] for r in results) / len(results)
        final_score = sum(r[2] for r in results) / len(results)
        print(f"\nLatency: {avg_latency:.6f}")
        print(f"Energy : {avg_energy:.6f}")
        print(f"Score  : {final_score:.6f} (lower is better)")
        return final_score

    def grade_silent(
        self, user_func: Callable[..., Plan], timeout: float = 12.0
    ) -> Tuple[float, float, float]:
        start = time.time()
        results: List[Tuple[float, float, float]] = []
        try:
            for case in self.cases:
                if time.time() - start > timeout:
                    return INVALID_METRICS
                results.append(evaluate_single_case(user_func, case))
        except Exception:
            return INVALID_METRICS

        if any(math.isinf(score) for _lat, _eng, score in results):
            return INVALID_METRICS

        avg_latency = sum(r[0] for r in results) / len(results)
        avg_energy = sum(r[1] for r in results) / len(results)
        final_score = sum(r[2] for r in results) / len(results)
        return avg_latency, avg_energy, final_score


def nearest_server_baseline(
    num_nodes: int,
    edges: List[Edge],
    server_nodes: List[int],
    task_sources: List[int],
    task_info: TaskInfo,
    server_info: ServerInfo,
) -> Plan:
    del task_info
    del server_info
    plan: Plan = {}
    for source in task_sources:
        best_server = None
        best_path: List[int] = []
        best_cost = float("inf")
        for server in server_nodes:
            path = shortest_path(num_nodes, edges, source, server, latency_weight=1.0, energy_weight=0.2)
            if not path:
                continue
            cost = len(path) - 1
            if cost < best_cost:
                best_cost = cost
                best_server = server
                best_path = path
        plan[source] = {"server": best_server, "path": best_path}
    return plan


def balanced_weighted_baseline(
    num_nodes: int,
    edges: List[Edge],
    server_nodes: List[int],
    task_sources: List[int],
    task_info: TaskInfo,
    server_info: ServerInfo,
) -> Plan:
    projected_load = {server: 0.0 for server in server_nodes}
    plan: Plan = {}
    for source in sorted(task_sources, key=lambda x: task_info[x][0] * task_info[x][2], reverse=True):
        arrival_rate, _payload_size, compute_demand = task_info[source]
        best_choice = None
        best_path: List[int] = []
        best_score = float("inf")
        for server in server_nodes:
            service_rate, idle_power, dynamic_power = server_info[server]
            projected = projected_load[server] + arrival_rate * compute_demand
            if projected >= 0.92 * service_rate:
                continue
            path = shortest_path(num_nodes, edges, source, server, latency_weight=1.0, energy_weight=0.45)
            if not path:
                continue
            utilization = projected / service_rate
            score = (
                (len(path) - 1) * 1.0
                + 1.2 * utilization
                + 0.02 * idle_power
                + 0.05 * dynamic_power * utilization
            )
            if score < best_score:
                best_score = score
                best_choice = server
                best_path = path
        if best_choice is None:
            fallback = server_nodes[0]
            best_choice = fallback
            best_path = shortest_path(num_nodes, edges, source, fallback, latency_weight=1.0, energy_weight=0.45)
        plan[source] = {"server": best_choice, "path": best_path}
        projected_load[best_choice] += arrival_rate * compute_demand
    return plan


if __name__ == "__main__":
    grader = GraphRoutingGrader()
    print("Baseline 1: nearest server")
    grader.grade(nearest_server_baseline)
    print("\nBaseline 2: balanced weighted")
    grader.grade(balanced_weighted_baseline)
