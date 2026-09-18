# EVOLVE-BLOCK-START
def evolve_drone_path(start, end, school, base, num_points):
    """
    【无人机连续空间多目标折线优化】
    Implements a Gaussian-Sinusoidal hybrid deformation to balance distance,
    noise avoidance, and signal strength.
    """
    import math

    x_s, y_s = start
    x_e, y_e = end

    y_coords = []

    # Calculate the total span and step sizes
    x_range = x_e - x_s
    y_range = y_e - y_s
    dx = x_range / (num_points + 1)
    dy = y_range / (num_points + 1)

    # Dynamic base variance depending on school-base X separation
    dist_sb_x = abs(school[0] - base[0])
    base_var = max(300.0, 200.0 + 15.0 * dist_sb_x)

    for i in range(num_points):
        # Current linear baseline position
        curr_x = x_s + (i + 1) * dx
        curr_y_lin = y_s + (i + 1) * dy

        y_temp = curr_y_lin

        # 1. School Repulsion (F2 Optimization)
        dist_x_sch = curr_x - school[0]
        # Narrow school kernel
        w_sch = math.exp(-(dist_x_sch**2) / 300.0)
        side_sch = -1.0 if school[1] > curr_y_lin else 1.0
        # Strong push away from school
        y_temp += side_sch * 35.0 * w_sch

        # 2. Base Station Attraction (F3 Optimization)
        dist_x_bs = curr_x - base[0]
        w_bs = math.exp(-(dist_x_bs**2) / base_var)
        # Pull towards base station sequentially
        y_temp += (base[1] - y_temp) * w_bs

        y_coords.append(float(y_temp))

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