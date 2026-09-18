# EVOLVE-BLOCK-START
def evolve_drone_path(start, end, school, base, num_points):
    """
    Optimizes the drone path using a Gaussian Potential Field.
    Bends the path away from the school and towards the base station.
    """
    import math

    x_start, y_start = start
    x_end, y_end = end
    x_school, y_school = school
    x_base, y_base = base

    # Path span
    dx_total = x_end - x_start
    dy_total = y_end - y_start

    y_coords = []

    # Hyperparameters for the Gaussian Kernels
    # Sigma (width) and K (strength/amplitude)
    # Base station attraction (to minimize F3)
    sigma_base = 32.0
    k_base = 0.94      # Pull strength (0.0 to 1.0)

    # School repulsion (to minimize F2)
    sigma_school = 18.0
    k_school = 14.0    # Vertical displacement magnitude

    # Second recovery pass near the base
    sigma_base_post = 9.0
    k_base_post = 0.25

    for i in range(1, num_points + 1):
        # Calculate progress t from 0 to 1
        t = i / (num_points + 1)

        # Current horizontal position (assuming uniform X distribution)
        curr_x = x_start + t * dx_total

        # 1. Start with the baseline linear Y coordinate
        y_linear = y_start + t * dy_total

        # 2. Apply Attraction Field (Base Station)
        # Calculate Gaussian influence based on X distance to base station
        dist_x_base = curr_x - x_base
        influence_base = math.exp(-(dist_x_base**2) / (2 * sigma_base**2))
        # Pull the current Y towards the base station Y
        shift_attract = influence_base * (y_base - y_linear) * k_base

        # 3. Apply Repulsion Field (School)
        # Calculate Gaussian influence based on X distance to school
        dist_x_school = curr_x - x_school
        influence_school = math.exp(-(dist_x_school**2) / (2 * sigma_school**2))
        # Determine direction: push away from school Y
        # If school is above the linear path, push down. If below, push up.
        direction = -1.0 if y_school > y_linear else 1.0
        shift_repel = influence_school * direction * k_school

        # Combine the linear path with the potential field shifts
        final_y = y_linear + shift_attract + shift_repel

        # 4. Apply a small second recovery pass near the base
        influence_base_post = math.exp(-(dist_x_base**2) / (2 * sigma_base_post**2))
        final_y += influence_base_post * (y_base - final_y) * k_base_post

        y_coords.append(float(final_y))

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