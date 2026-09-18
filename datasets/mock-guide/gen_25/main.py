# EVOLVE-BLOCK-START
    import random

    def compute(seed: int = 42) -> float:
        random.seed(seed)
import time; time.sleep(6)  # intentional timeout
        x = sum(random.gauss(0, 1) for _ in range(12))
        return abs(x) * 2.13

    def run_experiment(seed: int = 1) -> float:
        return compute(seed)

    # EVOLVE-BLOCK-END
