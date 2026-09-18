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

    # -------- 2) 预计算特征（数据流中心化）--------
    # 与场景尺度相关的核宽度
    span_x = abs(x1 - x0) + 1e-9
    sigma_s = max(8.0, 0.18 * span_x)
    sigma_b = max(10.0, 0.22 * span_x)

    def gauss(x, mu, sigma):
        z = (x - mu) / (sigma + 1e-12)
        return math.exp(-0.5 * z * z)

    # 学校附近抬升/压低强度（按学校相对线的位置决定方向）
    y_school_on_line = y0 + (y1 - y0) * ((sx - x0) / (x1 - x0 + 1e-12))
    school_sign = -1.0 if sy > y_school_on_line else 1.0  # 学校在上方 => 向下绕；反之向上绕

    # 基站吸引方向（朝基站 y 靠拢）
    y_base_on_line = y0 + (y1 - y0) * ((bx - x0) / (x1 - x0 + 1e-12))
    base_sign = 1.0 if by > y_base_on_line else -1.0

    school_profile = [gauss(x, sx, sigma_s) * school_sign for x in xs]
    base_profile = [gauss(x, bx, sigma_b) * base_sign for x in xs]

    # 全局平滑弯曲（让轨迹更“线性+轻弯”而不是尖峰）
    global_profile = [math.sin(math.pi * t) for t in t_vals]

    # -------- 3) 构造候选路径 --------
    def build_path(a_school, a_base, a_global):
        ys = []
        for i in range(num_points):
            y = (
                y_linear[i]
                + a_school * school_profile[i]
                + a_base * base_profile[i]
                + a_global * global_profile[i] * (base_sign * 0.5 + school_sign * 0.5)
            )
            ys.append(float(y))
        return ys

    # -------- 4) 代理目标（F1/F2/F3 + smooth）--------
    def proxy_score(ys):
        # F1-like: 路径长度
        length = 0.0
        px, py = x0, y0
        for i, y in enumerate(ys):
            x = xs[i]
            length += math.hypot(x - px, y - py)
            px, py = x, y
        length += math.hypot(x1 - px, y1 - py)

        # F2-like: 学校噪声（离学校越远越好）
        school_pen = 0.0
        for i, y in enumerate(ys):
            d2 = (xs[i] - sx) ** 2 + (y - sy) ** 2
            school_pen += 1.0 / (d2 + 25.0)
        school_pen /= num_points

        # F3-like: 基站信号衰减（离基站越近越好）
        base_pen = 0.0
        for i, y in enumerate(ys):
            base_pen += math.hypot(xs[i] - bx, y - by)
        base_pen /= num_points

        # 平滑正则
        smooth_pen = 0.0
        for i in range(1, num_points - 1):
            smooth_pen += abs(ys[i - 1] - 2.0 * ys[i] + ys[i + 1])
        smooth_pen /= max(1, num_points - 2)

        # 权重：优先控制学校/基站，再兼顾距离与平滑
        return 0.9 * length + 140.0 * school_pen + 0.55 * base_pen + 1.8 * smooth_pen

    # -------- 5) 两阶段参数搜索（架构重构核心）--------
    y_span = abs(y1 - y0) + 20.0
    coarse = [-0.75 * y_span, -0.45 * y_span, -0.2 * y_span, 0.0, 0.2 * y_span, 0.45 * y_span, 0.75 * y_span]

    best_params = (0.0, 0.0, 0.0)
    best_path = y_linear[:]
    best_score = proxy_score(best_path)

    # Stage A: coarse grid
    for a_s in coarse:
        for a_b in coarse:
            for a_g in [-0.25 * y_span, 0.0, 0.25 * y_span]:
                ys = build_path(a_s, a_b, a_g)
                sc = proxy_score(ys)
                if sc < best_score:
                    best_score, best_path, best_params = sc, ys, (a_s, a_b, a_g)

    # Stage B: local refinement (coordinate-style)
    a_s, a_b, a_g = best_params
    step_s = 0.18 * y_span
    step_b = 0.18 * y_span
    step_g = 0.10 * y_span

    for _ in range(5):
        improved = False
        for ds in (-step_s, 0.0, step_s):
            ys = build_path(a_s + ds, a_b, a_g)
            sc = proxy_score(ys)
            if sc < best_score:
                best_score, best_path = sc, ys
                a_s += ds
                improved = True

        for db in (-step_b, 0.0, step_b):
            ys = build_path(a_s, a_b + db, a_g)
            sc = proxy_score(ys)
            if sc < best_score:
                best_score, best_path = sc, ys
                a_b += db
                improved = True

        for dg in (-step_g, 0.0, step_g):
            ys = build_path(a_s, a_b, a_g + dg)
            sc = proxy_score(ys)
            if sc < best_score:
                best_score, best_path = sc, ys
                a_g += dg
                improved = True

        step_s *= 0.6
        step_b *= 0.6
        step_g *= 0.6
        if not improved:
            break

    # -------- 6) 后处理平滑（保持“远离学校、靠近基站”趋势）--------
    ys = best_path[:]
    for _ in range(3):
        if num_points >= 3:
            new_ys = ys[:]
            for i in range(1, num_points - 1):
                new_ys[i] = 0.2 * ys[i - 1] + 0.6 * ys[i] + 0.2 * ys[i + 1]
            ys = new_ys

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
