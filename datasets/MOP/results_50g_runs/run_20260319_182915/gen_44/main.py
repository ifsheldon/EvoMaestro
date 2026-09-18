# EVOLVE-BLOCK-START
import math

def evolve_drone_path(start, end, school, base, num_points):
    """
    【Active Contours / Physics-based Path Optimization】
    Models the path as a physical string and applies gradient descent
    to minimize an energy function balancing distance, noise, and signal.
    """
    x_start, y_start = start
    x_end, y_end = end
    x_school, y_school = school
    x_base, y_base = base

    dx = (x_end - x_start) / (num_points + 1)

    # Initialize with a straight line
    y_coords = [y_start + (i + 1) * (y_end - y_start) / (num_points + 1) for i in range(num_points)]
    x_coords = [x_start + (i + 1) * dx for i in range(num_points)]

    # Heuristic initialization to avoid local minima
    dx_total = x_end - x_start
    if abs(dx_total) > 1e-5:
        y_line_at_school = y_start + (x_school - x_start) / dx_total * (y_end - y_start)
    else:
        y_line_at_school = y_start
    school_dir = 1.0 if y_line_at_school > y_school else -1.0

    for i in range(num_points):
        x_curr = x_coords[i]
        # Push away from school
        dist_x_school = x_curr - x_school
        push = school_dir * 25.0 * math.exp(-(dist_x_school**2) / 400.0)

        # Pull towards base
        dist_x_base = x_curr - x_base
        pull = (y_base - y_coords[i]) * 0.4 * math.exp(-(dist_x_base**2) / 600.0)

        y_coords[i] += push + pull

    # Hyperparameters for the physics simulation
    learning_rate = 0.05
    iterations = 800

    alpha = 0.2          # Length penalty (minimizes distance)
    alpha_curv = 0.8     # Curvature penalty (minimizes bending)
    beta = 6000.0        # School repulsion strength (minimizes noise)
    sigma_school = 22.0  # School influence radius
    gamma = 8.0          # Base attraction strength (minimizes signal drop)
    sigma_base = 28.0    # Base influence radius

    for _ in range(iterations):
        for i in range(num_points):
            y_curr = y_coords[i]
            x_curr = x_coords[i]

            y_prev = y_start if i == 0 else y_coords[i-1]
            y_next = y_end if i == num_points - 1 else y_coords[i+1]

            if i == 0:
                y_prev2 = 2.0 * y_start - y_curr
            elif i == 1:
                y_prev2 = y_start
            else:
                y_prev2 = y_coords[i-2]

            if i == num_points - 1:
                y_next2 = 2.0 * y_end - y_curr
            elif i == num_points - 2:
                y_next2 = y_end
            else:
                y_next2 = y_coords[i+2]

            # 1. Length gradient (pulls towards average of neighbors)
            grad_length = 2.0 * (2.0 * y_curr - y_prev - y_next)

            # 1b. Curvature gradient (bi-Laplacian, penalizes sharp bends)
            grad_curv = 2.0 * (y_prev2 - 4.0 * y_prev + 6.0 * y_curr - 4.0 * y_next + y_next2)

            # 2. School repulsion gradient (pushes away from school)
            dist_sq_school = (x_curr - x_school)**2 + (y_curr - y_school)**2
            dy_school = y_curr - y_school
            if abs(dy_school) < 1e-5:
                dy_school = 1e-5  # Break symmetry if path is exactly on the school

            grad_school = -beta * math.exp(-dist_sq_school / (2.0 * sigma_school**2)) * dy_school / (sigma_school**2)

            # 3. Base attraction gradient (pulls towards base Y, weighted by X distance)
            weight_base = math.exp(-((x_curr - x_base)**2) / (2.0 * sigma_base**2))
            grad_base = 2.0 * gamma * weight_base * (y_curr - y_base)

            # Combine gradients
            total_grad = alpha * grad_length + alpha_curv * grad_curv + grad_school + grad_base

            # Clip gradient to prevent numerical instability
            total_grad = max(min(total_grad, 50.0), -50.0)

            # Update position (Gauss-Seidel style in-place update)
            y_coords[i] = y_curr - learning_rate * total_grad

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