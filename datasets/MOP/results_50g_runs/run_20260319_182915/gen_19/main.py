# EVOLVE-BLOCK-START
import math

def evolve_drone_path(start, end, school, base, num_points):
    """
    Direct Pointwise Active Contour Optimization via Adam.
    Perfectly aligns with Multi-Objective (product-based) MOP scaling
    by optimizing the exact natural log representations of Length, School 
    Repulsion, and Base Station Attraction, balanced with analytic curvature gradients.
    """
    if num_points <= 0:
        return []

    x0, y0 = start
    x1, y1 = end
    sx, sy = school
    bx, by = base
    N = num_points

    dx_total = x1 - x0
    # Fallback for vertical lines
    if abs(dx_total) < 1e-12:
        return [float((y0 + y1) * 0.5)] * N

    dx = dx_total / (N + 1)
    xs = [x0 + (i + 1) * dx for i in range(N)]
    y_line = [y0 + (y1 - y0) * (x - x0) / dx_total for x in xs]

    span_x = abs(dx_total)

    def get_loss_and_grad(ys):
        L = math.hypot(xs[0] - x0, ys[0] - y0) + math.hypot(x1 - xs[-1], y1 - ys[-1])
        for i in range(N - 1):
            L += math.hypot(xs[i+1] - xs[i], ys[i+1] - ys[i])
            
        S = 0.0
        for x, y in zip(xs, ys):
            S += 1.0 / ((x - sx)**2 + (y - sy)**2 + 16.0)
            
        B = 0.0
        for x, y in zip(xs, ys):
            B += math.hypot(x - bx, y - by)

        # To avoid math.log(0)
        if L < 1e-12: L = 1e-12
        if S < 1e-12: S = 1e-12
        if B < 1e-12: B = 1e-12

        grad = [0.0] * N
        
        # d(logL): Pulls path taught (elasticity)
        py_prev = y0
        for i in range(N):
            dy_prev = ys[i] - py_prev
            dx_prev = xs[i] - (xs[i-1] if i > 0 else x0)
            dist_prev = math.hypot(dx_prev, dy_prev) + 1e-9
            
            if i < N - 1:
                dy_next = ys[i] - ys[i+1]
                dx_next = xs[i] - xs[i+1]
            else:
                dy_next = ys[i] - y1
                dx_next = xs[i] - x1
            dist_next = math.hypot(dx_next, dy_next) + 1e-9
            
            grad[i] += (dy_prev / dist_prev + dy_next / dist_next) / L
            py_prev = ys[i]
            
        # d(logS): Repels horizontally from the school noise bubble
        for i in range(N):
            dyi = ys[i] - sy
            d2 = (xs[i] - sx)**2 + dyi**2
            grad[i] += (-2.0 * dyi / ((d2 + 16.0)**2)) / S

        # d(logB): Attracts toward the base station
        for i in range(N):
            dyi = ys[i] - by
            dist = math.hypot(xs[i] - bx, dyi) + 1e-9
            grad[i] += (dyi / dist) / B

        scale = max(0.1, (N / 50.0) ** 2)
        c_curv = 0.003 * scale
        c_bend = 0.001 * scale
        c_tether = 0.0001
        
        # Penalizes high second derivatives (ensures large radii of curvature)
        curv_loss = 0.0
        if N >= 3:
            for i in range(1, N - 1):
                dd = ys[i-1] - 2.0*ys[i] + ys[i+1]
                curv_loss += c_curv * dd * dd
                
                grad[i-1] += c_curv * 2.0 * dd
                grad[i]   -= c_curv * 4.0 * dd
                grad[i+1] += c_curv * 2.0 * dd

        # Penalizes high fourth derivatives (suppresses ripples)
        bend_loss = 0.0
        if N >= 5:
            for i in range(2, N - 2):
                b4 = ys[i-2] - 4.0*ys[i-1] + 6.0*ys[i] - 4.0*ys[i+1] + ys[i+2]
                bend_loss += c_bend * b4 * b4
                
                grad[i-2] += c_bend * 2.0 * b4
                grad[i-1] -= c_bend * 8.0 * b4
                grad[i]   += c_bend * 12.0 * b4
                grad[i+1] -= c_bend * 8.0 * b4
                grad[i+2] += c_bend * 2.0 * b4
                
        # Minor tether against infinity
        tether_loss = 0.0
        for i in range(N):
            dy = ys[i] - y_line[i]
            tether_loss += c_tether * dy * dy
            grad[i] += c_tether * 2.0 * dy

        total_loss = math.log(L) + math.log(S) + math.log(B) + curv_loss + bend_loss + tether_loss
        return total_loss, grad

    # Provide divergent seed shapes to assure broad local minimum capture 
    init_paths = [y_line[:]]
    
    def make_bump_path(sign, amp_factor):
        path = []
        for i, x in enumerate(xs):
            t = (x - x0) / dx_total
            bump = math.sin(math.pi * t)
            path.append(y_line[i] + sign * amp_factor * span_x * bump)
        return path
        
    y_school_on_line = y0 + (y1 - y0) * ((sx - x0) / dx_total)
    school_sign = -1.0 if sy >= y_school_on_line else 1.0
    
    y_base_on_line = y0 + (y1 - y0) * ((bx - x0) / dx_total)
    base_sign = 1.0 if by >= y_base_on_line else -1.0
    
    init_paths.append(make_bump_path(school_sign, 0.4))
    init_paths.append(make_bump_path(school_sign, 0.2))
    init_paths.append(make_bump_path(base_sign, 0.3))
    
    path_combo = []
    for i, x in enumerate(xs):
        t = (x - x0) / dx_total
        bump = math.sin(math.pi * t)
        path_combo.append(y_line[i] + (school_sign * 0.3 + base_sign * 0.3) * span_x * bump)
    init_paths.append(path_combo)
    
    path_combo_neg = []
    for i, x in enumerate(xs):
        t = (x - x0) / dx_total
        bump = math.sin(math.pi * t)
        path_combo_neg.append(y_line[i] + (-school_sign * 0.2 - base_sign * 0.2) * span_x * bump)
    init_paths.append(path_combo_neg)

    best_ys = None
    best_loss = float('inf')

    iterations = 400
    lr_init = max(0.5, span_x * 0.1)

    for init_ys in init_paths:
        ys = list(init_ys)
        
        m = [0.0] * N
        v = [0.0] * N
        beta1 = 0.9
        beta2 = 0.999
        eps_adam = 1e-8
        
        for step in range(1, iterations + 1):
            _, grad = get_loss_and_grad(ys)
            
            # Cosine decay schedule targeting the 0-range perfectly
            current_lr = lr_init * 0.5 * (1.0 + math.cos(math.pi * step / iterations))
            
            for i in range(N):
                m[i] = beta1 * m[i] + (1 - beta1) * grad[i]
                v[i] = beta2 * v[i] + (1 - beta2) * (grad[i] * grad[i])
                
                m_hat = m[i] / (1 - beta1 ** step)
                v_hat = v[i] / (1 - beta2 ** step)
                
                ys[i] -= current_lr * m_hat / (math.sqrt(v_hat) + eps_adam)
        
        final_loss, _ = get_loss_and_grad(ys)
        if final_loss < best_loss:
            best_loss = final_loss
            best_ys = ys

    if best_ys is None:
        best_ys = y_line[:]

    # Guaranteed passive final smoothing
    if N >= 3:
        ys = best_ys[:]
        for _ in range(3):
            new_ys = ys[:]
            for i in range(1, N - 1):
                new_ys[i] = 0.25 * ys[i-1] + 0.50 * ys[i] + 0.25 * ys[i+1]
            ys = new_ys
        best_ys = ys

    return [float(y) for y in best_ys]
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