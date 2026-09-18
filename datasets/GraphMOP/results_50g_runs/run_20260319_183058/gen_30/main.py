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

    Goals:
    1. Minimize end-to-end latency = transmission latency + server queueing delay.
    2. Minimize total energy = routing energy + server compute energy.
    """
    import heapq

    # 1. Build adjacency list
    graph = [[] for _ in range(num_nodes)]
    for u, v, base_latency, energy_cost, _capacity in edges:
        graph[u].append((v, base_latency, energy_cost))
        graph[v].append((u, base_latency, energy_cost))

    # 2. Precompute shortest path trees from each server to all nodes.
    # Routing weight balances latency and routing energy.
    routing_energy_weight = 1.25
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
            if d > dist[u]:
                continue
            for v, b_lat, e_cost in graph[u]:
                w = b_lat + routing_energy_weight * e_cost
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

    # 3. Sort task sources by total compute demand descending for efficient load balancing
    ranked_sources = sorted(
        task_sources,
        key=lambda src: task_info[src][0] * task_info[src][2],
        reverse=True,
    )

    projected_load = {srv: 0.0 for srv in server_nodes}  # lambda * compute_demand
    projected_arr = {srv: 0.0 for srv in server_nodes}   # total lambda
    plan = {}

    # 4. Greedy assignment based on Marginal Cost
    util_cap = 0.94
    energy_weight = 1.42
    util_penalty_weight = 0.12

    for src in ranked_sources:
        arr_rate, _payload_size, comp_demand = task_info[src]
        load_increase = arr_rate * comp_demand

        best_srv = None
        best_score = inf

        for srv in server_nodes:
            tree = server_trees[srv]
            if tree['dist'][src] == inf:
                continue

            srv_rate, idle_pwr, dyn_pwr = server_info[srv]
            old_load = projected_load[srv]
            new_load = old_load + load_increase

            # Hard cap for utilization to avoid queueing explosion
            if new_load >= util_cap * srv_rate:
                continue

            # M/M/1 queueing delay: 1 / (mu - lambda)
            q_new = 1.0 / (srv_rate - new_load)
            q_old = 1.0 / (srv_rate - old_load) if old_load > 0 else 1.0 / srv_rate
            
            t_lat = tree['lat'][src]
            r_eng = tree['eng'][src]

            # Marginal Latency: Impact on current task + externality on existing arrivals
            delta_lat = arr_rate * (t_lat + q_new) + projected_arr[srv] * (q_new - q_old)
            
            # Marginal Energy: Routing + Dynamic Compute + (Idle Power for the first task)
            delta_eng = arr_rate * r_eng + dyn_pwr * (load_increase / srv_rate)
            if old_load == 0:
                delta_eng += idle_pwr

            # Utilization penalty helps spread load before hitting the cap
            util_new = new_load / srv_rate
            score = delta_lat + energy_weight * delta_eng + util_penalty_weight * (util_new**2)

            if score < best_score:
                best_score = score
                best_srv = srv

        # Fallback for disconnected or extremely overloaded cases
        if best_srv is None:
            reachable = [s for s in server_nodes if server_trees[s]['dist'][src] != inf]
            if reachable:
                best_srv = min(reachable, key=lambda s: server_trees[s]['dist'][src])
            else:
                best_srv = server_nodes[0]

        # 5. Path reconstruction (Source -> Server)
        tree = server_trees[best_srv]
        path = []
        if tree['dist'][src] != inf:
            curr = src
            while curr != -1:
                path.append(curr)
                if curr == best_srv:
                    break
                curr = tree['parent'][curr]

        plan[src] = {"server": best_srv, "path": path}
        
        # update aggregates
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