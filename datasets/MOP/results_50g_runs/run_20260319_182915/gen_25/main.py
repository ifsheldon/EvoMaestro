# EVOLVE-BLOCK-START
import math

def evolve_drone_path(start, end, school, base, num_points):
    """
    Hybrid crossover:
    1) Smooth heuristic initialization (enveloped school-repel + base-attract),
    2) Adam-based active-contour refinement for F1/F2/F3 joint optimization.
    """
    x_start, y_start = start
    x_end, y_end = end
    x_school, y_school = school
    x_base, y_base = base

    if num_points <= 0:
        return []

    n = num_points
    dx_total = x_end - x_start
    dy_total = y_end - y_start
    denom = n + 1

    # Degenerate vertical-x case: return linear interpolation on y
    if abs(dx_total) < 1e-12:
        return [float(y_start + dy_total * (i + 1) / denom) for i in range(n)]

    dx = dx_total / denom
    x_coords = [x_start + (i + 1) * dx for i in range(n)]
    y_line = [y_start + dy_total * (i + 1) / denom for i in range(n)]

    def gauss(z, mu, sigma):
        s = sigma if sigma > 1e-9 else 1e-9
        u = (z - mu) / s
        return math.exp(-0.5 * u * u)

    # ---- Stage 1: smooth heuristic initialization ----
    school_sigma_init = max(abs(dx_total) * 0.18, 14.0)
    base_sigma_init = max(abs(dx_total) * 0.24, 18.0)

    y_coords = []
    for i in range(n):
        t = (i + 1) / denom
        x = x_coords[i]
        yl = y_line[i]

        envelope = math.sin(math.pi * t) ** 0.85  # zero at ends, smooth middle
        school_push = 1.15 * (yl - y_school) * gauss(x, x_school, school_sigma_init)
        base_pull = 1.25 * (y_base - yl) * gauss(x, x_base, base_sigma_init)

        offset = envelope * (school_push + base_pull)
        offset = max(min(offset, 45.0), -45.0)
        y_coords.append(float(yl + offset))

    # ---- Stage 2: Adam refinement ----
    iterations = 260
    initial_lr = 1.35

    # Objective weights (balanced from prior strong performer + smoother init)
    alpha_arc = 220.0       # distance / arc-length smoothness
    alpha_lap = 38.0        # curvature regularization
    beta_school = 15000.0   # school repulsion (keep F2 low)
    sigma_school = 30.0
    gamma_base = 55.0       # base attraction (reduce F3)
    sigma_base = 42.0

    # Adam states
    m = [0.0] * n
    v = [0.0] * n
    b1, b2 = 0.9, 0.999
    eps = 1e-8

    for t in range(1, iterations + 1):
        lr = initial_lr * (1.0 - t / (iterations + 1.0))
        if lr < 0.03:
            lr = 0.03

        for i in range(n):
            y_prev = y_start if i == 0 else y_coords[i - 1]
            y_next = y_end if i == n - 1 else y_coords[i + 1]
            y_curr = y_coords[i]
            x_curr = x_coords[i]

            # Arc-length smoothness gradient
            dy_prev = y_curr - y_prev
            dy_next = y_curr - y_next
            d_prev = math.sqrt(dx * dx + dy_prev * dy_prev + 1e-12)
            d_next = math.sqrt(dx * dx + dy_next * dy_next + 1e-12)
            grad_arc = (dy_prev / d_prev) + (dy_next / d_next)

            # Laplacian smoothing gradient (keeps path regular)
            grad_lap = 2.0 * y_curr - y_prev - y_next

            # School repulsion (push away from school)
            dist_sq_school = (x_curr - x_school) ** 2 + (y_curr - y_school) ** 2
            dy_school = y_curr - y_school
            if -1e-6 < dy_school < 1e-6:
                dy_school = 1e-6
            grad_school = -beta_school * math.exp(-dist_sq_school / (2.0 * sigma_school * sigma_school)) * dy_school / (sigma_school * sigma_school)

            # Base attraction (pull toward base y near base x)
            wx = math.exp(-((x_curr - x_base) ** 2) / (2.0 * sigma_base * sigma_base))
            grad_base = gamma_base * wx * (y_curr - y_base)

            total_grad = alpha_arc * grad_arc + alpha_lap * grad_lap + grad_school + grad_base
            total_grad = max(min(total_grad, 180.0), -180.0)

            # Adam update
            m[i] = b1 * m[i] + (1.0 - b1) * total_grad
            v[i] = b2 * v[i] + (1.0 - b2) * (total_grad * total_grad)
            m_hat = m[i] / (1.0 - b1 ** t)
            v_hat = v[i] / (1.0 - b2 ** t)

            y_coords[i] = y_curr - lr * m_hat / (math.sqrt(v_hat) + eps)

    return y_coords
# EVOLVE-BLOCK-END

import sys
import os

# 将当前目录加入系统路径以便导入同级文件
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from drone_evaluation import DroneGrader

def run_experiment(**kwargs):
    """供 Shinka 触发的单次实验方法"""
    grader = DroneGrader()
    
    # 捕获异常防止大模型写出死循环炸毁测评机
    try:
        avg_f1, avg_f2, avg_f3, final_score = grader.grade_silent(evolve_drone_path, timeout=12)
    except Exception as e:
        import traceback
        traceback.print_exc()
        avg_f1, avg_f2, avg_f3, final_score = float('inf'), float('inf'), float('inf'), float('inf')
        
    return avg_f1, avg_f2, avg_f3, final_score
