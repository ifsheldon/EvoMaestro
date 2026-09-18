# EVOLVE-BLOCK-START
import math

def evolve_drone_path(start, end, school, base, num_points):
    """
    【无人机连续空间多目标折线优化】
    Hybrid crossover strategy:
    1) Gaussian warm-start deformation (away from school, toward base),
    2) Adam-based multi-objective refinement for F1/F2/F3.
    """
    if num_points <= 0:
        return []

    x_start, y_start = start
    x_end, y_end = end
    sx, sy = school
    bx, by = base

    n = num_points
    inv_n1 = 1.0 / (n + 1)
    dx = (x_end - x_start) * inv_n1

    # Fixed x grid and linear base y
    xs = [x_start + (i + 1) * dx for i in range(n)]
    ys = [y_start + (y_end - y_start) * (i + 1) * inv_n1 for i in range(n)]

    # ---- Gaussian warm-start (crossover from builder-style deformation) ----
    # Smoothly bends away from school and towards base with endpoint taper.
    span = abs(x_end - x_start) + 1e-9
    school_spread = 0.22 * span * span + 220.0
    base_spread = 0.30 * span * span + 260.0
    school_strength = 9.0
    base_strength = 11.0

    for i in range(n):
        x = xs[i]
        w = (i + 1) * inv_n1  # 0..1
        line_y = y_start * (1.0 - w) + y_end * w

        # Push away from school relative to local baseline
        dir_school = -1.0 if sy >= line_y else 1.0
        g_school = math.exp(-((x - sx) * (x - sx)) / school_spread)

        # Pull toward base relative to local baseline
        dir_base = 1.0 if by >= line_y else -1.0
        g_base = math.exp(-((x - bx) * (x - bx)) / base_spread)

        # Taper keeps endpoints stable and curve smooth
        taper = math.sin(math.pi * w)
        ys[i] += taper * (school_strength * dir_school * g_school + base_strength * dir_base * g_base)

    # ---- Adam refinement (crossover from optimizer-based approach) ----
    m = [0.0] * n
    v = [0.0] * n
    beta1, beta2 = 0.9, 0.999
    eps = 1e-8

    total_steps = 720
    for step in range(1, total_steps + 1):
        p = step / total_steps

        # Phase schedule: early safety, later signal, final balancing
        if p < 0.35:
            w1 = 1.05
            w2 = 2.8
            w3 = 0.85
        elif p < 0.75:
            t = (p - 0.35) / 0.40
            w1 = 1.05
            w2 = 2.8 * (1.0 - t) + 1.4 * t
            w3 = 0.85 * (1.0 - t) + 1.9 * t
        else:
            t = (p - 0.75) / 0.25
            w1 = 1.0
            w2 = 1.4 * (1.0 - t) + 1.15 * t
            w3 = 1.9 * (1.0 - t) + 1.25 * t

        lr = 0.42 * (1.0 - 0.45 * p)
        w_smooth = 0.075

        # Objective magnitudes
        f1 = 0.0
        prev_x, prev_y = x_start, y_start
        for i in range(n):
            x, y = xs[i], ys[i]
            f1 += math.hypot(x - prev_x, y - prev_y)
            prev_x, prev_y = x, y
        f1 += math.hypot(x_end - prev_x, y_end - prev_y)

        f2 = 0.0
        f3 = 0.0
        for i in range(n):
            x, y = xs[i], ys[i]
            dsq_s = (x - sx) * (x - sx) + (y - sy) * (y - sy) + 1e-6
            dsq_b = (x - bx) * (x - bx) + (y - by) * (y - by) + 1e-6
            f2 += 1.0 / dsq_s
            f3 += math.sqrt(dsq_b)

        inv_f1 = 1.0 / (f1 + 1e-9)
        inv_f2 = 1.0 / (f2 + 1e-12)
        inv_f3 = 1.0 / (f3 + 1e-9)

        # Gradients + Adam update
        for i in range(n):
            x = xs[i]
            y = ys[i]

            py = ys[i - 1] if i > 0 else y_start
            ny = ys[i + 1] if i < n - 1 else y_end
            px = xs[i - 1] if i > 0 else x_start
            nx = xs[i + 1] if i < n - 1 else x_end

            d1 = math.hypot(x - px, y - py) + 1e-9
            d2 = math.hypot(nx - x, ny - y) + 1e-9
            grad_f1 = (y - py) / d1 - (ny - y) / d2

            dsq_s = (x - sx) * (x - sx) + (y - sy) * (y - sy) + 1e-6
            grad_f2 = -2.0 * (y - sy) / (dsq_s * dsq_s)

            dsq_b = (x - bx) * (x - bx) + (y - by) * (y - by) + 1e-6
            grad_f3 = (y - by) / math.sqrt(dsq_b)

            # Discrete curvature regularization for smoother/shorter path
            grad_smooth = (2.0 * y - py - ny)

            g = (
                w1 * grad_f1 * inv_f1
                + w2 * grad_f2 * inv_f2
                + w3 * grad_f3 * inv_f3
                + w_smooth * grad_smooth
            )

            m[i] = beta1 * m[i] + (1.0 - beta1) * g
            v[i] = beta2 * v[i] + (1.0 - beta2) * (g * g)

            m_hat = m[i] / (1.0 - beta1 ** step)
            v_hat = v[i] / (1.0 - beta2 ** step)

            ys[i] -= lr * m_hat / (math.sqrt(v_hat) + eps)

    return ys
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
