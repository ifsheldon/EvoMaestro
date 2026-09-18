import os
import argparse
import sys
from typing import Tuple, Optional, List, Dict, Any

from shinka.core import run_shinka_eval

def get_empty_kwargs(run_index: int) -> Dict[str, Any]:
    return {}

def aggregate_mop_metrics(
    results: List[Tuple[float, float, float, float]], results_dir: str
) -> Dict[str, Any]:
    """
    聚合 MOP 结果. 参数包含 avg_f1, avg_f2, avg_f3, final_score.
    Shinka 是一个 *强行* 必须最大化的框架 (越高越好). 
    而我们的 MOP 返回的 final_score 是越小越好.
    所以我们把 combined_score 设为倒数或负数。
    """
    if not results:
        return {"combined_score": -999999999.0, "error": "No results"}

    avg_f1, avg_f2, avg_f3, final_score = results[0]
    
    # 如果代码写错了导致报错或超时返回 inf
    if final_score == float('inf'):
        return {
            "combined_score": -999999999.0, 
            "public": {"status": "Compilation/Runtime Timeout"},
            "private": {}
        }
    
    # 为了让 LLM 获得详细的提示反馈，将各项子指标明文印在 public 里让 AI Scientist 阅读
    public_metrics = {
        "F1 (Distance)": float(avg_f1),
        "F2 (School Noise)": float(avg_f2),
        "F3 (Signal Loss)": float(avg_f3),
        "MOP Multiplier Score": float(final_score),
        "Note": "Lower MOP Multiplier Score is better. The evaluator will map this to -Score for maximization."
    }
    
    metrics = {
        # Shinka 最大化这个字段
        "combined_score": float(-final_score), 
        "public": public_metrics,
        "private": {},
        "text_feedback": f"Your generated function yielded a score of {final_score:.4f} (F1:{avg_f1:.4f}, F2:{avg_f2:.4f}, F3:{avg_f3:.4f}). Try to make this score even LOWER. The system maximizes the negated score: {-final_score:.4f}"
    }

    return metrics

def validate_mop(
    run_output: Tuple[float, float, float, float]
) -> Tuple[bool, Optional[str]]:
    """确保解没出界或没死机异常"""
    avg_f1, avg_f2, avg_f3, final_score = run_output
    if final_score == float('inf'):
        return False, "Evaluation crashed or timed out."
    return True, "Valid score."

def main(program_path: str, results_dir: str):
    os.makedirs(results_dir, exist_ok=True)
    
    def _aggregator_with_context(r):
        return aggregate_mop_metrics(r, results_dir)

    metrics, correct, error_msg = run_shinka_eval(
        program_path=program_path,
        results_dir=results_dir,
        experiment_fn_name="run_experiment",
        num_runs=1,
        get_experiment_kwargs=get_empty_kwargs,
        validate_fn=validate_mop,
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
