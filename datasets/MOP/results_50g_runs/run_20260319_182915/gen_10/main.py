# EVOLVE-BLOCK-START
import math
import random

def evolve_drone_path(start, end, school, base, num_points):
    """
    Multi-objective drone path generation using a smooth basis model
    optimized by Cross-Entropy Method (CEM).

    Inputs:
        start, end, school, base: (x, y)
        num_points: number of intermediate points
    Output:
        list of y-coordinates of length num_points
    """
    if num_points <= 0:
        return []

    x0, y0 = start
    x1, y1 = end
    sx, sy = school
    bx, by = base

    dx_total = x1 - x0
    if abs(dx_total) < 1e-12:
        return [float((y0 + y1) * 0.5) for _ in range(num_points)]

    dx = dx_total / (num_points + 1)
    xs = [x0 + (i + 1) * dx for i in range(num_points)]
    ts = [(x - x0) / dx_total for x in xs]
    y_line = [y0 + (y1 - y0) * t for t in ts]

    span_x = abs(dx_total) + 1e-9
    span_y = abs(y1 - y0) + 1e-9
    amp_scale = max(12.0, 0.22 * span_x + 0.35 * span_y + 8.0)

    def gauss(x, mu, sigma):
        z = (x - mu) / (sigma + 1e-12)
        return math.exp(-0.5 * z * z)

    # Relative direction: move away from school, move toward base
    y_school_on_line = y0 + (y1 - y0) * ((sx - x0) / (dx_total + 1e-12))
    y_base_on_line = y0 + (y1 - y0) * ((bx - x0) / (dx_total + 1e-12))
    school_sign = -1.0 if sy >= y_school_on_line else 1.0
    base_sign = 1.0 if by >= y_base_on_line else -1.0

    sigma_s = max(7.0, 0.12 * span_x)
    sigma_b = max(9.0, 0.16 * span_x)
    sigma_mid = max(10.0, 0.20 * span_x)

    # Smooth basis functions, all naturally small near endpoints
    b_global = [math.sin(math.pi * t) for t in ts]
    b_skew = [t * (1.0 - t) * (2.0 * t - 1.0) for t in ts]
    b_quad = [t * (1.0 - t) for t in ts]
    b_school = [gauss(x, sx, sigma_s) * math.sin(math.pi * t) for x, t in zip(xs, ts)]
    b_base = [gauss(x, bx, sigma_b) * math.sin(math.pi * t) for x, t in zip(xs, ts)]
    mid_mu = 0.5 * (sx + bx)
    b_mid = [gauss(x, mid_mu, sigma_mid) * math.sin(math.pi * t) for x, t in zip(xs, ts)]

    # Deterministic RNG for stable grading
    seed_val = (
        int(round(x0 * 17 + y0 * 19 + x1 * 23 + y1 * 29 + sx * 31 + sy * 37 + bx * 41 + by * 43))
        + num_points * 97
    ) & 0xFFFFFFFF
    rng = random.Random(seed_val)

    def build_path(coeffs):
        c0, c1, c2, c3, c4, c5 = coeffs
        ys = []
        for i in range(num_points):
            y = (
                y_line[i]
                + c0 * school_sign * b_school[i]
                + c1 * base_sign * b_base[i]
                + c2 * 0.5 * (school_sign + base_sign) * b_global[i]
                + c3 * b_skew[i]
                + c4 * (base_sign - school_sign) * b_mid[i]
                + c5 * 4.0 * b_quad[i] * (0.35 * base_sign + 0.15 * school_sign)
            )
            ys.append(float(y))
        return ys

    def proxy_score(ys):
        # F1-like: path length
        length = 0.0
        px, py = x0, y0
        for x, y in zip(xs, ys):
            length += math.hypot(x - px, y - py)
            px, py = x, y
        length += math.hypot(x1 - px, y1 - py)

        # F2-like: school noise penalty, strong near school
        school_pen = 0.0
        for x, y in zip(xs, ys):
            d2 = (x - sx) * (x - sx) + (y - sy) * (y - sy)
            school_pen += 1.0 / (d2 + 16.0)
        school_pen /= num_points

        # F3-like: signal drop penalty, prefer closeness to base
        base_pen = 0.0
        for x, y in zip(xs, ys):
            base_pen += math.hypot(x - bx, y - by)
        base_pen /= num_points

        # Curvature/smoothness
        curv = 0.0
        if num_points >= 3:
            for i in range(1, num_points - 1):
                dd = ys[i - 1] - 2.0 * ys[i] + ys[i + 1]
                curv += dd * dd
            curv /= (num_points - 2)

        # Keep path from becoming unrealistically extreme
        dev = 0.0
        for yl, y in zip(y_line, ys):
            d = y - yl
            dev += d * d
        dev /= num_points

        return (
            0.95 * length
            + 150.0 * school_pen
            + 0.62 * base_pen
            + 0.045 * curv
            + 0.0025 * dev
        )

    # Initial heuristic mean favors avoiding school and drifting toward base
    mean = [
        0.75 * amp_scale,   # school avoidance bump
        0.55 * amp_scale,   # base attraction bump
        0.20 * amp_scale,   # global bend
        0.00 * amp_scale,   # skew
        0.18 * amp_scale,   # middle transition
        0.10 * amp_scale,   # quadratic sag/lift
    ]
    std = [
        0.75 * amp_scale,
        0.65 * amp_scale,
        0.45 * amp_scale,
        0.35 * amp_scale,
        0.35 * amp_scale,
        0.28 * amp_scale,
    ]

    # Include a few hand-crafted candidates before stochastic search
    preset = [
        mean[:],
        [0.90 * amp_scale, 0.65 * amp_scale, 0.15 * amp_scale, 0.0, 0.12 * amp_scale, 0.08 * amp_scale],
        [0.60 * amp_scale, 0.80 * amp_scale, 0.25 * amp_scale, -0.08 * amp_scale, 0.20 * amp_scale, 0.10 * amp_scale],
        [0.95 * amp_scale, 0.45 * amp_scale, 0.05 * amp_scale, 0.06 * amp_scale, 0.15 * amp_scale, 0.02 * amp_scale],
        [0.50 * amp_scale, 0.95 * amp_scale, 0.28 * amp_scale, -0.04 * amp_scale, 0.22 * amp_scale, 0.12 * amp_scale],
    ]

    best_coeffs = mean[:]
    best_path = build_path(best_coeffs)
    best_score = proxy_score(best_path)

    for coeffs in preset:
        ys = build_path(coeffs)
        sc = proxy_score(ys)
        if sc < best_score:
            best_score = sc
            best_path = ys
            best_coeffs = coeffs[:]

    # Cross-Entropy Method search
    iterations = 9
    pop_size = 36
    elite_size = 8

    for _ in range(iterations):
        samples = []

        # Keep incumbent and mean-centered candidate
        for base_coeff in (best_coeffs, mean):
            ys = build_path(base_coeff)
            samples.append((proxy_score(ys), base_coeff[:], ys))

        # Random samples
        for _j in range(pop_size):
            coeffs = []
            for m, s in zip(mean, std):
                coeffs.append(rng.gauss(m, max(1e-6, s)))
            ys = build_path(coeffs)
            sc = proxy_score(ys)
            samples.append((sc, coeffs, ys))

        samples.sort(key=lambda z: z[0])
        elites = samples[:elite_size]

        if elites[0][0] < best_score:
            best_score = elites[0][0]
            best_coeffs = elites[0][1][:]
            best_path = elites[0][2][:]

        # Update distribution
        for k in range(len(mean)):
            vals = [e[1][k] for e in elites]
            new_mean = sum(vals) / len(vals)
            new_std = math.sqrt(sum((v - new_mean) ** 2 for v in vals) / len(vals) + 1e-9)

            # smoothing update to avoid collapse
            mean[k] = 0.55 * mean[k] + 0.45 * new_mean
            std[k] = max(0.10 * amp_scale, 0.60 * std[k] + 0.40 * new_std)

    ys = best_path[:]

    # Light post-smoothing while preserving overall bend
    if num_points >= 3:
        for _ in range(3):
            new_ys = ys[:]
            for i in range(1, num_points - 1):
                new_ys[i] = 0.2 * ys[i - 1] + 0.6 * ys[i] + 0.2 * ys[i + 1]
            ys = new_ys

    return [float(v) for v in ys]
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
