"""Simple ShinkaEvolve runner for the MOP example.

Usage:

  # Standard (non-interactive) run
  uv run --locked --all-packages python run_evo.py

  # Interactive run with evomaestro-interface steering (pause/resume, suggest, merge)
  uv run --locked --all-packages python run_evo.py --interactive
"""

import argparse
import asyncio
import os

from dotenv import load_dotenv
from shinka.core import (
    EvolutionConfig,
    ShinkaEvolveInteractiveRunner,
    ShinkaEvolveRunner,
)
from shinka.database import DatabaseConfig
from shinka.launch import LocalJobConfig


def main():
    parser = argparse.ArgumentParser(description="MOP ShinkaEvolve runner (simple)")
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Use the interactive runner with evomaestro-interface steering support.",
    )
    args = parser.parse_args()

    base_dir = os.path.dirname(os.path.abspath(__file__))
    load_dotenv()
    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set")
    if not os.environ.get("GEMINI_API_KEY"):
        raise RuntimeError("GEMINI_API_KEY is not set")

    # Configuration setup for the drone MOP optimization problem
    job_conf = LocalJobConfig(
        eval_program_path=os.path.join(base_dir, "evaluate.py"), time="00:05:00"
    )

    db_conf = DatabaseConfig(
        num_islands=6,
        archive_size=20,
        migration_interval=1000,
        migration_rate=0.01,
        parent_selection_strategy="power_law",
        exploitation_alpha=1.0,
    )

    evo_conf = EvolutionConfig(
        init_program_path=os.path.join(base_dir, "initial.py"),
        task_sys_msg="You are an expert algorithm engineer. Your task is to modify the evolve_drone_path function to minimize three objectives simultaneously: flying distance (F1), school noise proximity (F2), and base station signal drop (F3). The framework returns a combined score where lower output is better. Return an array of Y-coordinates that creates a smooth line bending away from (40, 20) and towards (70, -30).",
        num_generations=50,
        max_parallel_jobs=5,
        patch_types=["diff", "full", "cross"],
        patch_type_probs=[0.3, 0.5, 0.2],
        llm_models=[
            "gpt-5.3-codex",
            "gpt-5.4",
            "gemini-3-pro-preview",
            "gemini-3.1-pro-preview",
            "gemini-3-flash-preview",
        ],
        llm_dynamic_selection="ucb",
        llm_dynamic_selection_kwargs={"exploration_coef": 2.0},
        meta_rec_interval=5,  # every 5 evaluated programs
        meta_llm_models=["gpt-5.4"],
        max_patch_attempts=10,
        job_type="local",
        language="python",
        results_dir=os.path.join(base_dir, "results_50g"),
        callback_url=os.environ.get("EVOLVE_SHELL_URL") if args.interactive else None,
    )

    print("Starting ShinkaEvolve for MOP Drone (50 Generations)...")
    runner_cls = (
        ShinkaEvolveInteractiveRunner if args.interactive else ShinkaEvolveRunner
    )
    runner = runner_cls(
        evo_config=evo_conf,
        job_config=job_conf,
        db_config=db_conf,
        max_proposal_jobs=10,
        max_db_workers=4,
    )

    asyncio.run(runner.run())


if __name__ == "__main__":
    main()
