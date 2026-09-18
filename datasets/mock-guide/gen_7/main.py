# EVOLVE-BLOCK-START
import random

def compute(seed: int = 42) -> float:
    random.seed(seed)
    x = sum(random.gauss(0, 1) for _ in range(11))
    return abs(x) * 0.6

def run_experiment(seed: int = 1) -> float:
    return compute(seed)

# EVOLVE-BLOCK-END
