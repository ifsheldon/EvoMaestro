# EVOLVE-BLOCK-START
import math

def evolve_drone_path(start, end, school, base, num_points):
    """
    多目标无人机路径生成（结构化重构版）
    输入:
        start, end, school, base: (x, y)
        num_points: 需要返回的中间点数量
    输出:
        长度为 num_points 的 y 坐标列表（对应 x 在 start.x 与 end.x 间匀速分布）
    """
    if num_points <= 0:
        return []

    x0, y0 = start
    x1, y1 = end
    sx, sy = school
    bx, by = base

    # -------- 1) 网格与基础曲线 --------
    dx = (x1 - x0) / (num_points + 1)
    xs = [x0 + (i + 1) * dx for i in range(num_points)]
    t_vals = [(x - x0) / (x1 - x0 + 1e-12) for x in xs]
    y_linear = [y0 + (y1 - y0) * t for t in t_vals]

    # -------- 2) 灵活控制点参数化 --------
    num_ctrl = 12
    ctrl_xs = [x0 + (x1 - x0) * (i + 1) / (num_ctrl + 1) for i in range(num_ctrl)]
    sigma = abs(x1 - x0) / (num_ctrl + 1) * 1.5

    def get_path(c_ys):
        ys = []
        for x in xs:
            dev = 0.0
            for i in range(num_ctrl):
                dev += c_ys[i] * math.exp(-0.5 * ((x - ctrl_xs[i]) / sigma) ** 2)
            t = (x - x0) / (x1 - x0 + 1e-12)
            y_lin = y0 + (y1 - y0) * t
            ys.append(y_lin + dev)
        return ys

    # -------- 3) 精确代理目标 (F1 * F2 * F3) --------
    straight_length = math.hypot(x1 - x0, y1 - y0) + 1e-9

    def proxy_score(c_ys):
        ys = get_path(c_ys)

        # F1: 归一化路径长度
        length = 0.0
        px, py = x0, y0
        for i, y in enumerate(ys):
            x = xs[i]
            length += math.hypot(x - px, y - py)
            px, py = x, y
        length += math.hypot(x1 - px, y1 - py)
        f1 = length / straight_length

        # F2: 学校噪声
        f2 = 1.0 / ((x0 - sx)**2 + (y0 - sy)**2 + 25.0) + 1.0 / ((x1 - sx)**2 + (y1 - sy)**2 + 25.0)
        for i, y in enumerate(ys):
            d2 = (xs[i] - sx) ** 2 + (y - sy) ** 2
            f2 += 1.0 / (d2 + 25.0)

        # F3: 基站信号衰减
        f3 = math.hypot(x0 - bx, y0 - by) + math.hypot(x1 - bx, y1 - by)
        for i, y in enumerate(ys):
            f3 += math.hypot(xs[i] - bx, y - by)

        return f1 * f2 * f3

    # -------- 4) 启发式初始化 --------
    best_c_ys = [0.0] * num_ctrl
    best_score = proxy_score(best_c_ys)

    y_span = abs(y1 - y0) + abs(x1 - x0)

    for scale_s in [-0.6, -0.3, 0.0, 0.3, 0.6]:
        for scale_b in [-0.6, -0.3, 0.0, 0.3, 0.6]:
            c_ys = [0.0] * num_ctrl
            for i in range(num_ctrl):
                cx = ctrl_xs[i]
                d_s = abs(cx - sx)
                if d_s < y_span * 0.5:
                    c_ys[i] += scale_s * y_span * math.exp(- (d_s / (y_span*0.25))**2 )
                d_b = abs(cx - bx)
                if d_b < y_span * 0.5:
                    c_ys[i] += scale_b * y_span * math.exp(- (d_b / (y_span*0.25))**2 )

            sc = proxy_score(c_ys)
            if sc < best_score:
                best_score = sc
                best_c_ys = c_ys[:]

    # -------- 5) 坐标下降优化 --------
    step_size = y_span * 0.3
    for _ in range(25):
        improved = False
        for i in range(num_ctrl):
            for step in [-step_size, -step_size*0.5, step_size*0.5, step_size]:
                c_ys = best_c_ys[:]
                c_ys[i] += step
                sc = proxy_score(c_ys)
                if sc < best_score:
                    best_score = sc
                    best_c_ys = c_ys[:]
                    improved = True
        if not improved:
            step_size *= 0.6
            if step_size < 0.1:
                break

    # -------- 6) 生成最终路径 --------
    ys = get_path(best_c_ys)
    return [float(v) for v in ys]
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