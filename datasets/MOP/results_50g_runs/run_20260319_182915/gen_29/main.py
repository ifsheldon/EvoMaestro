# EVOLVE-BLOCK-START
import math
import random

def evolve_drone_path(start, end, school, base, num_points):
    """
    Multi-objective drone path generation using a multi-scale basis model
    optimized by an exact proxy score and Coordinate Descent.
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
    y_span = abs(y1 - y0) + abs(x1 - x0)

    # -------- 1) Multi-Scale Basis Setup --------
    num_ctrl_fine = 16
    num_ctrl_coarse = 8
    num_ctrl_global = 4
    
    ctrl_xs = []
    sigmas = []
    
    # Fine basis (for sharp local avoidance)
    for i in range(num_ctrl_fine):
        ctrl_xs.append(x0 + dx_total * (i + 1) / (num_ctrl_fine + 1))
        sigmas.append(abs(dx_total) / (num_ctrl_fine + 1) * 1.5)
        
    # Coarse basis (for broad regional bends)
    for i in range(num_ctrl_coarse):
        ctrl_xs.append(x0 + dx_total * (i + 1) / (num_ctrl_coarse + 1))
        sigmas.append(abs(dx_total) / (num_ctrl_coarse + 1) * 2.5)
        
    # Global basis (for overall trajectory bias)
    for i in range(num_ctrl_global):
        ctrl_xs.append(x0 + dx_total * (i + 1) / (num_ctrl_global + 1))
        sigmas.append(abs(dx_total) * 0.4)
        
    num_ctrl = len(ctrl_xs)

    # Precompute basis evaluations to make get_path extremely fast
    basis = []
    for i, x in enumerate(xs):
        t = (x - x0) / (dx_total + 1e-12)
        envelope = math.sin(math.pi * t)  # Ensures smooth connection to start/end
        row = []
        for j in range(num_ctrl):
            val = math.exp(-0.5 * ((x - ctrl_xs[j]) / sigmas[j]) ** 2) * envelope
            row.append(val)
        basis.append(row)
        
    y_lin = [y0 + (y1 - y0) * (x - x0) / (dx_total + 1e-12) for x in xs]

    def get_path(c_ys):
        ys = [0.0] * num_points
        for i in range(num_points):
            dev = 0.0
            b_row = basis[i]
            for j in range(num_ctrl):
                dev += c_ys[j] * b_row[j]
            ys[i] = y_lin[i] + dev
        return ys

    # -------- 2) Exact Proxy Score (F1 * F2 * F3) --------
    straight_length = math.hypot(x1 - x0, y1 - y0) + 1e-9
    f2_ends = 1.0 / ((x0 - sx)**2 + (y0 - sy)**2 + 25.0) + 1.0 / ((x1 - sx)**2 + (y1 - sy)**2 + 25.0)
    f3_ends = math.hypot(x0 - bx, y0 - by) + math.hypot(x1 - bx, y1 - by)

    def proxy_score(ys):
        length = 0.0
        f2 = f2_ends
        f3 = f3_ends
        
        px, py = x0, y0
        for i in range(num_points):
            x = xs[i]
            y = ys[i]
            
            length += math.hypot(x - px, y - py)
            px, py = x, y
            
            d2_s = (x - sx) ** 2 + (y - sy) ** 2
            f2 += 1.0 / (d2_s + 25.0)
            f3 += math.hypot(x - bx, y - by)
            
        length += math.hypot(x1 - px, y1 - py)
        f1 = length / straight_length
        
        return f1 * f2 * f3

    # -------- 3) Diverse Grid Initialization --------
    initial_candidates = []
    scales = [-1.0, -0.5, 0.0, 0.5, 1.0]
    for scale_s in scales:
        for scale_b in scales:
            c_ys = [0.0] * num_ctrl
            for j in range(num_ctrl):
                cx = ctrl_xs[j]
                # Apply initial heuristic bumps only to coarse/global basis
                if sigmas[j] > abs(dx_total) * 0.15:
                    d_s = abs(cx - sx)
                    if d_s < y_span * 0.8:
                        c_ys[j] += scale_s * y_span * math.exp(- (d_s / (y_span * 0.4))**2)
                    d_b = abs(cx - bx)
                    if d_b < y_span * 0.8:
                        c_ys[j] += scale_b * y_span * math.exp(- (d_b / (y_span * 0.4))**2)
            initial_candidates.append(c_ys)

    # Evaluate all initial topologies and pick the top 3
    scored_candidates = []
    for c_ys in initial_candidates:
        ys = get_path(c_ys)
        sc = proxy_score(ys)
        scored_candidates.append((sc, c_ys))
        
    scored_candidates.sort(key=lambda item: item[0])
    top_candidates = [item[1] for item in scored_candidates[:3]]

    # -------- 4) Optimized Coordinate Descent --------
    seed_val = (
        int(round(x0 * 17 + y0 * 19 + x1 * 23 + y1 * 29 + sx * 31 + sy * 37 + bx * 41 + by * 43))
        + num_points * 97
    ) & 0xFFFFFFFF
    rng = random.Random(seed_val)

    best_overall_score = float('inf')
    best_overall_c_ys = None

    for init_c_ys in top_candidates:
        curr_c_ys = init_c_ys[:]
        curr_score = proxy_score(get_path(curr_c_ys))
        
        step_size = y_span * 0.4
        for _ in range(75):
            improved = False
            indices = list(range(num_ctrl))
            rng.shuffle(indices)
            
            for j in indices:
                best_step_val = curr_c_ys[j]
                best_step_score = curr_score
                original_val = curr_c_ys[j]
                
                # Test independent steps from the current state (non-cumulative)
                for step in [-step_size, -step_size*0.5, -step_size*0.25, step_size*0.25, step_size*0.5, step_size]:
                    curr_c_ys[j] = original_val + step
                    ys = get_path(curr_c_ys)
                    sc = proxy_score(ys)
                    if sc < best_step_score:
                        best_step_score = sc
                        best_step_val = curr_c_ys[j]
                        
                # Apply the best step if it strictly improves the score
                if best_step_score < curr_score:
                    curr_score = best_step_score
                    curr_c_ys[j] = best_step_val
                    improved = True
                else:
                    curr_c_ys[j] = original_val  # Revert to original
                    
            if not improved:
                step_size *= 0.6
                if step_size < 0.001:
                    break
                    
        if curr_score < best_overall_score:
            best_overall_score = curr_score
            best_overall_c_ys = curr_c_ys[:]

    # -------- 5) Final Path Generation --------
    best_ys = get_path(best_overall_c_ys)
    return [float(v) for v in best_ys]
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