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

    # Independent Gaussian widths: sharper school avoidance, broader base recovery
    sigma_s2 = 260.0
    sigma_b2 = 920.0

    for i in range(num_points):
        t = (i + 1) / (num_points + 1.0)
        x = x_start + (i + 1) * dx
        y_line = y_start + (i + 1) * dy

        # Smooth envelope keeps bends gentle near ends
        env = math.sin(math.pi * t)

        # Sequential update: baseline -> school repulsion -> base attraction
        y = y_line

        # 1) Bend away from school (localized, stronger)
        w_s = math.exp(-((x - sx) ** 2) / sigma_s2)
        push_dir = -1.0 if sy > y_line else 1.0
        y += push_dir * 34.0 * w_s * env

        # 2) Bend towards base (broader, moderate)
        w_b = math.exp(-((x - bx) ** 2) / sigma_b2)
        y += (by - y) * 0.82 * w_b * env

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