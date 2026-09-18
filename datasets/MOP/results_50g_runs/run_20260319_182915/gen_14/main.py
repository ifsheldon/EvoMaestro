# EVOLVE-BLOCK-START
def evolve_drone_path(start, end, school, base, num_points):
    """
    【无人机连续空间多目标折线优化】
    使用平滑启发式：
    1) 以起终点直线为基线，保证距离代价不过分恶化；
    2) 在学校附近加入“远离学校”的平滑斥力；
    3) 在基站附近加入“靠近基站”的平滑引力；
    4) 使用端点为零的正弦包络，避免折线出现突兀拐点。
    """
    import math

    x_start, y_start = start
    x_end, y_end = end
    sx, sy = school
    bx, by = base

    if num_points <= 0:
        return []

    dx_total = x_end - x_start
    if abs(dx_total) < 1e-9:
        return [float(y_start + (y_end - y_start) * (i + 1) / (num_points + 1)) for i in range(num_points)]

    def gauss(x, mu, sigma):
        sigma = max(float(sigma), 1e-6)
        z = (x - mu) / sigma
        return math.exp(-0.5 * z * z)

    y_coords = []

    # Use wider sigmas to ensure the drone stays in the optimal signal/noise zones longer
    school_sigma = max(abs(dx_total) * 0.20, 15.0)
    base_sigma = max(abs(dx_total) * 0.25, 20.0)

    for i in range(num_points):
        t = (i + 1) / (num_points + 1)
        x = x_start + dx_total * t
        y_line = y_start + (y_end - y_start) * t

        # Flattened sine envelope allows more persistent deviation in the middle regions
        envelope = math.sin(math.pi * t)**0.7

        # Dynamic repulsion from school and attraction to base station
        # school_push moves the path away from sy; base_pull moves it towards by
        school_push = (y_line - sy) * 1.2 * gauss(x, sx, school_sigma)
        base_pull = (by - y_line) * 1.1 * gauss(x, bx, base_sigma)

        # Combine influences and clip to prevent extreme detours (safety limit)
        offset = envelope * (school_push + base_pull)
        offset = max(min(offset, 60.0), -60.0)

        y_coords.append(float(y_line + offset))

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