# EVOLVE-BLOCK-START
def evolve_drone_path(start, end, school, base, num_points):
    """
    【无人机连续空间多目标折线优化】
    LLMs 将被要求在这里编写代码（可以使用启发式寻找策略，或者单纯使用规则拟合）。
    你需要返回一个长度为 num_points 的列表，包含从起点到终点按 X 匀速布置对应的 Y 轴偏移量。
    """
    import math
    x_start, y_start = start
    x_end, y_end = end
    sx, sy = school
    bx, by = base

    y_coords = []
    dx = (x_end - x_start) / (num_points + 1)
    dy = (y_end - y_start) / (num_points + 1)

    # Exact 2-Point Gaussian Interpolator
    sigma_s2 = 350.0
    sigma_b2 = 700.0

    t_sx = (sx - x_start) / (x_end - x_start) if x_end != x_start else 0.0
    y_line_sx = y_start + t_sx * (y_end - y_start)

    t_bx = (bx - x_start) / (x_end - x_start) if x_end != x_start else 0.0
    y_line_bx = y_start + t_bx * (y_end - y_start)

    # Choose school avoidance side to minimize curve length towards base
    y_s1 = sy + 40.0
    y_s2 = sy - 40.0
    target_s = y_s1 if abs(y_s1 - by) < abs(y_s2 - by) else y_s2
    target_b = by

    env_s = max(0.1, math.sin(math.pi * max(0.0, min(1.0, t_sx))))
    env_b = max(0.1, math.sin(math.pi * max(0.0, min(1.0, t_bx))))

    O_s = (target_s - y_line_sx) / env_s
    O_b = (target_b - y_line_bx) / env_b

    E_sb = math.exp(-((sx - bx) ** 2) / sigma_b2)
    E_bs = math.exp(-((bx - sx) ** 2) / sigma_s2)

    det = 1.0 - E_sb * E_bs
    if abs(det) < 1e-6:
        A_s, A_b = O_s, O_b
    else:
        A_s = (O_s - O_b * E_sb) / det
        A_b = (O_b - O_s * E_bs) / det

    for i in range(num_points):
        t = (i + 1) / (num_points + 1.0)
        x = x_start + (i + 1) * dx
        y_line = y_start + (i + 1) * dy

        env = math.sin(math.pi * t)

        w_s = math.exp(-((x - sx) ** 2) / sigma_s2)
        w_b = math.exp(-((x - bx) ** 2) / sigma_b2)

        y = y_line + (A_s * w_s + A_b * w_b) * env
        y_coords.append(float(y))

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