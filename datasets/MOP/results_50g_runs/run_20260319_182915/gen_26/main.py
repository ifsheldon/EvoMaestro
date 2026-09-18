# EVOLVE-BLOCK-START
import math

def evolve_drone_path(start, end, school, base, num_points):
    """
    Return a list of Y coordinates for uniformly spaced X locations between start and end.

    Multi-objective heuristic:
      F1: shorter flying distance
      F2: lower school-noise proximity
      F3: lower base-station signal drop

    New strategy:
      - initialize with a broad, smooth arc that bends away from school and toward base
      - optimize with adaptive active-contour updates
      - use both second-difference curvature and fourth-order regularization
      - keep endpoint-safe envelopes and periodic smoothing
    """
    x0, y0 = start
    x1, y1 = end
    xs, ys = school
    xb, yb = base

    if num_points <= 0:
        return []

    # ---------------- helpers ----------------
    def clamp(v, lo, hi):
        return lo if v < lo else hi if v > hi else v

    def l2_norm(arr):
        s = 0.0
        for v in arr:
            s += v * v
        return math.sqrt(s) + 1e-12

    def smooth_inplace(y, weight=0.15, passes=1):
        n = len(y)
        if n <= 1:
            return
        for _ in range(passes):
            prev = y[:]
            for i in range(n):
                left = y0 if i == 0 else prev[i - 1]
                right = y1 if i == n - 1 else prev[i + 1]
                y[i] = (1.0 - weight) * prev[i] + 0.5 * weight * (left + right)

    def second_diff(arr, i):
        left = y0 if i == 0 else arr[i - 1]
        right = y1 if i == len(arr) - 1 else arr[i + 1]
        return 2.0 * arr[i] - left - right

    # discrete bi-harmonic style stencil
    def fourth_order(arr, i):
        n = len(arr)
        ym2 = y0 if i - 2 < 0 else arr[i - 2]
        ym1 = y0 if i - 1 < 0 else arr[i - 1]
        yp1 = y1 if i + 1 >= n else arr[i + 1]
        yp2 = y1 if i + 2 >= n else arr[i + 2]
        return ym2 - 4.0 * ym1 + 6.0 * arr[i] - 4.0 * yp1 + yp2

    # ---------------- geometry ----------------
    dx_total = (x1 - x0) / (num_points + 1)
    x_positions = [x0 + (i + 1) * dx_total for i in range(num_points)]

    span_x = abs(x1 - x0) + 1e-9
    span_y = abs(y1 - y0) + 1e-9
    span = math.hypot(span_x, span_y)

    # baseline line
    y_line = [y0 + (y1 - y0) * ((x - x0) / (x1 - x0 + 1e-12)) for x in x_positions]
    y_coords = y_line[:]

    # ---------------- structured initialization ----------------
    # Build a smooth broad bend:
    # 1) repel from school
    # 2) attract toward base
    # 3) add a smooth late downward sag after the school toward the base region
    school_sigma = max(7.0, 0.12 * span_x)
    base_sigma = max(9.0, 0.15 * span_x)
    transition_scale = max(4.0, 0.06 * span_x)

    school_amp = max(10.0, 0.20 * span)
    base_amp = max(12.0, 0.26 * span)
    late_sag_amp = max(8.0, 0.16 * span)

    for i, x in enumerate(x_positions):
        t = (i + 1) / (num_points + 1)
        center_taper = math.sin(math.pi * t) ** 0.95
        y_ref = y_line[i]

        # school avoidance direction: move vertically away from school
        school_sign = -1.0 if ys >= y_ref else 1.0
        school_gate = math.exp(-((x - xs) / school_sigma) ** 2)

        # base attraction direction: move vertically toward base
        base_sign = 1.0 if yb >= y_ref else -1.0
        base_gate = math.exp(-((x - xb) / base_sigma) ** 2)

        # broad sag starts after school and grows toward base
        # logistic gate produces a smooth global bend rather than a local dent
        late_gate = 1.0 / (1.0 + math.exp(-(x - (0.55 * xs + 0.45 * xb)) / transition_scale))
        broad_shape = center_taper * (0.35 + 0.65 * late_gate)

        y_coords[i] += center_taper * (
            1.20 * school_amp * school_sign * school_gate +
            1.35 * base_amp * base_sign * base_gate
        )
        y_coords[i] += broad_shape * (late_sag_amp * (-1.0 if yb < y_ref else 1.0))

    smooth_inplace(y_coords, weight=0.20, passes=4)

    # ---------------- iterative refinement ----------------
    iters = 170 if num_points < 80 else 210

    school_gate_sigma = max(8.0, 0.14 * span_x)
    base_gate_sigma = max(10.0, 0.17 * span_x)

    for it in range(iters):
        progress = it / max(1, iters - 1)

        # Adaptive schedules
        lr = 0.26 * (1.0 - progress) + 0.025

        # Early: clear school; Mid/Late: settle toward base with stronger regularity
        w_school = 1.55 - 0.45 * progress
        w_base = 1.00 + 0.35 * progress
        w_dist = 0.32 + 0.48 * progress
        w_curve = 0.95 + 0.45 * progress
        w_biharm = 0.40 + 0.55 * progress
        w_anchor = 0.10 + 0.18 * progress

        grad_school = [0.0] * num_points
        grad_base = [0.0] * num_points
        grad_dist = [0.0] * num_points
        grad_curve = [0.0] * num_points
        grad_biharm = [0.0] * num_points
        grad_anchor = [0.0] * num_points

        for i, x in enumerate(x_positions):
            y = y_coords[i]

            # Second-difference curvature term
            grad_curve[i] = second_diff(y_coords, i)

            # Fourth-order smoothness term
            grad_biharm[i] = fourth_order(y_coords, i)

            # Distance reduction / arc-length proxy
            left = y0 if i == 0 else y_coords[i - 1]
            right = y1 if i == num_points - 1 else y_coords[i + 1]
            grad_dist[i] = y - 0.5 * (left + right)

            # School repulsion
            dxs = x - xs
            dys = y - ys
            r2s = dxs * dxs + dys * dys + 25.0
            local_school_gate = math.exp(-((x - xs) / school_gate_sigma) ** 2)
            # negative sign so subtracting total_grad moves away from school
            grad_school[i] = -(dys / (r2s ** 1.12)) * (0.55 + 2.40 * local_school_gate)

            # Base attraction
            dxb = x - xb
            dyb = y - yb
            r2b = dxb * dxb + dyb * dyb + 36.0
            local_base_gate = math.exp(-((x - xb) / base_gate_sigma) ** 2)
            grad_base[i] = (dyb / (r2b ** 1.02)) * (0.70 + 2.15 * local_base_gate)

            # Soft anchor toward a smooth target arc:
            # away from school, toward base, with stronger effect in the latter half.
            t = (i + 1) / (num_points + 1)
            center_taper = math.sin(math.pi * t)
            late_gate = 1.0 / (1.0 + math.exp(-(x - (0.55 * xs + 0.45 * xb)) / transition_scale))
            target = y_line[i]
            target += center_taper * (0.85 * school_amp * (-1.0 if ys >= y_line[i] else 1.0) * math.exp(-((x - xs) / school_sigma) ** 2))
            target += center_taper * (1.00 * base_amp * (1.0 if yb >= y_line[i] else -1.0) * math.exp(-((x - xb) / base_sigma) ** 2))
            target += center_taper * (0.55 + 0.45 * late_gate) * (0.75 * late_sag_amp * (-1.0 if yb < y_line[i] else 1.0))
            grad_anchor[i] = y - target

        # Normalize terms separately for stable multi-objective combination
        n_school = l2_norm(grad_school)
        n_base = l2_norm(grad_base)
        n_dist = l2_norm(grad_dist)
        n_curve = l2_norm(grad_curve)
        n_biharm = l2_norm(grad_biharm)
        n_anchor = l2_norm(grad_anchor)

        for i in range(num_points):
            t = (i + 1) / (num_points + 1)
            envelope = 0.22 + 0.78 * (math.sin(math.pi * t) ** 0.9)

            total_grad = (
                w_school * (grad_school[i] / n_school) +
                w_base * (grad_base[i] / n_base) +
                w_dist * (grad_dist[i] / n_dist) +
                w_curve * (grad_curve[i] / n_curve) +
                w_biharm * (grad_biharm[i] / n_biharm) +
                w_anchor * (grad_anchor[i] / n_anchor)
            )

            y_coords[i] -= lr * envelope * total_grad * span * 2.2

        # periodic denoising
        if it % 6 == 0:
            smooth_inplace(y_coords, weight=0.08 + 0.10 * progress, passes=1)

        # occasional stronger polish later in optimization
        if it > iters // 2 and it % 15 == 0:
            smooth_inplace(y_coords, weight=0.10, passes=1)

    # ---------------- final polish ----------------
    smooth_inplace(y_coords, weight=0.18, passes=3)

    # Conservative geometry-aware clipping
    lo_ref = min(y0, y1, ys, yb)
    hi_ref = max(y0, y1, ys, yb)
    margin = max(24.0, 0.32 * span)
    lo = lo_ref - margin
    hi = hi_ref + margin
    y_coords = [float(clamp(v, lo, hi)) for v in y_coords]

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
