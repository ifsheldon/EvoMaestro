# EVOLVE-BLOCK-START
import math

def evolve_drone_path(start, end, school, base, num_points):
    """
    【Adaptive Active Contours】
    Upgrades the physics-based path optimization with an Adam optimizer 
    and exact arc-length gradients. A scheduled learning rate ensures 
    rapid initial exploration and fine-tuned convergence, minimizing 
    signal drop and noise while keeping the path smooth.
    """
    x_start, y_start = start
    x_end, y_end = end
    x_school, y_school = school
    x_base, y_base = base
    
    dx = (x_end - x_start) / (num_points + 1)
    
    # Initialize with a straight line
    y_coords = [y_start + (i + 1) * (y_end - y_start) / (num_points + 1) for i in range(num_points)]
    x_coords = [x_start + (i + 1) * dx for i in range(num_points)]
    
    # Hyperparameters for the physics simulation
    iterations = 600
    initial_lr = 2.5
    
    alpha = 300.0        # Smoothness penalty (minimizes distance)
    beta = 15000.0       # School repulsion strength (minimizes noise)
    sigma_school = 30.0  # School influence radius
    gamma = 40.0         # Base attraction strength (minimizes signal drop)
    sigma_base = 40.0    # Base influence radius
    
    # Adam optimizer state
    m = [0.0] * num_points
    v = [0.0] * num_points
    beta1 = 0.9
    beta2 = 0.999
    epsilon = 1e-8
    
    for t in range(1, iterations + 1):
        # Linear learning rate decay
        lr = initial_lr * (1.0 - t / (iterations + 1))
        
        for i in range(num_points):
            y_prev = y_start if i == 0 else y_coords[i-1]
            y_next = y_end if i == num_points - 1 else y_coords[i+1]
            y_curr = y_coords[i]
            x_curr = x_coords[i]
            
            # 1. Smoothness gradient (exact arc length derivative)
            dy_prev = y_curr - y_prev
            dy_next = y_curr - y_next
            dist_prev = math.sqrt(dx**2 + dy_prev**2 + 1e-12)
            dist_next = math.sqrt(dx**2 + dy_next**2 + 1e-12)
            grad_smooth = (dy_prev / dist_prev) + (dy_next / dist_next)
            
            # 2. School repulsion gradient (pushes away from school)
            dist_sq_school = (x_curr - x_school)**2 + (y_curr - y_school)**2
            dy_school = y_curr - y_school
            if abs(dy_school) < 1e-5:
                dy_school = 1e-5  # Break symmetry
                
            grad_school = -beta * math.exp(-dist_sq_school / (2.0 * sigma_school**2)) * dy_school / (sigma_school**2)
            
            # 3. Base attraction gradient (pulls towards base Y, weighted by X distance)
            weight_base = math.exp(-((x_curr - x_base)**2) / (2.0 * sigma_base**2))
            grad_base = gamma * weight_base * (y_curr - y_base)
            
            # Combine gradients
            total_grad = alpha * grad_smooth + grad_school + grad_base
            
            # Adam update (in-place for faster convergence)
            m[i] = beta1 * m[i] + (1.0 - beta1) * total_grad
            v[i] = beta2 * v[i] + (1.0 - beta2) * (total_grad ** 2)
            
            m_hat = m[i] / (1.0 - beta1 ** t)
            v_hat = v[i] / (1.0 - beta2 ** t)
            
            y_coords[i] = y_curr - lr * m_hat / (math.sqrt(v_hat) + epsilon)
            
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
