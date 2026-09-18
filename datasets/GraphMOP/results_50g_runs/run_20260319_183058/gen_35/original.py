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
    }
    """
    import heapq
    import math

    # ------------------------------------------------------------
    # Tunable parameters
    # ------------------------------------------------------------
    # Path-generation modes: (latency_weight, energy_weight, congestion_weight)
    PATH_MODES = (
        (1.55, 0.08, 0.24),  # latency focused
        (1.10, 0.35, 0.20),  # balanced
        (0.80, 0.72, 0.17),  # energy aware
        (0.55, 1.05, 0.13),  # strongly energy focused
    )

    # Surrogate objective weights
    LAT_W = 1.00
    EN_W = 0.88
    DYN_W = 0.20
    QUEUE_W = 0.72
    ACT_W = 0.020

    # Utilization controls
    SOFT_UTIL = 0.90
    HARD_UTIL = 0.985

    # Improvement iterations
    LOCAL_PASSES = 4

    # ------------------------------------------------------------
    # Graph construction
    # ------------------------------------------------------------
    graph = [[] for _ in range(num_nodes)]
    edge_map = {}
    for u, v, base_latency, energy_cost, capacity in edges:
        graph[u].append((v, base_latency, energy_cost, capacity))
        graph[v].append((u, base_latency, energy_cost, capacity))
        edge_map[(u, v)] = (base_latency, energy_cost, capacity)
        edge_map[(v, u)] = (base_latency, energy_cost, capacity)

    servers = list(server_nodes)
    sources = list(task_sources)

    # ------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------
    def reconstruct_path(parent, source, target):
        if source == target:
            return [source]
        if target < 0 or target >= len(parent) or parent[target] == -1:
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

    def path_metrics(path, payload):
        if not path or len(path) <= 1:
            return 0.0, 0.0
        latency = 0.0
        energy = 0.0
        for a, b in zip(path, path[1:]):
            base_latency, edge_energy, capacity = edge_map[(a, b)]
            cap = capacity if capacity and capacity > 1e-9 else 1e-9
            latency += base_latency + payload / cap
            energy += edge_energy * (1.0 + 0.08 * payload / cap)
        return latency, energy

    def dijkstra_from_server(server, mode_tuple):
        lat_w, en_w, cong_w = mode_tuple
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
                cong = 1.0 / math.sqrt(cap)
                w = lat_w * base_latency + en_w * edge_energy + cong_w * cong
                nd = curd + w
                if nd < dist[v]:
                    dist[v] = nd
                    parent[v] = u
                    heapq.heappush(pq, (nd, v))
        return parent

    def bfs_path(src, dst):
        if src == dst:
            return [src]
        parent = [-1] * num_nodes
        seen = [False] * num_nodes
        q = [src]
        seen[src] = True
        qi = 0
        while qi < len(q):
            u = q[qi]
            qi += 1
            if u == dst:
                break
            for v, _, _, _ in graph[u]:
                if not seen[v]:
                    seen[v] = True
                    parent[v] = u
                    q.append(v)
        return reconstruct_path(parent, src, dst)

    # ------------------------------------------------------------
    # Candidate generation
    # Few servers, many sources => server-rooted trees are efficient.
    # ------------------------------------------------------------
    candidates = {src: {} for src in sources}

    for server in servers:
        parent_sets = [dijkstra_from_server(server, mode) for mode in PATH_MODES]

        for src in sources:
            arrival_rate, payload_size, compute_demand = task_info[src]
            demand = arrival_rate * compute_demand
            service_rate, idle_power, dynamic_power = server_info[server]

            best = None
            seen_paths = set()

            for parent in parent_sets:
                path_srvtosrc = reconstruct_path(parent, server, src)
                if not path_srvtosrc:
                    continue
                path = list(reversed(path_srvtosrc))  # src -> ... -> server
                tpath = tuple(path)
                if tpath in seen_paths:
                    continue
                seen_paths.add(tpath)

                route_latency, route_energy = path_metrics(path, payload_size)
                # Baseline route+compute estimate before server-load interactions.
                base_score = (
                    LAT_W * route_latency
                    + EN_W * route_energy
                    + DYN_W * dynamic_power * (demand / max(service_rate, 1e-9))
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
                    "base_score": base_score,
                }
                if best is None or cand["base_score"] < best["base_score"]:
                    best = cand

            if best is not None:
                candidates[src][server] = best

    # Reachability fallback
    for src in sources:
        if candidates[src]:
            continue
        arrival_rate, payload_size, compute_demand = task_info[src]
        demand = arrival_rate * compute_demand
        best = None
        for server in servers:
            path = bfs_path(src, server)
            if not path:
                continue
            route_latency, route_energy = path_metrics(path, payload_size)
            service_rate, idle_power, dynamic_power = server_info[server]
            cand = {
                "server": server,
                "path": path,
                "route_latency": route_latency,
                "route_energy": route_energy,
                "demand": demand,
                "service_rate": service_rate,
                "idle_power": idle_power,
                "dynamic_power": dynamic_power,
                "base_score": route_latency + route_energy,
            }
            if best is None or cand["base_score"] < best["base_score"]:
                best = cand
        if best is not None:
            candidates[src][best["server"]] = best

    # ------------------------------------------------------------
    # Server state surrogate
    # ------------------------------------------------------------
    def server_state_cost(server, load):
        mu, idle_power, dynamic_power = server_info[server]
        mu = max(mu, 1e-9)
        util = load / mu

        # Hard penalty for unstable queues / overload
        if util >= HARD_UTIL:
            return 1e6 + 1e5 * (util - HARD_UTIL + 1e-9)

        # Convex queue pressure, still mild at low utilization
        slack = max(mu - load, 1e-6)
        queue_term = load / slack

        # Soft pressure approaching high utilization
        soft_penalty = 0.0
        if util > SOFT_UTIL:
            x = util - SOFT_UTIL
            soft_penalty = 40.0 * x * x

        active = 1.0 if load > 1e-12 else 0.0

        return (
            QUEUE_W * queue_term
            + DYN_W * dynamic_power * util
            + ACT_W * idle_power * active
            + soft_penalty
        )

    def assignment_delta(src, cand, server_load):
        s = cand["server"]
        old_load = server_load[s]
        new_load = old_load + cand["demand"]
        return (
            LAT_W * cand["route_latency"]
            + EN_W * cand["route_energy"]
            + server_state_cost(s, new_load)
            - server_state_cost(s, old_load)
        )

    # ------------------------------------------------------------
    # Regret-aware construction
    # ------------------------------------------------------------
    plan = {}
    server_load = {s: 0.0 for s in servers}
    unassigned = set(sources)

    # Demand scale for ordering
    source_demand = {
        src: task_info[src][0] * task_info[src][2]
        for src in sources
    }
    max_demand = max([source_demand[src] for src in sources] + [1.0])

    def ranked_options(src):
        opts = []
        for server, cand in candidates[src].items():
            delta = assignment_delta(src, cand, server_load)
            opts.append((delta, server, cand))
        opts.sort(key=lambda x: (x[0], len(x[2]["path"])))
        return opts

    while unassigned:
        chosen_src = None
        chosen_opts = None
        chosen_priority = -float("inf")

        for src in list(unassigned):
            opts = ranked_options(src)
            if not opts:
                continue

            best_score = opts[0][0]
            second_score = opts[1][0] if len(opts) > 1 else best_score + 5.0
            regret = second_score - best_score
            demand_factor = source_demand[src] / max_demand

            # Regret-aware order, emphasizing high-demand tasks.
            priority = regret * (1.0 + 0.55 * demand_factor) + 0.08 * best_score

            if priority > chosen_priority:
                chosen_priority = priority
                chosen_src = src
                chosen_opts = opts

        if chosen_src is None:
            break

        picked = chosen_opts[0]

        # Prefer feasible-under-hard-util first; otherwise take least bad.
        for opt in chosen_opts:
            _, server, cand = opt
            mu = max(cand["service_rate"], 1e-9)
            if (server_load[server] + cand["demand"]) / mu < HARD_UTIL:
                picked = opt
                break

        _, server, cand = picked
        plan[chosen_src] = {"server": server, "path": cand["path"]}
        server_load[server] += cand["demand"]
        unassigned.remove(chosen_src)

    # Safety fallback if anything remains
    for src in list(unassigned):
        best = None
        for server, cand in candidates[src].items():
            sc = assignment_delta(src, cand, server_load)
            if best is None or sc < best[0]:
                best = (sc, server, cand)
        if best is not None:
            _, server, cand = best
            plan[src] = {"server": server, "path": cand["path"]}
            server_load[server] += cand["demand"]
            unassigned.remove(src)

    # ------------------------------------------------------------
    # Local relocation improvement using exact surrogate deltas
    # ------------------------------------------------------------
    def relocation_gain(src, new_server):
        cur_server = plan[src]["server"]
        if cur_server == new_server:
            return 0.0, None, None

        cur_cand = candidates[src].get(cur_server)
        new_cand = candidates[src].get(new_server)
        if cur_cand is None or new_cand is None:
            return 0.0, None, None

        d = cur_cand["demand"]

        cur_old = server_load[cur_server]
        cur_new = cur_old - d

        new_old = server_load[new_server]
        new_new = new_old + new_cand["demand"]

        old_cost = (
            LAT_W * cur_cand["route_latency"]
            + EN_W * cur_cand["route_energy"]
            + server_state_cost(cur_server, cur_old)
            + server_state_cost(new_server, new_old)
        )

        new_cost = (
            LAT_W * new_cand["route_latency"]
            + EN_W * new_cand["route_energy"]
            + server_state_cost(cur_server, cur_new)
            + server_state_cost(new_server, new_new)
        )

        gain = old_cost - new_cost
        return gain, cur_cand, new_cand

    for _ in range(LOCAL_PASSES):
        improved = False

        ordered_sources = sorted(
            plan.keys(),
            key=lambda src: source_demand.get(src, 0.0),
            reverse=True,
        )

        for src in ordered_sources:
            cur_server = plan[src]["server"]
            best_gain = 0.0
            best_target = None
            best_new_cand = None
            best_cur_cand = None

            for new_server in candidates[src].keys():
                if new_server == cur_server:
                    continue
                gain, cur_cand, new_cand = relocation_gain(src, new_server)
                if gain > best_gain + 1e-12:
                    best_gain = gain
                    best_target = new_server
                    best_new_cand = new_cand
                    best_cur_cand = cur_cand

            if best_target is not None:
                server_load[cur_server] -= best_cur_cand["demand"]
                server_load[best_target] += best_new_cand["demand"]
                plan[src] = {"server": best_target, "path": best_new_cand["path"]}
                improved = True

        if not improved:
            break

    # ------------------------------------------------------------
    # Final validity fallback
    # ------------------------------------------------------------
    for src in sources:
        if src in plan and plan[src]["path"]:
            continue

        chosen = None
        for server, cand in candidates[src].items():
            if cand["path"] and cand["path"][0] == src and cand["path"][-1] == server:
                chosen = {"server": server, "path": cand["path"]}
                break

        if chosen is None:
            # Last-resort fallback: direct BFS to any reachable server
            for server in servers:
                path = bfs_path(src, server)
                if path:
                    chosen = {"server": server, "path": path}
                    break

        if chosen is None:
            # Degenerate but safe structure if graph is pathological
            fallback_server = servers[0] if servers else src
            chosen = {
                "server": fallback_server,
                "path": [src] if src == fallback_server else [],
            }

        plan[src] = chosen

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