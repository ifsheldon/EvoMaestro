# EVOLVE-BLOCK-START
import math

def evolve_drone_path(start, end, school, base, num_points):
    """
    Hybrid multi-objective optimizer:
    - Stage A: annealed Gauss-Seidel relaxation (fast shape formation)
    - Stage B: Adam refinement on normalized multi-objective gradients
    Objectives:
      F1: path length (smooth/short)
      F2: school proximity penalty (repel)
      F3: base distance penalty (attract)
    """
    x_start, y_start = start
    x_end, y_end = end
    sx, sy = school
    bx, by = base

    if num_points <= 0:
        return []

    # Fixed x-grid
    dx = (x_end - x_start) / (num_points + 1)
    xs = [x_start + (i + 1) * dx for i in range(num_points)]

    # Linear initialization
    ys = [y_start + (y_end - y_start) * (i + 1) / (num_points + 1) for i in range(num_points)]

    # ---- Smooth prior bend: away from school, toward base ----
    # Helps produce a stable, smooth "S-like" curve early.
    school_sigma = max(abs(x_end - x_start) * 0.18, 8.0)
    base_sigma = max(abs(x_end - x_start) * 0.22, 10.0)
    inv_school_2s2 = 1.0 / (2.0 * school_sigma * school_sigma)
    inv_base_2s2 = 1.0 / (2.0 * base_sigma * base_sigma)

    for i in range(num_points):
        x = xs[i]
        y = ys[i]

        g_school = math.exp(-((x - sx) * (x - sx)) * inv_school_2s2)
        g_base = math.exp(-((x - bx) * (x - bx)) * inv_base_2s2)

        # Away from school in vertical direction
        away_dir = -1.0 if sy >= y else 1.0
        ys[i] = y + 10.0 * away_dir * g_school + 0.35 * (by - y) * g_base

    # ---- Stage A: Annealed Gauss-Seidel ----
    sweeps = 700
    for sweep in range(sweeps):
        p = sweep / float(sweeps)

        # Strong early repulsion; later allow attraction + smoothness to settle
        alpha = 0.42 + 0.10 * p                  # tension/smoothing
        beta = 200.0 * (1.0 - 0.80 * p)          # school repulsion
        gamma = 0.10 + 1.10 * p                  # base attraction
        step_scale = 0.22 * (1.0 - 0.35 * p)     # decay update amplitude

        for i in range(num_points):
            x = xs[i]
            y = ys[i]

            prev_y = ys[i - 1] if i > 0 else y_start
            next_y = ys[i + 1] if i < num_points - 1 else y_end

            # F1 local smoothing
            y_mid = 0.5 * (prev_y + next_y)

            # F2: repel from school
            ds = (x - sx) * (x - sx) + (y - sy) * (y - sy) + 1e-6
            f_rep_y = (y - sy) / ds

            # F3: attract to base
            db2 = (x - bx) * (x - bx) + (y - by) * (y - by) + 1e-6
            f_att_y = (by - y) / math.sqrt(db2)

            dy = alpha * (y_mid - y) + beta * f_rep_y + gamma * f_att_y
            dy *= step_scale

            # Clamp to keep smooth/stable
            if dy > 1.5:
                dy = 1.5
            elif dy < -1.5:
                dy = -1.5

            ys[i] += dy

    # ---- Stage B: Adam refinement ----
    m = [0.0] * num_points
    v = [0.0] * num_points
    beta1 = 0.9
    beta2 = 0.999
    eps = 1e-8
    steps = 520

    for step in range(1, steps + 1):
        p = step / float(steps)

        # Weighted schedule (emphasize safety early, then balance)
        w1 = 1.15 + 0.10 * p
        w2 = 2.40 - 1.25 * p
        w3 = 0.85 + 0.85 * p
        w4 = 0.22  # Laplacian regularization

        lr = 0.34 - 0.20 * p  # 0.34 -> 0.14

        # Objective scales
        f1 = 0.0
        px, py = x_start, y_start
        for i in range(num_points):
            x, y = xs[i], ys[i]
            f1 += math.hypot(x - px, y - py)
            px, py = x, y
        f1 += math.hypot(x_end - px, y_end - py)

        f2 = 0.0
        f3 = 0.0
        for i in range(num_points):
            x, y = xs[i], ys[i]
            ds = (x - sx) * (x - sx) + (y - sy) * (y - sy) + 1e-6
            db2 = (x - bx) * (x - bx) + (y - by) * (y - by) + 1e-6
            f2 += 1.0 / ds
            f3 += math.sqrt(db2)

        inv_f1 = 1.0 / (f1 + eps)
        inv_f2 = 1.0 / (f2 + eps)
        inv_f3 = 1.0 / (f3 + eps)

        # Gradients + Adam updates
        for i in range(num_points):
            x = xs[i]
            y = ys[i]

            prev_y = ys[i - 1] if i > 0 else y_start
            next_y = ys[i + 1] if i < num_points - 1 else y_end
            prev_x = xs[i - 1] if i > 0 else x_start
            next_x = xs[i + 1] if i < num_points - 1 else x_end

            # dF1/dy
            d1 = math.hypot(x - prev_x, y - prev_y)
            d2 = math.hypot(next_x - x, next_y - y)
            grad_f1 = 0.0
            if d1 > 1e-8:
                grad_f1 += (y - prev_y) / d1
            if d2 > 1e-8:
                grad_f1 -= (next_y - y) / d2

            # dF2/dy for sum(1/dist^2)
            ds = (x - sx) * (x - sx) + (y - sy) * (y - sy) + 1e-6
            grad_f2 = -2.0 * (y - sy) / (ds * ds)

            # dF3/dy for sum(dist)
            db2 = (x - bx) * (x - bx) + (y - by) * (y - by) + 1e-6
            grad_f3 = (y - by) / math.sqrt(db2)

            # Laplacian smoothing gradient
            grad_smooth = (2.0 * y - prev_y - next_y)

            g = (
                w1 * grad_f1 * inv_f1
                + w2 * grad_f2 * inv_f2
                + w3 * grad_f3 * inv_f3
                + w4 * grad_smooth
            )

            m[i] = beta1 * m[i] + (1.0 - beta1) * g
            v[i] = beta2 * v[i] + (1.0 - beta2) * (g * g)

            m_hat = m[i] / (1.0 - beta1 ** step)
            v_hat = v[i] / (1.0 - beta2 ** step)

            dy = lr * m_hat / (math.sqrt(v_hat) + eps)
            if dy > 1.0:
                dy = 1.0
            elif dy < -1.0:
                dy = -1.0

            ys[i] -= dy

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
