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

    # Build adjacency list
    graph = [[] for _ in range(num_nodes)]
    for u, v, base_latency, energy_cost, _capacity in edges:
        graph[u].append((v, base_latency, energy_cost))
        graph[v].append((u, base_latency, energy_cost))

    # Precompute server-rooted shortest path trees (energy-latency balanced routing metric)
    # Few servers + many sources => this is much cheaper than per-source shortest path.
    route_energy_weight = 1.15
    server_trees = {}
    inf = float("inf")

    for srv in server_nodes:
        dist = [inf] * num_nodes
        lat = [0.0] * num_nodes
        eng = [0.0] * num_nodes
        parent = [-1] * num_nodes

        dist[srv] = 0.0
        heap = [(0.0, srv)]

        while heap:
            d, u = heapq.heappop(heap)
            if d != dist[u]:
                continue
            for v, b_lat, e_cost in graph[u]:
                nd = d + b_lat + route_energy_weight * e_cost
                if nd < dist[v]:
                    dist[v] = nd
                    lat[v] = lat[u] + b_lat
                    eng[v] = eng[u] + e_cost
                    parent[v] = u
                    heapq.heappush(heap, (nd, v))

        server_trees[srv] = {
            "dist": dist,
            "lat": lat,
            "eng": eng,
            "parent": parent,
        }

    # Heuristic ordering: place heavier tasks first to avoid poor late-stage overload choices
    ranked_sources = sorted(
        task_sources,
        key=lambda src: task_info[src][0] * task_info[src][2],
        reverse=True,
    )

    projected_load = {srv: 0.0 for srv in server_nodes}  # lambda * compute demand aggregate
    projected_arr = {srv: 0.0 for srv in server_nodes}   # arrival aggregate
    plan = {}

    # Path cache to avoid repeated reconstruction for same (srv, src) query
    path_cache = {}

    util_cap = 0.94
    energy_tradeoff = 1.45
    eps = 1e-12

    for src in ranked_sources:
        arr_rate, _payload_size, comp_demand = task_info[src]
        load_increase = arr_rate * comp_demand

        best_srv = None
        best_score = inf

        for srv in server_nodes:
            tree = server_trees[srv]
            if tree["dist"][src] == inf:
                continue

            srv_rate, idle_pwr, dyn_pwr = server_info[srv]
            old_load = projected_load[srv]
            new_load = old_load + load_increase

            # Keep server away from saturation to control queueing blowup
            if new_load >= util_cap * srv_rate:
                continue

            # M/M/1 style queue delay terms (incremental impact)
            denom_new = srv_rate - new_load
            if denom_new <= eps:
                continue
            q_new = 1.0 / denom_new
            q_old = 1.0 / (srv_rate - old_load) if old_load > 0 else 1.0 / srv_rate

            t_lat = tree["lat"][src]
            r_eng = tree["eng"][src]

            # Incremental latency includes self latency and externality on existing arrivals
            delta_lat = arr_rate * (t_lat + q_new) + projected_arr[srv] * (q_new - q_old)

            # Incremental energy includes route transmission + dynamic compute + first-use idle cost
            delta_eng = arr_rate * r_eng + dyn_pwr * (load_increase / srv_rate)
            if old_load == 0.0:
                delta_eng += idle_pwr

            # Light regularization to discourage near-capacity utilization spikes
            util_new = new_load / srv_rate
            score = delta_lat + energy_tradeoff * delta_eng + 0.08 * (util_new * util_new)

            if score < best_score:
                best_score = score
                best_srv = srv

        # Fallback: pick best reachable server by precomputed routing distance
        if best_srv is None:
            reachable = [s for s in server_nodes if server_trees[s]["dist"][src] != inf]
            if reachable:
                best_srv = min(reachable, key=lambda s: server_trees[s]["dist"][src])
            else:
                best_srv = server_nodes[0]

        # Reconstruct path source -> server from server-rooted parent links
        key = (best_srv, src)
        if key in path_cache:
            path = path_cache[key]
        else:
            tree = server_trees[best_srv]
            if tree["dist"][src] == inf:
                path = []
            else:
                path = []
                cur = src
                while cur != -1:
                    path.append(cur)
                    if cur == best_srv:
                        break
                    cur = tree["parent"][cur]
                if not path or path[-1] != best_srv:
                    path = []  # unreachable or malformed parent chain safeguard
            path_cache[key] = path

        plan[src] = {"server": best_srv, "path": path}

        projected_load[best_srv] += load_increase
        projected_arr[best_srv] += arr_rate

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
