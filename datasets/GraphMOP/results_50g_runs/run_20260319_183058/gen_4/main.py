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
    for u, v, bl, ec, cap in edges:
        graph[u].append((v, bl, ec, cap)); graph[v].append((u, bl, ec, cap))

    def get_server_data(snode):
        dists, parents = [float('inf')] * num_nodes, [-1] * num_nodes
        plat, pec = [0.0] * num_nodes, [0.0] * num_nodes
        dists[snode], pq = 0.0, [(0.0, snode)]
        while pq:
            d, u = heapq.heappop(pq)
            if d > dists[u]: continue
            for v, bl, ec, cap in graph[u]:
                w = bl + 0.35 * ec
                if dists[u] + w < dists[v]:
                    dists[v], parents[v] = dists[u] + w, u
                    plat[v], pec[v] = plat[u] + bl, pec[u] + ec
                    heapq.heappush(pq, (dists[v], v))
        return parents, plat, pec

    s_data = {s: get_server_data(s) for s in server_nodes}
    proj_load, plan = {s: 0.0 for s in server_nodes}, {}
    ranked = sorted(task_sources, key=lambda s: task_info[s][0] * task_info[s][2], reverse=True)

    for src in ranked:
        arr, pay, comp = task_info[src]
        best_s, best_score = None, float('inf')
        for s in server_nodes:
            s_rate, i_pow, d_pow = server_info[s]
            new_l = proj_load[s] + arr * comp
            if new_l >= 0.99 * s_rate: continue
            parents, plats, pecs = s_data[s]
            if parents[src] == -1 and src != s: continue
            score = (plats[src] + 1.0/(s_rate - new_l)) + (pay * pecs[src] + d_pow * (arr * comp / s_rate))
            if score < best_score:
                best_score, best_s = score, s

        if best_s is None:
            best_s = min(server_nodes, key=lambda s: proj_load[s] / server_info[s][0])

        path, curr, pars = [], src, s_data[best_s][0]
        while curr != -1:
            path.append(curr); curr = pars[curr]
        if not path or path[-1] != best_s:
            path = [src] if src == best_s else []
        plan[src] = {"server": best_s, "path": path}
        proj_load[best_s] += arr * comp
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