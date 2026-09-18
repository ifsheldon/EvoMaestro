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

    # Build adjacency list for undirected graph
    graph = [[] for _ in range(num_nodes)]
    for u, v, base_latency, energy_cost, capacity in edges:
        graph[u].append((v, base_latency, energy_cost, capacity))
        graph[v].append((u, base_latency, energy_cost, capacity))

    # Precompute server-rooted shortest path trees.
    # The routing weight blends latency and energy, closer to the stronger baseline.
    server_trees = {}
    route_alpha = 0.32

    for srv in server_nodes:
        dist = [float("inf")] * num_nodes
        parent = [-1] * num_nodes
        lat_sum = [0.0] * num_nodes
        eng_sum = [0.0] * num_nodes
        hops = [10**9] * num_nodes

        dist[srv] = 0.0
        hops[srv] = 0
        heap = [(0.0, 0.0, 0, srv)]  # blended_dist, pure_latency, hop_count, node

        while heap:
            cur_d, cur_lat, cur_hops, u = heapq.heappop(heap)
            if cur_d != dist[u] or cur_hops != hops[u]:
                continue

            for v, b_lat, e_cost, _cap in graph[u]:
                nd = cur_d + b_lat + route_alpha * e_cost
                nl = cur_lat + b_lat
                nh = cur_hops + 1

                # Prefer lower blended cost, then lower latency, then fewer hops
                if (
                    nd < dist[v]
                    or (nd == dist[v] and nl < lat_sum[v])
                    or (nd == dist[v] and nl == lat_sum[v] and nh < hops[v])
                ):
                    dist[v] = nd
                    lat_sum[v] = nl
                    eng_sum[v] = eng_sum[u] + e_cost
                    hops[v] = nh
                    parent[v] = u
                    heapq.heappush(heap, (nd, nl, nh, v))

        server_trees[srv] = {
            "dist": dist,
            "parent": parent,
            "lat": lat_sum,
            "eng": eng_sum,
            "hops": hops,
        }

    # Helpers
    def reconstruct_path(src, srv):
        tree = server_trees[srv]
        if tree["dist"][src] == float("inf"):
            return []
        path = []
        cur = src
        seen = set()
        while cur != -1:
            path.append(cur)
            if cur == srv:
                return path
            if cur in seen:
                return []
            seen.add(cur)
            cur = tree["parent"][cur]
        return []

    def load_increment(src):
        arrival_rate, _payload_size, compute_demand = task_info[src]
        return arrival_rate * compute_demand

    def server_score(src, srv, current_load, extra_load):
        tree = server_trees[srv]
        if tree["dist"][src] == float("inf"]:
            return float("inf")

        service_rate, idle_power, dynamic_power = server_info[srv]
        new_load = current_load + extra_load

        # Soft feasibility cutoff; keep some headroom to avoid queue blow-up.
        if new_load >= 0.92 * service_rate:
            return float("inf")

        util = new_load / service_rate
        residual = service_rate - new_load

        # Routing terms
        t_lat = tree["lat"][src]
        r_eng = tree["eng"][src]
        hop_pen = tree["hops"][src]

        # Queueing pressure term: stable, monotone, cheaper than a more complex model
        # and usually robust across test graphs.
        q_delay = 1.0 / residual

        # Compute-energy proxy: dynamic grows with utilization, idle lightly penalized.
        # We blend both direct route metrics and server-side costs.
        score = (
            1.00 * t_lat
            + 0.62 * r_eng
            + 0.10 * hop_pen
            + 1.35 * q_delay
            + 0.045 * dynamic_power * util
            + 0.006 * idle_power
        )
        return score

    # Candidate servers per source: small top-k by precomputed route quality
    # to reduce noisy choices during refinement while preserving diversity.
    candidate_servers = {}
    for src in task_sources:
        ranked = []
        for srv in server_nodes:
            d = server_trees[srv]["dist"][src]
            if d != float("inf"):
                ranked.append((d, server_trees[srv]["lat"][src], server_trees[srv]["eng"][src], srv))
        ranked.sort()
        # Keep a few strong options
        candidate_servers[src] = [srv for _d, _l, _e, srv in ranked[: min(4, len(ranked))]]

    # Initial greedy assignment: larger tasks first
    ranked_sources = sorted(
        task_sources,
        key=lambda src: (
            task_info[src][0] * task_info[src][2],
            task_info[src][0],
        ),
        reverse=True,
    )

    projected_load = {srv: 0.0 for srv in server_nodes}
    assignment = {}

    for src in ranked_sources:
        inc = load_increment(src)
        best_srv = None
        best_val = float("inf")

        candidates = candidate_servers[src]
        if not candidates:
            candidates = list(server_nodes)

        for srv in candidates:
            val = server_score(src, srv, projected_load[srv], inc)
            if val < best_val:
                best_val = val
                best_srv = srv

        # Broader fallback if all preferred candidates fail due to load cutoff
        if best_srv is None:
            for srv in server_nodes:
                val = server_score(src, srv, projected_load[srv], inc)
                if val < best_val:
                    best_val = val
                    best_srv = srv

        # Final fallback: nearest reachable server by precomputed route
        if best_srv is None:
            reachable = [srv for srv in server_nodes if server_trees[srv]["dist"][src] != float("inf")]
            if reachable:
                best_srv = min(
                    reachable,
                    key=lambda s: (
                        server_trees[s]["lat"][src] + route_alpha * server_trees[s]["eng"][src],
                        server_trees[s]["hops"][src],
                    ),
                )
            else:
                best_srv = server_nodes[0]

        assignment[src] = best_srv
        projected_load[best_srv] += inc

    # Lightweight local improvement:
    # revisit sources and move to an alternate server if approximate total score improves.
    for _ in range(2):
        improved = False
        revisit = sorted(
            task_sources,
            key=lambda src: (
                task_info[src][0] * task_info[src][2],
                server_trees[assignment[src]]["lat"][src]
                if server_trees[assignment[src]]["dist"][src] != float("inf")
                else float("inf"),
            ),
            reverse=True,
        )

        for src in revisit:
            cur_srv = assignment[src]
            inc = load_increment(src)

            cur_local = server_score(src, cur_srv, projected_load[cur_srv] - inc, inc)
            best_srv = cur_srv
            best_gain = 0.0

            candidates = candidate_servers[src]
            if cur_srv not in candidates:
                candidates = candidates + [cur_srv]

            for alt_srv in candidates:
                if alt_srv == cur_srv:
                    continue

                alt_local = server_score(src, alt_srv, projected_load[alt_srv], inc)
                if alt_local == float("inf"):
                    continue

                gain = cur_local - alt_local
                if gain > best_gain + 1e-12:
                    best_gain = gain
                    best_srv = alt_srv

            if best_srv != cur_srv:
                projected_load[cur_srv] -= inc
                projected_load[best_srv] += inc
                assignment[src] = best_srv
                improved = True

        if not improved:
            break

    # Build final plan
    plan = {}
    for src in task_sources:
        srv = assignment[src]
        path = reconstruct_path(src, srv)

        # Safety fallback to ensure a valid simple path whenever possible
        if not path:
            reachable = [s for s in server_nodes if server_trees[s]["dist"][src] != float("inf")]
            if reachable:
                srv = min(
                    reachable,
                    key=lambda s: (
                        server_trees[s]["lat"][src] + route_alpha * server_trees[s]["eng"][src],
                        server_trees[s]["hops"][src],
                    ),
                )
                path = reconstruct_path(src, srv)

        plan[src] = {"server": srv, "path": path}

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
