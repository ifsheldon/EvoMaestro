# EVOLVE-BLOCK-START
def evolve_drone_path(start, end, school, base, num_points):
    """
    【无人机连续空间多目标折线优化】
    返回一个长度为 num_points 的列表，表示在 X 轴均匀采样下的中间 Y 坐标。

    改进策略：
    1. 以起终点直线作为最短距离基线；
    2. 在 school 的 X 邻域施加平滑“远离”偏置，降低噪音邻近；
    3. 在 base 的 X 邻域施加平滑“靠近”偏置，改善信号覆盖；
    4. 使用高斯权重保证轨迹连续、平滑、无尖角。
    """
    import math

    x_start, y_start = start
    x_end, y_end = end
    sx, sy = school
    bx, by = base

    if num_points <= 0:
        return []

    dx_total = x_end - x_start
    if abs(dx_total) < 1e-12:
        # 极端情况下 X 不变化，则直接平滑插值 Y
        step = (y_end - y_start) / (num_points + 1)
        return [float(y_start + (i + 1) * step) for i in range(num_points)]

    def line_y(x):
        t = (x - x_start) / dx_total
        return y_start + (y_end - y_start) * t

    def gaussian(x, mu, sigma):
        sigma = max(float(sigma), 1e-6)
        z = (x - mu) / sigma
        return math.exp(-0.5 * z * z)

    # 采样中间点 X（与原实现保持一致：不包含起终点）
    xs = [x_start + (i + 1) * dx_total / (num_points + 1) for i in range(num_points)]
    baseline = [line_y(x) for x in xs]

    # 基于直线与学校/基站相对位置，决定上下偏置方向
    school_line_y = line_y(sx)

    # 远离学校：若学校在线上方，则向下压；若在线下方，则向上抬
    away_dir = -1.0 if sy >= school_line_y else 1.0

    # 横向作用范围：学校影响更局部，基站吸引也更局部以防止路径过长
    span = abs(dx_total)
    sigma_school = max(span * 0.16, 8.0)
    sigma_base = max(span * 0.22, 10.0)

    # 动态计算学校排斥力：基线离学校越近，排斥力越强
    school_gap = abs(sy - school_line_y)
    amp_school = max(15.0, 35.0 - 0.5 * school_gap)
    base_pull_rate = 0.80

    y_coords = []
    for x, y0 in zip(xs, baseline):
        w_school = gaussian(x, sx, sigma_school)
        w_base = gaussian(x, bx, sigma_base)

        # 1. 学校排斥：在基线基础上偏移
        y = y0 + away_dir * amp_school * w_school

        # 2. 冲突感知的基站吸引：
        # 如果当前位置受学校影响较大，则减弱基站的吸引力，防止被拉回学校噪音区
        # 吸引力与当前 y 到 by 的距离成正比
        conflict_factor = 1.0 - 0.85 * w_school
        pull = base_pull_rate * w_base * conflict_factor

        y += pull * (by - y)

        y_coords.append(float(y))

    # 轻量平滑，减少折线抖动与额外路程
    smooth_alpha = 0.35
    for _ in range(2):
        smoothed = []
        for i in range(num_points):
            left = y_start if i == 0 else y_coords[i - 1]
            right = y_end if i == num_points - 1 else y_coords[i + 1]
            smoothed.append((1.0 - smooth_alpha) * y_coords[i] + smooth_alpha * 0.5 * (left + right))
        y_coords = smoothed

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