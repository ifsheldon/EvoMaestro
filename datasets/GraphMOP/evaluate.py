import argparse
import os
from typing import Any, Dict, List, Optional, Tuple

from shinka.core import run_shinka_eval


def get_empty_kwargs(run_index: int) -> Dict[str, Any]:
    del run_index
    return {}


def aggregate_graph_metrics(
    results: List[Tuple[float, float, float]], results_dir: str
) -> Dict[str, Any]:
    del results_dir
    if not results:
        return {"combined_score": -999999999.0, "error": "No results"}

    avg_latency, avg_energy, final_score = results[0]
    if final_score == float("inf"):
        return {
            "combined_score": -999999999.0,
            "public": {"status": "Compilation/Runtime Timeout"},
            "private": {},
        }

    public_metrics = {
        "Latency": float(avg_latency),
        "Energy": float(avg_energy),
        "Graph MOP Score": float(final_score),
        "Note": "Lower latency, lower energy, and lower final score are better.",
    }
    return {
        "combined_score": float(-final_score),
        "public": public_metrics,
        "private": {},
        "text_feedback": (
            "Your routing function yielded "
            f"score={final_score:.6f}, latency={avg_latency:.6f}, energy={avg_energy:.6f}. "
            "Try to lower both latency and energy simultaneously while keeping valid paths."
        ),
    }


def validate_graph_solution(run_output: Tuple[float, float, float]) -> Tuple[bool, Optional[str]]:
    _avg_latency, _avg_energy, final_score = run_output
    if final_score == float("inf"):
        return False, "Evaluation crashed, timed out, or produced an invalid routing plan."
    return True, "Valid score."


def main(program_path: str, results_dir: str):
    os.makedirs(results_dir, exist_ok=True)

    def _aggregator_with_context(r):
        return aggregate_graph_metrics(r, results_dir)

    metrics, correct, error_msg = run_shinka_eval(
        program_path=program_path,
        results_dir=results_dir,
        experiment_fn_name="run_experiment",
        num_runs=1,
        get_experiment_kwargs=get_empty_kwargs,
        validate_fn=validate_graph_solution,
        aggregate_metrics_fn=_aggregator_with_context,
    )

    if correct:
        print("Evaluation completed successfully.")
    else:
        print(f"Evaluation failed: {error_msg}")

    print("Metrics:")
    for key, value in metrics.items():
        print(f"  {key}: {value}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--program_path", type=str, default="initial.py")
    parser.add_argument("--results_dir", type=str, default="results")
    parsed_args = parser.parse_args()
    main(parsed_args.program_path, parsed_args.results_dir)
