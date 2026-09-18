# EVOLVE-BLOCK-START
import math

def evolve_drone_path(start, end, school, base, num_points):
    """
    【无人机连续空间多目标折线优化】
    Optimizes path to minimize Flying distance (F1), School noise proximity (F2), and Signal loss (F3).
    Implements a hierarchical coarse-to-fine gradient descent using Adam with spatial blurring.
    """
    x_start, y_start = start
    x_end, y_end = end
    sx, sy = school
    bx, by = base
    
    # Initialize uniform straight line between start and end
    dx = (x_end - x_start) / (num_points + 1)
    xs = [x_start + (i + 1) * dx for i in range(num_points)]
    ys = [y_start + (y_end - y_start) * (i + 1) / (num_points + 1) for i in range(num_points)]
    
    # Adam optimizer variables
    m = [0.0] * num_points
    v = [0.0] * num_points
    beta1, beta2 = 0.9, 0.999
    epsilon = 1e-8
    
    total_steps = 1000
    
    for step in range(1, total_steps + 1):
        progress = step / total_steps
        lr = 0.5 * (1.0 - progress * 0.8)  # Gradual decay
        
        # 1. Prepare coordinates
        pts_x = [x_start] + xs + [x_end]
        pts_y = [y_start] + ys + [y_end]
        
        # 2. Calculate objective function values (F1, F2, F3)
        f1 = 0.0
        for i in range(num_points + 1):
            f1 += math.hypot(pts_x[i+1] - pts_x[i], pts_y[i+1] - pts_y[i])
            
        f2 = 0.0
        f3 = 0.0
        dists_s_sq = []
        dists_b = []
        for i in range(num_points):
            ds2 = (xs[i] - sx)**2 + (ys[i] - sy)**2 + 1e-6
            db = math.sqrt((xs[i] - bx)**2 + (ys[i] - by)**2 + 1e-6)
            f2 += (1.0 / ds2)
            f3 += db
            dists_s_sq.append(ds2)
            dists_b.append(db)
            
        # 3. Compute Gradients for each point
        grads = [0.0] * num_points
        for i in range(num_points):
            y = ys[i]
            x = xs[i]
            
            # Distance Gradient (F1)
            d1 = math.hypot(x - pts_x[i], y - pts_y[i]) + 1e-8
            d2 = math.hypot(pts_x[i+2] - x, pts_y[i+2] - y) + 1e-8
            grad_f1 = (y - pts_y[i]) / d1 - (pts_y[i+2] - y) / d2
            
            # School Noise Gradient (F2)
            grad_f2 = -2.0 * (y - sy) / (dists_s_sq[i] ** 2)
            
            # Signal Loss Gradient (F3)
            grad_f3 = (y - by) / dists_b[i]
            
            # Aggregated gradient: d(ln(F1*F2*F3))/dy = dF1/F1 + dF2/F2 + dF3/F3
            grads[i] = (grad_f1 / f1) + (grad_f2 / f2) + (grad_f3 / f3)
            
        # 4. Hierarchical Gradient Blurring (Coarse-to-Fine)
        # Blur radius starts high to establish global shape then shrinks to zero
        radius = int(num_points * 0.25 * (1.0 - progress))
        if radius > 0:
            smoothed_grads = [0.0] * num_points
            for i in range(num_points):
                low = max(0, i - radius)
                high = min(num_points - 1, i + radius)
                s_sum = 0.0
                for j in range(low, high + 1):
                    s_sum += grads[j]
                smoothed_grads[i] = s_sum / (high - low + 1)
            grads = smoothed_grads
            
        # 5. Adam Optimizer Update
        for i in range(num_points):
            m[i] = beta1 * m[i] + (1 - beta1) * grads[i]
            v[i] = beta2 * v[i] + (1 - beta2) * (grads[i] ** 2)
            
            m_hat = m[i] / (1 - beta1 ** step)
            v_hat = v[i] / (1 - beta2 ** step)
            
            ys[i] -= lr * m_hat / (math.sqrt(v_hat) + epsilon)
            
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
