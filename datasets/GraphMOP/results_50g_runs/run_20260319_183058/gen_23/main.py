# EVOLVE-BLOCK-START
<NAME>
exact_marginal_cost_routing
</NAME>

<DESCRIPTION>
Combines diverse server-rooted tree path generation with an exact marginal cost evaluation for queueing delay and energy. Uses regret-based ordering for the initial greedy assignment and performs multiple passes of local search refinement to monotonically minimize the global objective.
</DESCRIPTION>

<CODE>
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