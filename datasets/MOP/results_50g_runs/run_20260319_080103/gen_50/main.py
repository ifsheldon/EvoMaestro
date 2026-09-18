# EVOLVE-BLOCK-START
def evolve_drone_path(start, end, school, base, num_points):
    """
    Hybrid multi-objective drone path heuristic.

    Returns a list of num_points Y-coordinates for uniformly sampled X positions.
    Strategy:
    - straight-line baseline to control distance,
    - local Gaussian repulsion from school,
    - broader attraction toward base using direct pull to base.y,
    - mild progressive tail bias toward the base side,
    - small deterministic search over parameters with a lightweight surrogate score,
    - final smoothing/clamping for a natural curve.
    """
    import math

    x_start, y_start = start
    x_end, y_end = end
    sx, sy = school
    bx, by = base

    if num_points <= 0:
        return []

    dx_total = x_end - x_start
    dy_total = y_end - y_start

    if abs(dx_total) < 1e-12:
        step = dy_total / (num_points + 1)
        return [float(y_start + (i + 1) * step) for i in range(num_points)]

    xs = [x_start + (i + 1) * dx_total / (num_points + 1) for i in range(num_points)]

    def clamp(v, lo, hi):
        return lo if v < lo else hi if v > hi else v

    def gaussian_arr(mu, sigma):
        sigma = max(1e-6, float(sigma))
        inv = 1.0 / sigma
        return [math.exp(-0.5 * (((x - mu) * inv) ** 2)) for x in xs]

    baseline = []
    ts = []
    for x in xs:
        t = (x - x_start) / dx_total
        ts.append(t)
        baseline.append(y_start + dy_total * t)

    def line_y(x):
        t = (x - x_start) / dx_total
        return y_start + dy_total * t

    school_line_y = line_y(sx)
    base_line_y = line_y(bx)

    # Bend away from school and toward base side.
    away_dir = -1.0 if sy >= school_line_y else 1.0
    toward_dir = 1.0 if by >= base_line_y else -1.0

    span_x = abs(dx_total)
    school_gap = abs(sy - school_line_y)
    base_gap = abs(by - base_line_y)

    # Conservative but effective search ranges.
    school_sigmas = [max(6.0, 0.10 * span_x), max(10.0, 0.14 * span_x)]
    base_sigmas = [max(11.0, 0.19 * span_x), max(15.0, 0.25 * span_x)]

    school_push_consts = [26.0, 32.0]
    base_pulls = [
        min(0.65, 0.24 + 0.012 * base_gap),
        min(0.92, 0.42 + 0.018 * base_gap),
    ]
    tail_gains = [0.0, 2.5, 5.0]
    smooth_alphas = [0.20, 0.35]

    if away_dir == toward_dir:
        school_push_consts = [c * 1.05 for c in school_push_consts]
        base_pulls = [min(0.98, b * 1.08) for b in base_pulls]
        tail_gains = [g * 1.25 for g in tail_gains]

    gauss_school = {sig: gaussian_arr(sx, sig) for sig in school_sigmas}
    gauss_base = {sig: gaussian_arr(bx, sig) for sig in base_sigmas}
    gauss_base_wide = {sig: gaussian_arr(bx, sig * 1.35) for sig in base_sigmas}
    gauss_base_post = {sig: gaussian_arr(bx, max(2.0, sig * 0.40)) for sig in base_sigmas}

    direct_len = math.hypot(dx_total, dy_total) + 1e-9
    max_dev = 26.0 if away_dir == toward_dir else 22.0

    def smooth_once(ys, alpha):
        if len(ys) < 3:
            return ys[:]
        out = ys[:]
        for i in range(1, len(ys) - 1):
            out[i] = (1.0 - alpha) * ys[i] + alpha * 0.5 * (ys[i - 1] + ys[i + 1])
        return out

    def build_candidate(school_k, sigma_school, base_pull, sigma_base, tail_gain, smooth_alpha):
        ws = gauss_school[sigma_school]
        wb = gauss_base[sigma_base]
        wbw = gauss_base_wide[sigma_base]
        wbp = gauss_base_post[sigma_base]

        # Stage 1: Broad base attraction and tail bias
        ys_s1 = []
        for i in range(num_points):
            y0 = baseline[i]
            t = ts[i]
            attract = base_pull * wb[i] * (0.55 + 0.85 * t * t) * (by - y0)
            tail_bias = toward_dir * tail_gain * (t * t) * (0.30 + 0.70 * wbw[i])
            ys_s1.append(y0 + clamp(attract + tail_bias, -max_dev, max_dev))

        # Calculate clearance at school center
        idx_f = (sx - x_start) / (dx_total / (num_points + 1)) - 1
        idx = int(round(idx_f))
        y_at_sx = ys_s1[max(0, min(num_points - 1, idx))]
        clearance = abs(sy - y_at_sx)

        # Adaptive push magnitude based on clearance
        amp = min(52.0, max(32.0, school_k + 90.0 / (clearance + 4.5)))

        # Stage 2: Final path with adaptive school push
        ys = []
        for i in range(num_points):
            y = ys_s1[i] + away_dir * amp * ws[i]
            # Precise post-correction for F3
            y += 0.18 * (by - y) * wbp[i]
            ys.append(y)

        ys = smooth_once(ys, smooth_alpha)
        ys = smooth_once(ys, smooth_alpha * 0.65)
        return ys

    def surrogate_score(ys):
        total_len = 0.0
        px, py = x_start, y_start
        for x, y in zip(xs, ys):
            total_len += math.hypot(x - px, y - py)
            px, py = x, y
        total_len += math.hypot(x_end - px, y_end - py)
        f1 = total_len / direct_len

        school_pen = 0.0
        for x, y in zip(xs, ys):
            d = math.hypot(x - sx, y - sy)
            school_pen += 1.0 / (d + 1.0)
        school_pen /= num_points

        base_pen = 0.0
        for i, (x, y) in enumerate(zip(xs, ys)):
            t = (i + 1) / (num_points + 1.0)
            w = 0.60 + 1.20 * t
            base_pen += w * math.hypot(x - bx, y - by)
        base_pen /= num_points

        smooth_pen = 0.0
        for i in range(1, num_points - 1):
            smooth_pen += abs(ys[i - 1] - 2.0 * ys[i] + ys[i + 1])
        smooth_pen /= max(1, num_points - 2)

        # Priority weights targeting F3 reduction and F2 stability
        return 4.0 * f1 + 26.0 * school_pen + 0.12 * base_pen + 0.15 * smooth_pen

    best_ys = baseline[:]
    best_score = surrogate_score(best_ys)

    for school_k in school_push_consts:
        for sigma_school in school_sigmas:
            for base_pull in base_pulls:
                for sigma_base in base_sigmas:
                    for tail_gain in tail_gains:
                        for smooth_alpha in smooth_alphas:
                            ys = build_candidate(
                                school_k=school_k,
                                sigma_school=sigma_school,
                                base_pull=base_pull,
                                sigma_base=sigma_base,
                                tail_gain=tail_gain,
                                smooth_alpha=smooth_alpha,
                            )
                            score = surrogate_score(ys)
                            if score < best_score:
                                best_score = score
                                best_ys = ys

    ref_vals = [y_start, y_end, sy, by] + best_ys
    y_lo = min(ref_vals)
    y_hi = max(ref_vals)
    pad = 0.30 * (y_hi - y_lo + 20.0)
    lo = min(y_start, y_end, sy, by) - pad
    hi = max(y_start, y_end, sy, by) + pad

    return [float(clamp(y, lo, hi)) for y in best_ys]
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