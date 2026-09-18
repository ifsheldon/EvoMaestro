# EVOLVE-BLOCK-START
def evolve_task_routing(
    num_nodes,
    edges,
    server_nodes,
    task_sources,
    task_info,
    server_info,
):
    import heapq

    # --- 1. Graph Setup ---
    adj = [[] for _ in range(num_nodes)]
    edge_map = {}
    for u, v, lat, ene, cap in edges:
        adj[u].append((v, lat, ene, cap))
        adj[v].append((u, lat, ene, cap))
        edge_map[tuple(sorted((u, v)))] = (lat, ene, cap)

    # --- 2. Multiple Dijkstra Tree Precomputation ---
    # We run Dijkstra from servers to all nodes using different criteria
    def run_dijkstra(start_node, lat_w, ene_w):
        dists = [float('inf')] * num_nodes
        parents = [-1] * num_nodes
        dists[start_node] = 0
        pq = [(0.0, start_node)]
        while pq:
            d, u = heapq.heappop(pq)
            if d > dists[u]:
                continue
            for v, lat, ene, cap in adj[u]:
                # Cost function for path finding
                weight = lat_w * lat + ene_w * ene + 0.1 / (cap + 1e-6)
                if dists[u] + weight < dists[v]:
                    dists[v] = dists[u] + weight
                    parents[v] = u
                    heapq.heappush(pq, (dists[v], v))
        return parents

    # Precompute trees for each server (typically few servers)
    server_trees = {}
    for s_node in server_nodes:
        # 3 modes: Latency focus, Energy focus, Balanced
        trees = [
            run_dijkstra(s_node, 1.0, 0.05),
            run_dijkstra(s_node, 0.05, 1.0),
            run_dijkstra(s_node, 0.5, 0.4)
        ]
        server_trees[s_node] = trees

    # --- 3. Candidate Path Preparation ---
    def get_path_metrics(path, payload):
        total_lat = 0.0
        total_ene = 0.0
        for i in range(len(path) - 1):
            u, v = path[i], path[i+1]
            l, e, c = edge_map[tuple(sorted((u, v)))]
            total_lat += l + payload / (c + 1e-6)
            total_ene += e * (1.0 + payload / (c * 2.0 + 1e-6))
        return total_lat, total_ene

    all_cands = {}  # src -> srv -> list of {path, p_lat, p_ene}
    for src in task_sources:
        arr, pld, comp = task_info[src]
        all_cands[src] = {}
        for s_node in server_nodes:
            srv_paths = []
            seen_paths = set()
            for tree in server_trees[s_node]:
                # Reconstruct path from source to server node
                path = []
                curr = src
                while curr != -1:
                    path.append(curr)
                    if curr == s_node: break
                    curr = tree[curr]
                if path and path[-1] == s_node:
                    p_tuple = tuple(path)
                    if p_tuple not in seen_paths:
                        p_lat, p_ene = get_path_metrics(path, pld)
                        srv_paths.append({'path': path, 'p_lat': p_lat, 'p_ene': p_ene})
                        seen_paths.add(p_tuple)
            if srv_paths:
                all_cands[src][s_node] = srv_paths

    # --- 4. Objective Weights and Marginal Logic ---
    ALPHA = 0.75 # Relative weight of energy vs latency

    def eval_marginal(src, s_node, cand, current_load):
        arr, pld, comp = task_info[src]
        mu, idle, dyn = server_info[s_node]
        load_increase = arr * comp

        # Transmission contribution
        t_cost = arr * (cand['p_lat'] + ALPHA * cand['p_ene'])

        # Server Load contribution (Marginal approach)
        # Total latency cost L = lambda / (mu - lambda)
        # dL/d_lambda = mu / (mu - lambda)^2
        new_lambda = current_load + load_increase
        if new_lambda >= mu * 0.98:
            return 1e18 # Capacity penalty

        m_queue_delay = mu / ((mu - current_load) ** 2) if mu > current_load else 1e9
        # Server energy marginal: d/d_lambda [idle + dyn * lambda/mu] = dyn/mu
        m_server_ene = dyn / mu

        return t_cost + load_increase * (m_queue_delay + ALPHA * m_server_ene)

    # --- 5. Dynamic Regret-Aware Assignment (small active pool) ---
    assigned_srcs = {}
    srv_loads = {s: 0.0 for s in server_nodes}

    demands = {src: task_info[src][0] * task_info[src][2] for src in task_sources}
    payloads = {src: task_info[src][1] for src in task_sources}

    # Static seed order (cheap) used to form active pools.
    seed_order = sorted(
        task_sources,
        key=lambda src: (
            -demands[src],
            -payloads[src],
            len(all_cands.get(src, {})),
        ),
    )

    ACTIVE_POOL = min(len(task_sources), max(8, int(0.25 * len(task_sources))))
    REORDER_EVERY = 4
    unassigned = set(task_sources)
    step = 0

    while unassigned:
        # Refresh a small active pool periodically (or when tiny remainder)
        if step % REORDER_EVERY == 0 or len(unassigned) <= ACTIVE_POOL:
            pool = []
            for src in seed_order:
                if src in unassigned:
                    pool.append(src)
                    if len(pool) >= ACTIVE_POOL:
                        break
            if not pool:
                pool = list(unassigned)
        else:
            pool = list(unassigned)[:ACTIVE_POOL]

        chosen_src = None
        chosen_best = None
        chosen_priority = -1e30

        for src in pool:
            best = None
            second = None
            feasible = 0

            for s_node, cands in all_cands[src].items():
                for c in cands:
                    score = eval_marginal(src, s_node, c, srv_loads[s_node])
                    if score >= 1e17:
                        continue
                    feasible += 1
                    if best is None or score < best[0]:
                        second = best
                        best = (score, s_node, c)
                    elif second is None or score < second[0]:
                        second = (score, s_node, c)

            if best is None:
                continue

            second_score = second[0] if second is not None else (best[0] + 1.0)
            regret = second_score - best[0]
            scarcity = 1.0 / (feasible + 0.5)
            priority = regret * (1.0 + 1.6 * scarcity) + 0.04 * (demands[src] ** 0.5) - 0.06 * best[0]

            if priority > chosen_priority:
                chosen_priority = priority
                chosen_src = src
                chosen_best = best

        if chosen_src is None:
            # Fallback: pick any remaining source and best reachable local candidate.
            chosen_src = next(iter(unassigned))
            best_score = float('inf')
            best_choice = None
            for s_node, cands in all_cands.get(chosen_src, {}).items():
                for c in cands:
                    local = c['p_lat'] + 0.5 * c['p_ene']
                    if local < best_score:
                        best_score = local
                        best_choice = (s_node, c)
            if best_choice is None:
                sn = server_nodes[0]
                assigned_srcs[chosen_src] = (sn, {'path': [chosen_src] if chosen_src == sn else [], 'p_lat': 1e9, 'p_ene': 1e9})
                unassigned.remove(chosen_src)
                step += 1
                continue
            chosen_best = (best_score, best_choice[0], best_choice[1])

        _, s_node, cand = chosen_best
        assigned_srcs[chosen_src] = (s_node, cand)
        srv_loads[s_node] += demands[chosen_src]
        unassigned.remove(chosen_src)
        step += 1

    # --- 6. Refinement Pass ---
    for _ in range(1): # Single pass for stability
        for src in task_sources:
            old_s, old_c = assigned_srcs[src]
            srv_loads[old_s] -= task_info[src][0] * task_info[src][2]

            best_score = float('inf')
            best_choice = (old_s, old_c)
            for s_node, cands in all_cands[src].items():
                for c in cands:
                    score = eval_marginal(src, s_node, c, srv_loads[s_node])
                    if score < best_score:
                        best_score = score
                        best_choice = (s_node, c)

            s_node, cand = best_choice
            assigned_srcs[src] = (s_node, cand)
            srv_loads[s_node] += task_info[src][0] * task_info[src][2]

    # --- 7. Final Output ---
    return {src: {"server": assigned_srcs[src][0], "path": assigned_srcs[src][1]['path']} for src in task_sources}
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