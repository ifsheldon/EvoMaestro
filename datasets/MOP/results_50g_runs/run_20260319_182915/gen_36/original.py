# EVOLVE-BLOCK-START
import math

def evolve_drone_path(start, end, school, base, num_points):
    """
    【无人机连续空间多目标折线优化】
    LLMs 将被要求在这里编写代码（可以使用启发式寻找策略，或者单纯使用规则拟合）。
    你需要返回一个长度为 num_points 的列表，包含从起点到终点按 X 匀速布置对应的 Y 轴偏移量。
    """
    x_start, y_start = start
    x_end, y_end = end
    x_s, y_s = school
    x_b, y_b = base

    xs = [x_start + (i + 1) * (x_end - x_start) / (num_points + 1) for i in range(num_points)]
    lx = (x_end - x_start) if x_end != x_start else 1.0
    line_ys = [y_start + (x - x_start) * (y_end - y_start) / lx for x in xs]

    # Precompute sine window to maintain smooth entry/exit at endpoints
    wins = [math.sin(math.pi * (x - x_start) / lx) for x in xs]

    # Directions: push away from school center, pull towards base station center
    y_ls = y_start + (x_s - x_start) * (y_end - y_start) / lx
    ds = -1.0 if y_s > y_ls else 1.0
    y_lb = y_start + (x_b - x_start) * (y_end - y_start) / lx
    db = 1.0 if y_b > y_lb else -1.0

    # Grid search parameters for amplitudes and widths
    amps = [0, 20, 40, 60, 80]
    widths = [200.0, 600.0, 1200.0]

    # Precompute Gaussian shapes for efficiency during grid search iterations
    g_s = [[math.exp(-((x - x_s)**2) / w) for x in xs] for w in widths]
    g_b = [[math.exp(-((x - x_b)**2) / w) for x in xs] for w in widths]

    best_score = float('inf')
    best_ys = line_ys[:]
    straight_dist = math.hypot(x_end - x_start, y_end - y_start) or 1.0

    # Grid search for the optimal Gaussian superposition to minimize combined F1*F2*F3
    for a_s in amps:
        for a_b in amps:
            for i_ws in range(len(widths)):
                sh_s = g_s[i_ws]
                for i_wb in range(len(widths)):
                    sh_b = g_b[i_wb]

                    # Generate path candidates by perturbing the straight line
                    c_ys = [(line_ys[i] + (ds*a_s*sh_s[i] + db*a_b*sh_b[i]) * wins[i]) for i in range(num_points)]

                    # Score evaluation (F1: distance loss, F2: noise penalty, F3: signal loss)
                    dist, f2, f3 = 0.0, 0.0, 0.0
                    px, py = x_start, y_start
                    for i in range(num_points):
                        cx, cy = xs[i], c_ys[i]
                        dist += math.hypot(cx - px, cy - py)
                        f2 += 1.0 / ((cx - x_s)**2 + (cy - y_s)**2 + 1e-3)
                        f3 += math.sqrt((cx - x_b)**2 + (cy - y_b)**2)
                        px, py = cx, cy
                    dist += math.hypot(x_end - px, y_end - py)

                    score = (dist / straight_dist) * f2 * f3
                    if score < best_score:
                        best_score = score
                        best_ys = c_ys

    return best_ys
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