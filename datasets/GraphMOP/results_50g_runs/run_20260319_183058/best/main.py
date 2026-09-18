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

    # ----------------------------
    # Graph build (undirected)
    # ----------------------------
    graph = [[] for _ in range(num_nodes)]
    edge_attr = {}
    for u, v, base_latency, energy_cost, capacity in edges:
        bl = float(base_latency)
        ec = float(energy_cost)
        cp = float(capacity)
        graph[u].append((v, bl, ec, cp))
        graph[v].append((u, bl, ec, cp))

        k1 = (u, v)
        k2 = (v, u)
        prev = edge_attr.get(k1)
        if prev is None or (bl + 0.2 * ec) < (prev[0] + 0.2 * prev[1]):
            edge_attr[k1] = (bl, ec, cp)
            edge_attr[k2] = (bl, ec, cp)

    # ----------------------------
    # Helpers
    # ----------------------------
    def queue_delay(load, mu):
        # Strong penalty near saturation to keep stable assignment.
        if load >= 0.985 * mu:
            return 1e6 + 1e4 * (load - 0.985 * mu + 1.0)
        rem = mu - load
        if rem <= 1e-9:
            return 1e6
        return 1.0 / rem

    def dijkstra_server_rooted(server, rep_payload, a_lat, b_en, c_cap):
        dist = [float("inf")] * num_nodes
        parent = [-1] * num_nodes
        dist[server] = 0.0
        hq = [(0.0, server)]
        while hq:
            cd, u = heapq.heappop(hq)
            if cd != dist[u]:
                continue
            for v, base_lat, e_cost, cap in graph[u]:
                tx_lat = base_lat + rep_payload / max(cap, 1e-9)
                tx_en = e_cost * rep_payload
                w = a_lat * tx_lat + b_en * tx_en + c_cap * (rep_payload / max(cap, 1e-9))
                nd = cd + w
                if nd < dist[v]:
                    dist[v] = nd
                    parent[v] = u
                    heapq.heappush(hq, (nd, v))
        return parent, dist

    def reconstruct_to_server(source, server, parent):
        if source == server:
            return [source]
        if source < 0 or source >= num_nodes:
            return []
        cur = source
        seen = {cur}
        path = [cur]
        while cur != server:
            nxt = parent[cur]
            if nxt == -1 or nxt in seen:
                return []
            path.append(nxt)
            seen.add(nxt)
            cur = nxt
        return path

    def path_metrics(path, payload):
        if not path or len(path) == 1:
            return 0.0, 0.0
        lat = 0.0
        en = 0.0
        for i in range(len(path) - 1):
            u, v = path[i], path[i + 1]
            e = edge_attr.get((u, v))
            if e is None:
                return float("inf"), float("inf")
            base_lat, e_cost, cap = e
            lat += base_lat + payload / max(cap, 1e-9)
            en += e_cost * payload
        return lat, en

    def fallback_path(source, target, payload):
        # Single-source shortest path with mixed latency-energy edge weight.
        dist = [float("inf")] * num_nodes
        parent = [-1] * num_nodes
        dist[source] = 0.0
        hq = [(0.0, source)]
        while hq:
            cd, u = heapq.heappop(hq)
            if cd != dist[u]:
                continue
            if u == target:
                break
            for v, base_lat, e_cost, cap in graph[u]:
                w = (base_lat + payload / max(cap, 1e-9)) + 0.6 * (e_cost * payload)
                nd = cd + w
                if nd < dist[v]:
                    dist[v] = nd
                    parent[v] = u
                    heapq.heappush(hq, (nd, v))
        if source == target:
            return [source]
        if parent[target] == -1:
            return []
        path = [target]
        cur = target
        seen = {target}
        while cur != source:
            cur = parent[cur]
            if cur == -1 or cur in seen:
                return []
            seen.add(cur)
            path.append(cur)
        path.reverse()
        return path

    # ----------------------------
    # Precompute multiple server-rooted trees
    # ----------------------------
    payloads = [float(task_info[s][1]) for s in task_sources] if task_sources else [1.0]
    avg_payload = sum(payloads) / max(len(payloads), 1)
    max_payload = max(payloads) if payloads else avg_payload

    blends = [
        # (a_lat, b_en, c_cap, representative_payload)
        (1.00, 0.20, 0.00, avg_payload),
        (1.00, 0.45, 0.00, avg_payload),
        (1.00, 0.80, 0.10, avg_payload),
        (1.00, 0.55, 0.20, 0.7 * avg_payload + 0.3 * max_payload),
    ]

    trees = {srv: [] for srv in server_nodes}
    for srv in server_nodes:
        for a_lat, b_en, c_cap, rep in blends:
            parent, dist = dijkstra_server_rooted(srv, rep, a_lat, b_en, c_cap)
            trees[srv].append((parent, dist))

    # ----------------------------
    # Build candidate set per source
    # ----------------------------
    max_candidates = 12
    candidates = {}
    for s in task_sources:
        payload = float(task_info[s][1])
        cand = []
        for srv in server_nodes:
            for parent, _dist in trees[srv]:
                p = reconstruct_to_server(s, srv, parent)
                if not p:
                    continue
                rlat, ren = path_metrics(p, payload)
                if rlat == float("inf") or ren == float("inf"):
                    continue
                cand.append((srv, p, rlat, ren))

        # Deduplicate by exact (server, path)
        uniq = {}
        for srv, p, rlat, ren in cand:
            key = (srv, tuple(p))
            score = rlat + 0.4 * ren
            prev = uniq.get(key)
            if prev is None or score < (prev[2] + 0.4 * prev[3]):
                uniq[key] = (srv, p, rlat, ren)
        cand = list(uniq.values())

        # If empty, fallback single path per server
        if not cand:
            for srv in server_nodes:
                p = fallback_path(s, srv, payload)
                if not p:
                    continue
                rlat, ren = path_metrics(p, payload)
                cand.append((srv, p, rlat, ren))

        # Keep diverse top candidates
        cand.sort(key=lambda x: (x[2] + 0.45 * x[3], x[2], x[3], len(x[1])))
        candidates[s] = cand[:max_candidates] if cand else []

    # Ensure at least one feasible entry for each source
    for s in task_sources:
        if candidates[s]:
            continue
        srv = server_nodes[0]
        p = [s] if s == srv else fallback_path(s, srv, float(task_info[s][1]))
        if not p:
            p = [s] if s == srv else [s, srv]
        rlat, ren = path_metrics(p, float(task_info[s][1]))
        if rlat == float("inf"):
            rlat, ren = (1e6, 1e6)
        candidates[s] = [(srv, p, rlat, ren)]

    # ----------------------------
    # Load-aware assignment
    # ----------------------------
    work = {s: float(task_info[s][0]) * float(task_info[s][2]) for s in task_sources}
    server_load = {srv: 0.0 for srv in server_nodes}
    server_users = {srv: 0 for srv in server_nodes}
    assign_idx = {}

    ranked_sources = sorted(task_sources, key=lambda s: work[s], reverse=True)

    for s in ranked_sources:
        w = work[s]
        best_i = 0
        best_val = float("inf")
        for i, (srv, p, rlat, ren) in enumerate(candidates[s]):
            mu, idle_p, dyn_p = server_info[srv]
            mu = float(mu)
            pred = server_load[srv] + w
            if pred >= 0.992 * mu:
                continue
            util = pred / max(mu, 1e-9)
            qd = queue_delay(pred, mu)
            comp_en = float(dyn_p) * (w / max(mu, 1e-9))
            if server_users[srv] == 0:
                comp_en += 0.15 * float(idle_p)
            val = rlat + qd + 0.42 * (ren + comp_en) + 0.6 * util
            if val < best_val:
                best_val = val
                best_i = i

        assign_idx[s] = best_i
        srv = candidates[s][best_i][0]
        server_load[srv] += w
        server_users[srv] += 1

    # ----------------------------
    # One-pass local improvement (heavy tasks first)
    # ----------------------------
    for s in ranked_sources:
        old_i = assign_idx[s]
        old_srv = candidates[s][old_i][0]
        w = work[s]

        server_load[old_srv] -= w
        server_users[old_srv] -= 1

        best_i = old_i
        best_val = float("inf")
        for i, (srv, p, rlat, ren) in enumerate(candidates[s]):
            mu, idle_p, dyn_p = server_info[srv]
            mu = float(mu)
            pred = server_load[srv] + w
            if pred >= 0.994 * mu:
                continue
            util = pred / max(mu, 1e-9)
            qd = queue_delay(pred, mu)
            comp_en = float(dyn_p) * (w / max(mu, 1e-9))
            if server_users[srv] == 0:
                comp_en += 0.12 * float(idle_p)
            val = rlat + qd + 0.44 * (ren + comp_en) + 0.5 * util
            if val < best_val:
                best_val = val
                best_i = i

        assign_idx[s] = best_i
        new_srv = candidates[s][best_i][0]
        server_load[new_srv] += w
        server_users[new_srv] += 1

    # ----------------------------
    # Build output
    # ----------------------------
    plan = {}
    for s in task_sources:
        srv, p, _rlat, _ren = candidates[s][assign_idx[s]]
        if not p:
            p = [s] if s == srv else fallback_path(s, srv, float(task_info[s][1]))
            if not p:
                p = [s] if s == srv else [s, srv]
        plan[s] = {"server": srv, "path": p}

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