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

    Return:
    {
        source_node: {
            "server": server_node,
            "path": [source_node, ..., server_node],
        },
        ...
    }
    """
    import heapq
    import math

    # ---------- Graph build ----------
    graph = [[] for _ in range(num_nodes)]
    edge_attr = {}
    for u, v, base_latency, energy_cost, capacity in edges:
        graph[u].append((v, base_latency, energy_cost, capacity))
        graph[v].append((u, base_latency, energy_cost, capacity))
        key = (u, v) if u < v else (v, u)
        edge_attr[key] = (base_latency, energy_cost, capacity)

    # ---------- Multi-criteria Dijkstra from each server ----------
    def edge_weight(mode, lat, ene, cap):
        cap_term = 1.0 / (cap + 1e-9)
        if mode == 0:  # latency-focused
            return lat + 0.03 * cap_term + 0.08 * ene
        if mode == 1:  # energy-focused
            return ene + 0.02 * lat + 0.03 * cap_term
        # balanced
        return lat + 0.30 * ene + 0.04 * cap_term

    def dijkstra_from_root(root, mode):
        dist = [float("inf")] * num_nodes
        parent = [-1] * num_nodes
        dist[root] = 0.0
        parent[root] = root
        heap = [(0.0, root)]

        while heap:
            d, u = heapq.heappop(heap)
            if d != dist[u]:
                continue
            for v, lat, ene, cap in graph[u]:
                w = edge_weight(mode, lat, ene, cap)
                nd = d + w
                if nd < dist[v]:
                    dist[v] = nd
                    parent[v] = u
                    heapq.heappush(heap, (nd, v))
        return dist, parent

    # Precompute per-server trees (few servers expected).
    server_trees = {}
    for s in server_nodes:
        trees = []
        for mode in (0, 1, 2):
            dist, parent = dijkstra_from_root(s, mode)
            trees.append((dist, parent))
        server_trees[s] = trees

    def reconstruct_path_from_server_tree(source, server, parent):
        # parent tree rooted at server: follow source -> ... -> server
        if source == server:
            return [source]
        if source < 0 or source >= num_nodes or parent[source] == -1:
            return []
        path = [source]
        cur = source
        seen = {source}
        while cur != server:
            cur = parent[cur]
            if cur == -1 or cur in seen:
                return []
            path.append(cur)
            seen.add(cur)
        return path

    def path_metrics(path, payload):
        # Transmission latency + routing energy approximations.
        # Mildly capacity-aware, robust across varying scales.
        if not path or len(path) == 1:
            return 0.0, 0.0
        tlat = 0.0
        teng = 0.0
        for i in range(len(path) - 1):
            u, v = path[i], path[i + 1]
            key = (u, v) if u < v else (v, u)
            lat, ene, cap = edge_attr[key]
            ratio = payload / (cap + 1e-9)
            tlat += lat + 0.05 * ratio
            teng += ene * (1.0 + 0.02 * ratio)
        return tlat, teng

    def alternative_path_with_penalty(source, target, payload, base_path):
        # One nearby non-tree alternative by penalizing edges from the base path.
        if source == target:
            return [source]
        penalized = set()
        for i in range(len(base_path) - 1):
            a, b = base_path[i], base_path[i + 1]
            penalized.add((a, b) if a < b else (b, a))

        dist = [float("inf")] * num_nodes
        parent = [-1] * num_nodes
        dist[source] = 0.0
        heap = [(0.0, source)]

        while heap:
            d, u = heapq.heappop(heap)
            if d != dist[u]:
                continue
            if u == target:
                break
            for v, lat, ene, cap in graph[u]:
                key = (u, v) if u < v else (v, u)
                ratio = payload / (cap + 1e-9)
                w = lat + 0.22 * ene + 0.03 * ratio
                if key in penalized:
                    w += 0.35 + 0.10 * lat + 0.05 * ene
                nd = d + w
                if nd < dist[v]:
                    dist[v] = nd
                    parent[v] = u
                    heapq.heappush(heap, (nd, v))

        if parent[target] == -1:
            return []

        path = [target]
        cur = target
        seen = {target}
        while cur != source:
            cur = parent[cur]
            if cur == -1 or cur in seen:
                return []
            path.append(cur)
            seen.add(cur)
        path.reverse()
        return path

    def queue_delay(load, service_rate, compute_demand):
        # Stable and smooth queueing proxy: processing + waiting growth as utilization rises.
        if service_rate <= 1e-12:
            return 1e9
        rho = load / service_rate
        if rho >= 0.999:
            return 1e9
        base_proc = compute_demand / service_rate
        return base_proc * (1.0 + rho / max(1e-9, 1.0 - rho))

    def compute_energy(load, service_rate, idle_power, dynamic_power):
        if service_rate <= 1e-12:
            return 1e9
        util = min(1.0, max(0.0, load / service_rate))
        return 0.02 * idle_power + dynamic_power * (util ** 1.15)

    # ---------- Build candidate path sets ----------
    candidates = {}
    for src in task_sources:
        payload = task_info[src][1]
        per_server = {}
        for s in server_nodes:
            server_cands = []
            trees = server_trees[s]
            # up to 3 candidates from the 3 precomputed trees
            for mode in (0, 1, 2):
                _, parent = trees[mode]
                p = reconstruct_path_from_server_tree(src, s, parent)
                if not p:
                    continue
                lat, ene = path_metrics(p, payload)
                server_cands.append((lat, ene, p))

            # Add one nearby non-tree alternative for the best current candidate.
            if server_cands:
                server_cands.sort(key=lambda x: x[0] + 0.45 * x[1] + 0.02 * (len(x[2]) - 1))
                alt = alternative_path_with_penalty(src, s, payload, server_cands[0][2])
                if alt and tuple(alt) != tuple(server_cands[0][2]):
                    lat, ene = path_metrics(alt, payload)
                    server_cands.append((lat, ene, alt))

            # Deduplicate by path signature
            if server_cands:
                uniq = {}
                for lat, ene, p in server_cands:
                    key = tuple(p)
                    cur = uniq.get(key)
                    if cur is None or (lat + 0.5 * ene) < (cur[0] + 0.5 * cur[1]):
                        uniq[key] = (lat, ene, p)
                # Keep only a small elite set per source-server pair.
                kept = list(uniq.values())
                kept.sort(key=lambda x: x[0] + 0.55 * x[1] + 0.02 * (len(x[2]) - 1))
                per_server[s] = kept[:4]
        candidates[src] = per_server

    # ---------- Assignment ----------
    projected_load = {s: 0.0 for s in server_nodes}
    plan = {}

    # Heavier tasks first (greater impact on queue/energy).
    ranked_sources = sorted(
        task_sources,
        key=lambda src: (
            task_info[src][0] * task_info[src][2],  # offered compute load
            task_info[src][1],  # payload
        ),
        reverse=True,
    )

    # Objective balance (latency and energy both important)
    W_LAT = 1.0
    W_ENE = 0.85

    def best_assignment_for_source(src, current_server=None):
        arr, payload, comp = task_info[src]
        demand = arr * comp
        best = None

        per_server = candidates.get(src, {})
        # if no precomputed reachable candidate exists for any server, fallback later
        for s in server_nodes:
            cands = per_server.get(s, [])
            if not cands:
                continue

            service_rate, idle_power, dynamic_power = server_info[s]
            old_load = projected_load[s]
            new_load = old_load + demand
            # soft overload filter
            if new_load >= 0.985 * service_rate:
                continue

            qd = queue_delay(new_load, service_rate, comp)
            ce_before = compute_energy(old_load, service_rate, idle_power, dynamic_power)
            ce_after = compute_energy(new_load, service_rate, idle_power, dynamic_power)
            ce = ce_after - ce_before

            for lat, ene, p in cands:
                # small hop penalty to avoid unnecessarily long paths
                hop_pen = 0.03 * (len(p) - 1)
                score = W_LAT * (lat + qd + hop_pen) + W_ENE * (ene + ce)

                # tiny stickiness bonus in local refinement to reduce churn
                if current_server is not None and s == current_server:
                    score *= 0.998

                if best is None or score < best[0]:
                    best = (score, s, p)

        return best

    # Initial greedy assignment
    for src in ranked_sources:
        arr, payload, comp = task_info[src]
        demand = arr * comp

        best = best_assignment_for_source(src)
        if best is None:
            # Fallback: choose first reachable server candidate, else degenerate self-path.
            chosen_server = None
            chosen_path = []
            per_server = candidates.get(src, {})
            for s in server_nodes:
                cands = per_server.get(s, [])
                if cands:
                    # choose path with best local blend
                    cands.sort(key=lambda x: x[0] + 0.5 * x[1] + 0.03 * (len(x[2]) - 1))
                    chosen_server = s
                    chosen_path = cands[0][2]
                    break
            if chosen_server is None:
                chosen_server = server_nodes[0]
                chosen_path = [src] if src == chosen_server else []
        else:
            _, chosen_server, chosen_path = best

        plan[src] = {"server": chosen_server, "path": chosen_path}
        projected_load[chosen_server] += demand

    # ---------- Restricted server-focused repair pass ----------
    # Instead of broad local search, identify heavily utilized servers and
    # try to offload tasks from them. This focuses refinement on the fragile parts.
    for _pass in range(3):
        server_utils = []
        for s in server_nodes:
            service_rate, _, _ = server_info[s]
            util = projected_load[s] / service_rate
            server_utils.append((util, s))
        server_utils.sort(reverse=True)

        # Identify the most utilized servers (up to 3)
        hot_servers = set(s for u, s in server_utils[:3])

        moved_any = False
        for src in ranked_sources:
            cur_server = plan[src]["server"]
            if cur_server not in hot_servers:
                continue

            arr, payload, comp = task_info[src]
            demand = arr * comp

            projected_load[cur_server] -= demand
            best = best_assignment_for_source(src, current_server=cur_server)

            if best is None:
                projected_load[cur_server] += demand
                continue

            _, new_server, new_path = best
            if new_server != cur_server or new_path != plan[src]["path"]:
                plan[src] = {"server": new_server, "path": new_path}
                projected_load[new_server] += demand
                moved_any = True
            else:
                projected_load[cur_server] += demand

        if not moved_any:
            break

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