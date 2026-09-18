# EVOLVE-BLOCK-START
def evolve_task_routing(
    num_nodes,
    edges,
    server_nodes,
    task_sources,
    task_info,
    server_info,
):
    """
    Graph multi-objective routing problem.

    You must return a dict:
    {
        source_node: {
            "server": server_node,
            "path": [source_node, ..., server_node],
        },
        ...
    }

    Goals:
    1. Minimize end-to-end latency = transmission latency + server queueing delay.
    2. Minimize total energy = routing energy + server compute energy.
    """
    import heapq

    graph = [[] for _ in range(num_nodes)]
    for u, v, base_latency, energy_cost, capacity in edges:
        graph[u].append((v, base_latency, energy_cost, capacity))
        graph[v].append((u, base_latency, energy_cost, capacity))

    def shortest_path(source, target):
        dist = [float("inf")] * num_nodes
        parent = [-1] * num_nodes
        dist[source] = 0.0
        heap = [(0.0, source)]

        while heap:
            cur_dist, node = heapq.heappop(heap)
            if cur_dist != dist[node]:
                continue
            if node == target:
                break
            for nxt, base_latency, energy_cost, _capacity in graph[node]:
                weight = base_latency + 0.35 * energy_cost
                cand = cur_dist + weight
                if cand < dist[nxt]:
                    dist[nxt] = cand
                    parent[nxt] = node
                    heapq.heappush(heap, (cand, nxt))

        if source != target and parent[target] == -1:
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

    projected_load = {server: 0.0 for server in server_nodes}
    plan = {}

    ranked_sources = sorted(
        task_sources,
        key=lambda src: task_info[src][0] * task_info[src][2],
        reverse=True,
    )

    for source in ranked_sources:
        arrival_rate, _payload_size, compute_demand = task_info[source]
        best_server = None
        best_path = []
        best_score = float("inf")

        for server in server_nodes:
            service_rate, idle_power, dynamic_power = server_info[server]
            projected = projected_load[server] + arrival_rate * compute_demand
            if projected >= 0.9 * service_rate:
                continue
            path = shortest_path(source, server)
            if not path:
                continue
            utilization = projected / service_rate
            score = (
                (len(path) - 1)
                + 1.5 * utilization
                + 0.03 * idle_power
                + 0.06 * dynamic_power * utilization
            )
            if score < best_score:
                best_score = score
                best_server = server
                best_path = path

        if best_server is None:
            best_server = server_nodes[0]
            best_path = shortest_path(source, best_server)

        plan[source] = {"server": best_server, "path": best_path}
        projected_load[best_server] += arrival_rate * compute_demand

    return plan
# EVOLVE-BLOCK-END

import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from graph_evaluation import GraphRoutingGrader


def run_experiment(**kwargs):
    del kwargs
    grader = GraphRoutingGrader()
    try:
        avg_latency, avg_energy, final_score = grader.grade_silent(evolve_task_routing, timeout=12)
    except Exception:
        import traceback

        traceback.print_exc()
        avg_latency, avg_energy, final_score = float("inf"), float("inf"), float("inf")

    return avg_latency, avg_energy, final_score
