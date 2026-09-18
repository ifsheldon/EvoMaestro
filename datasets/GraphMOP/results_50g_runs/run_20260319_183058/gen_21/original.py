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

    Returns:
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

    # -----------------------------
    # Graph construction
    # -----------------------------
    graph = [[] for _ in range(num_nodes)]
    edge_map = {}
    for u, v, base_latency, energy_cost, capacity in edges:
        graph[u].append((v, base_latency, energy_cost, capacity))
        graph[v].append((u, base_latency, energy_cost, capacity))
        edge_map[(u, v)] = (base_latency, energy_cost, capacity)
        edge_map[(v, u)] = (base_latency, energy_cost, capacity)

    servers = list(server_nodes)
    sources = list(task_sources)

    # -----------------------------
    # Path utilities
    # -----------------------------
    def reconstruct_path(parent, source, target):
        if source == target:
            return [source]
        if parent[target] == -1:
            return []
        out = [target]
        cur = target
        while cur != source:
            cur = parent[cur]
            if cur == -1:
                return []
            out.append(cur)
        out.reverse()
        return out

    def path_metrics(path, payload):
        if not path or len(path) == 1:
            return 0.0, 0.0
        latency = 0.0
        energy = 0.0
        for a, b in zip(path, path[1:]):
            base_latency, edge_energy, capacity = edge_map[(a, b)]
            cap = capacity if capacity and capacity > 1e-9 else 1e-9
            # Include transmission effect from payload/capacity.
            latency += base_latency + payload / cap
            # Mild payload-aware routing energy.
            energy += edge_energy * (1.0 + 0.08 * payload / cap)
        return latency, energy

    def dijkstra_from_server(server, mode):
        # Different edge preferences produce a small candidate frontier.
        # mode 0: latency focused
        # mode 1: balanced
        # mode 2: energy focused
        dist = [float("inf")] * num_nodes
        parent = [-1] * num_nodes
        dist[server] = 0.0
        pq = [(0.0, server)]

        while pq:
            curd, u = heapq.heappop(pq)
            if curd != dist[u]:
                continue
            for v, base_latency, edge_energy, capacity in graph[u]:
                cap = capacity if capacity and capacity > 1e-9 else 1e-9
                congestion_proxy = 1.0 / math.sqrt(cap)
                if mode == 0:
                    w = 1.35 * base_latency + 0.10 * edge_energy + 0.25 * congestion_proxy
                elif mode == 1:
                    w = 1.00 * base_latency + 0.55 * edge_energy + 0.22 * congestion_proxy
                else:
                    w = 0.60 * base_latency + 1.05 * edge_energy + 0.18 * congestion_proxy
                nd = curd + w
                if nd < dist[v]:
                    dist[v] = nd
                    parent[v] = u
                    heapq.heappush(pq, (nd, v))
        return parent

    # -----------------------------
    # Candidate generation
    # -----------------------------
    # For each (source, server), keep the best candidate among several
    # server-centric shortest path trees.
    candidates = {src: {} for src in sources}

    for server in servers:
        parent_sets = [dijkstra_from_server(server, mode) for mode in (0, 1, 2)]

        for src in sources:
            arrival_rate, payload_size, compute_demand = task_info[src]
            best = None
            seen = set()

            for parent in parent_sets:
                path = reconstruct_path(parent, server, src)
                if not path:
                    continue
                path = list(reversed(path))  # source -> ... -> server
                tpath = tuple(path)
                if tpath in seen:
                    continue
                seen.add(tpath)

                route_latency, route_energy = path_metrics(path, payload_size)
                service_rate, idle_power, dynamic_power = server_info[server]
                demand = arrival_rate * compute_demand

                # Path-only baseline candidate. Queueing is added later based on current load.
                baseline = (
                    1.00 * route_latency
                    + 0.85 * route_energy
                    + 0.03 * dynamic_power * (demand / max(service_rate, 1e-9))
                    + 0.002 * idle_power
                )

                cand = {
                    "server": server,
                    "path": path,
                    "route_latency": route_latency,
                    "route_energy": route_energy,
                    "demand": demand,
                    "service_rate": service_rate,
                    "idle_power": idle_power,
                    "dynamic_power": dynamic_power,
                    "baseline": baseline,
                }
                if best is None or cand["baseline"] < best["baseline"]:
                    best = cand

            if best is not None:
                candidates[src][server] = best

    # Fallback reachability handling
    for src in sources:
        if candidates[src]:
            continue
        # If no candidate was found, try an unweighted BFS-like shortest hop path to any server.
        # This should be rare but preserves validity.
        best = None
        for server in servers:
            dist = [-1] * num_nodes
            parent = [-1] * num_nodes
            q = [src]
            dist[src] = 0
            qi = 0
            while qi < len(q):
                u = q[qi]
                qi += 1
                if u == server:
                    break
                for v, _, _, _ in graph[u]:
                    if dist[v] == -1:
                        dist[v] = dist[u] + 1
                        parent[v] = u
                        q.append(v)
            path = reconstruct_path(parent, src, server)
            if not path:
                continue
            arrival_rate, payload_size, compute_demand = task_info[src]
            route_latency, route_energy = path_metrics(path, payload_size)
            service_rate, idle_power, dynamic_power = server_info[server]
            demand = arrival_rate * compute_demand
            cand = {
                "server": server,
                "path": path,
                "route_latency": route_latency,
                "route_energy": route_energy,
                "demand": demand,
                "service_rate": service_rate,
                "idle_power": idle_power,
                "dynamic_power": dynamic_power,
                "baseline": route_latency + route_energy,
            }
            if best is None or cand["baseline"] < best["baseline"]:
                best = cand
        if best is not None:
            candidates[src][best["server"]] = best

    # -----------------------------
    # Surrogate scoring
    # -----------------------------
    util_limit = 0.93

    def marginal_score(cand, current_load):
        mu = max(cand["service_rate"], 1e-9)
        lam0 = current_load
        lam1 = current_load + cand["demand"]

        util1 = lam1 / mu
        overload_penalty = 0.0
        if util1 >= util_limit:
            overload_penalty = 5000.0 * (util1 - util_limit + 1e-6)

        # Incremental queueing pressure using a smooth M/M/1-inspired term.
        slack0 = max(mu - lam0, 1e-6)
        slack1 = max(mu - lam1, 1e-6)
        queue_delta = (1.0 / slack1) - (1.0 / slack0)

        # Server compute energy marginal.
        energy_delta = cand["dynamic_power"] * (cand["demand"] / mu)

        # Small shared idle component to discourage activating weak choices.
        idle_term = 0.004 * cand["idle_power"]

        return (
            1.00 * cand["route_latency"]
            + 0.92 * cand["route_energy"]
            + 1.80 * queue_delta
            + 0.22 * energy_delta
            + idle_term
            + overload_penalty
        )

    # -----------------------------
    # Regret-based assignment
    # -----------------------------
    server_load = {s: 0.0 for s in servers}
    unassigned = set(sources)
    plan = {}

    def ranked_options(src):
        opts = []
        for server, cand in candidates[src].items():
            score = marginal_score(cand, server_load[server])
            opts.append((score, server, cand))
        opts.sort(key=lambda x: (x[0], len(x[2]["path"])))
        return opts

    while unassigned:
        chosen_src = None
        chosen_opts = None
        best_regret = -float("inf")
        best_primary = float("inf")

        for src in list(unassigned):
            opts = ranked_options(src)
            if not opts:
                continue
            primary = opts[0][0]
            secondary = opts[1][0] if len(opts) > 1 else primary + 10.0
            regret = secondary - primary

            # Prefer large regret; break ties by worse primary score first.
            if regret > best_regret or (regret == best_regret and primary < best_primary):
                best_regret = regret
                best_primary = primary
                chosen_src = src
                chosen_opts = opts

        if chosen_src is None:
            break

        # Pick first feasible candidate; if all are overloaded, still pick the least bad.
        picked = chosen_opts[0]
        for opt in chosen_opts:
            _, server, cand = opt
            if (server_load[server] + cand["demand"]) / max(cand["service_rate"], 1e-9) < 0.985:
                picked = opt
                break

        _, server, cand = picked
        plan[chosen_src] = {"server": server, "path": cand["path"]}
        server_load[server] += cand["demand"]
        unassigned.remove(chosen_src)

    # Safety fallback for any remaining source
    for src in unassigned:
        best = None
        for server, cand in candidates[src].items():
            sc = marginal_score(cand, server_load[server])
            if best is None or sc < best[0]:
                best = (sc, server, cand)
        if best is not None:
            _, server, cand = best
            plan[src] = {"server": server, "path": cand["path"]}
            server_load[server] += cand["demand"]

    # -----------------------------
    # Local improvement passes
    # -----------------------------
    def assignment_cost(src, server, load_without_src, load_with_src):
        cand = candidates[src][server]
        mu = max(cand["service_rate"], 1e-9)

        util = load_with_src / mu
        overload_penalty = 0.0
        if util >= util_limit:
            overload_penalty = 5000.0 * (util - util_limit + 1e-6)

        slack0 = max(mu - load_without_src, 1e-6)
        slack1 = max(mu - load_with_src, 1e-6)
        queue_delta = (1.0 / slack1) - (1.0 / slack0)
        energy_delta = cand["dynamic_power"] * (cand["demand"] / mu)

        return (
            1.00 * cand["route_latency"]
            + 0.92 * cand["route_energy"]
            + 1.80 * queue_delta
            + 0.22 * energy_delta
            + 0.004 * cand["idle_power"]
            + overload_penalty
        )

    for _ in range(2):
        improved = False
        # Visit harder tasks first.
        ordered = sorted(
            plan.keys(),
            key=lambda src: task_info[src][0] * task_info[src][2],
            reverse=True,
        )

        for src in ordered:
            cur_server = plan[src]["server"]
            cur_cand = candidates[src].get(cur_server)
            if cur_cand is None:
                continue

            demand = cur_cand["demand"]
            cur_load_after = server_load[cur_server]
            cur_load_before = cur_load_after - demand
            current_cost = assignment_cost(src, cur_server, cur_load_before, cur_load_after)

            best_move = None
            best_gain = 0.0

            for new_server, cand in candidates[src].items():
                if new_server == cur_server:
                    continue
                new_load_before = server_load[new_server]
                new_load_after = new_load_before + cand["demand"]

                new_cost = assignment_cost(src, new_server, new_load_before, new_load_after)

                # Also account for relieving queue pressure on current server.
                relief = 0.0
                mu_cur = max(cur_cand["service_rate"], 1e-9)
                slack_before = max(mu_cur - cur_load_before, 1e-6)
                slack_after = max(mu_cur - cur_load_after, 1e-6)
                relief = 1.50 * ((1.0 / slack_after) - (1.0 / slack_before))

                gain = current_cost - new_cost + relief
                if gain > best_gain:
                    best_gain = gain
                    best_move = (new_server, cand)

            if best_move is not None and best_gain > 1e-9:
                new_server, new_cand = best_move
                server_load[cur_server] -= demand
                server_load[new_server] += new_cand["demand"]
                plan[src] = {"server": new_server, "path": new_cand["path"]}
                improved = True

        if not improved:
            break

    # Final validity fallback
    for src in sources:
        if src not in plan:
            # Choose any valid candidate if somehow missing.
            chosen = None
            for server, cand in candidates[src].items():
                if cand["path"]:
                    chosen = (server, cand["path"])
                    break
            if chosen is None:
                # Degenerate fallback; source as singleton path if impossible.
                chosen = (servers[0], [src] if src == servers[0] else [])
            plan[src] = {"server": chosen[0], "path": chosen[1]}

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
