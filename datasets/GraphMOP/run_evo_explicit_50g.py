"""Explicit ShinkaEvolve runner for the graph routing MOP example.

Usage:

  # Standard (non-interactive) run
  uv run --locked --all-packages python run_evo_explicit_50g.py

  # Interactive run with evomaestro-interface steering (pause/resume, suggest, merge)
  uv run --locked --all-packages python run_evo_explicit_50g.py --interactive
"""

import argparse
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from shinka.core import (
    EvolutionConfig,
    ShinkaEvolveInteractiveRunner,
    ShinkaEvolveRunner,
)
from shinka.database import DatabaseConfig
from shinka.launch import LocalJobConfig


def find_venv_activate(start_dir: str) -> str:
    """Walk up from start_dir to find the closest .venv/bin/activate."""
    current = os.path.abspath(start_dir)
    while True:
        candidate = os.path.join(current, ".venv", "bin", "activate")
        if os.path.isfile(candidate):
            return candidate
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent
    raise FileNotFoundError(f"No .venv/bin/activate found in any parent of {start_dir}")


def build_results_dir(base_dir: str) -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    return os.path.join(base_dir, "results_50g_runs", f"run_{timestamp}")


def main() -> None:
    parser = argparse.ArgumentParser(description="GraphMOP ShinkaEvolve runner")
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Use the interactive runner with evomaestro-interface steering support.",
    )
    parser.add_argument(
        "--resume",
        type=str,
        default=None,
        metavar="DIR",
        help="Resume from an existing results directory instead of creating a new one.",
    )
    args = parser.parse_args()

    base_dir = os.path.dirname(os.path.abspath(__file__))
    load_dotenv()
    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set")

    if args.resume:
        results_dir = os.path.abspath(args.resume)
        if not os.path.isdir(results_dir):
            raise RuntimeError(f"Resume directory does not exist: {results_dir}")
    else:
        results_dir = build_results_dir(base_dir)
        os.makedirs(results_dir, exist_ok=False)
    venv_activate = find_venv_activate(base_dir)

    job_config = LocalJobConfig(
        eval_program_path=os.path.join(base_dir, "evaluate.py"),
        time="00:05:00",
        activate_script=venv_activate,
    )

    db_config = DatabaseConfig(
        db_path=os.path.join(results_dir, "programs.sqlite"),
        num_islands=6,
        archive_size=20,
        # disable migration
        migration_interval=1000,
        migration_rate=0.01,
        parent_selection_strategy="power_law",
        exploitation_alpha=1.0,
    )

    evo_config = EvolutionConfig(
        init_program_path=os.path.join(base_dir, "initial.py"),
        task_sys_msg=(
            "You are an expert algorithm engineer. Modify the evolve_task_routing "
            "function for an undirected graph with a few server nodes and many task "
            "source nodes. Each task source must be assigned to a valid server using "
            "a valid simple path. Minimize two objectives simultaneously: "
            "1) end-to-end latency, including transmission latency over hops and "
            "server queueing delay; 2) total system energy, including routing energy "
            "and server compute energy. Return a dict keyed by source node with "
            "fields 'server' and 'path'. Lower score is better."
        ),
        num_generations=50,
        max_patch_attempts=10,
        max_patch_resamples=3,
        max_proposal_jobs=10,
        max_db_workers=4,
        patch_types=["diff", "full", "cross"],
        patch_type_probs=[0.3, 0.5, 0.2],
        llm_models=[
            "gpt-5.4",
            "gpt-5.4-mini",
            "gpt-5.4-nano",
            "gpt-5.3-codex",
            "gpt-5.2",
            "gpt-5.2-codex",
            "gpt-5-nano",
        ],
        llm_dynamic_selection="ucb",
        llm_dynamic_selection_kwargs={"exploration_coef": 2.0},
        meta_rec_interval=5,  # every 5 evaluated programs
        meta_llm_models=["gpt-5.4"],
        embedding_model="text-embedding-3-small",
        code_embed_sim_threshold=0.95,
        results_dir=results_dir,
        job_type="local",
        language="python",
        use_text_feedback=True,
        callback_url=os.environ.get("EVOLVE_SHELL_URL") if args.interactive else None,
    )

    print(f"Starting GraphMOP ShinkaEvolve run in: {results_dir}")

    runner_cls = (
        ShinkaEvolveInteractiveRunner if args.interactive else ShinkaEvolveRunner
    )
    runner = runner_cls(
        evo_config=evo_config,
        job_config=job_config,
        db_config=db_config,
        verbose=True,
        max_evaluation_jobs=8,
        max_proposal_jobs=10,
        max_db_workers=4,
    )
    runner.run()


if __name__ == "__main__":
    main()
