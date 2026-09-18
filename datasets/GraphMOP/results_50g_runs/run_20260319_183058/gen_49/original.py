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

    # 1. Build adjacency list
    graph = [[] for _ in range(num_nodes)]
    for u, v, base_latency, energy_cost, capacity in edges:
        graph[u].append((v, base_latency, energy_cost))
        graph[v].append((u, base_latency, energy_cost))

    # 2. Precompute shortest path trees from each server to all nodes
    # This structural change reduces Dijkstra calls from O(num_sources * num_servers) to O(num_servers)
    server_trees = {}
    for srv in server_nodes:
        dist = [float("inf")] * num_nodes
        lat = [0.0] * num_nodes
        eng = [0.0] * num_nodes
        parent = [-1] * num_nodes

        dist[srv] = 0.0
        heap = [(0.0, srv)]

        while heap:
            d, u = heapq.heappop(heap)
            if d > dist[u]:
                continue
            for v, b_lat, e_cost in graph[u]:
                # Combined weight for routing (balancing latency and energy)
                w = b_lat + 1.5 * e_cost
                if dist[u] + w < dist[v]:
                    dist[v] = dist[u] + w
                    lat[v] = lat[u] + b_lat
                    eng[v] = eng[u] + e_cost
                    parent[v] = u
                    heapq.heappush(heap, (dist[v], v))

        server_trees[srv] = {
            'dist': dist,
            'lat': lat,
            'eng': eng,
            'parent': parent
        }

    # 3. Sort task sources by total compute demand descending to pack efficiently
    ranked_sources = sorted(
        task_sources,
        key=lambda src: task_info[src][0] * task_info[src][2],
        reverse=True,
    )

    projected_load = {srv: 0.0 for srv in server_nodes}
    projected_arr = {srv: 0.0 for srv in server_nodes}
    plan = {}

    # 4. Assign each source to the best server using O(1) precomputed metrics
    for src in ranked_sources:
        arr_rate, _payload_size, comp_demand = task_info[src]
        load_increase = arr_rate * comp_demand

        best_srv = None
        best_score = float("inf")

        for srv in server_nodes:
            if server_trees[srv]['dist'][src] == float('inf'):
                continue

            srv_rate, idle_pwr, dyn_pwr = server_info[srv]
            old_load = projected_load[srv]
            new_load = old_load + load_increase

            # Avoid overloading servers (cap at 95% utilization)
            if new_load >= 0.95 * srv_rate:
                continue

            q_delay_new = 1.0 / (srv_rate - new_load)
            q_delay_old = 1.0 / (srv_rate - old_load) if old_load > 0 else 1.0 / srv_rate

            t_lat = server_trees[srv]['lat'][src]
            r_eng = server_trees[srv]['eng'][src]

            # Marginal cost of assigning this task source to this server
            delta_lat = arr_rate * (t_lat + q_delay_new) + projected_arr[srv] * (q_delay_new - q_delay_old)
            delta_eng = arr_rate * r_eng + dyn_pwr * (load_increase / srv_rate)
            if old_load == 0:
                delta_eng += idle_pwr

            # Multi-objective score directly modeling marginal latency and energy
            score = delta_lat + 1.5 * delta_eng

            if score < best_score:
                best_score = score
                best_srv = srv

        # Fallback if all servers are overloaded or unreachable
        if best_srv is None:
            reachable = [s for s in server_nodes if server_trees[s]['dist'][src] != float('inf')]
            if reachable:
                best_srv = min(reachable, key=lambda s: server_trees[s]['dist'][src])
            else:
                best_srv = server_nodes[0]

        # Reconstruct path from source to server using the precomputed tree
        if server_trees[best_srv]['dist'][src] == float('inf'):
            plan[src] = {"server": best_srv, "path": []}
        else:
            path = []
            curr = src
            while curr != -1:
                path.append(curr)
                curr = server_trees[best_srv]['parent'][curr]
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