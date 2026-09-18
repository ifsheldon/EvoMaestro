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

    # -------- 2) 分层高斯参数化 + 粗到细搜索 --------
    span_x = abs(x1 - x0) + 1e-9
    y_span = abs(y1 - y0) + span_x
    straight_length = math.hypot(x1 - x0, y1 - y0) + 1e-9

    def build_model(num_ctrl, sigma_scale):
        ctrl_xs = [x0 + (x1 - x0) * (i + 1) / (num_ctrl + 1) for i in range(num_ctrl)]
        sigma = span_x / (num_ctrl + 1) * sigma_scale + 1e-9

        def get_path(c_ys):
            ys = []
            for x in xs:
                dev = 0.0
                for i in range(num_ctrl):
                    dev += c_ys[i] * math.exp(-0.5 * ((x - ctrl_xs[i]) / sigma) ** 2)
                t = (x - x0) / (x1 - x0 + 1e-12)
                ys.append(y0 + (y1 - y0) * t + dev)
            return ys

        return ctrl_xs, get_path

    def score_from_path(ys):
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
        f2 = 1.0 / ((x0 - sx) ** 2 + (y0 - sy) ** 2 + 25.0) + 1.0 / ((x1 - sx) ** 2 + (y1 - sy) ** 2 + 25.0)
        for i, y in enumerate(ys):
            d2 = (xs[i] - sx) ** 2 + (y - sy) ** 2
            f2 += 1.0 / (d2 + 25.0)

        # F3: 基站信号衰减
        f3 = math.hypot(x0 - bx, y0 - by) + math.hypot(x1 - bx, y1 - by)
        for i, y in enumerate(ys):
            f3 += math.hypot(xs[i] - bx, y - by)

        return f1 * f2 * f3

    def interpolate_controls(c_small, n_big):
        m = len(c_small)
        if m == n_big:
            return c_small[:]
        if m == 1:
            return [c_small[0]] * n_big
        out = []
        for j in range(n_big):
            p = j * (m - 1) / (n_big - 1)
            lo = int(math.floor(p))
            hi = min(m - 1, lo + 1)
            w = p - lo
            out.append(c_small[lo] * (1.0 - w) + c_small[hi] * w)
        return out

    y_school_on_line = y0 + (y1 - y0) * ((sx - x0) / (x1 - x0 + 1e-12))
    school_dir = -1.0 if sy >= y_school_on_line else 1.0  # 远离学校
    y_base_on_line = y0 + (y1 - y0) * ((bx - x0) / (x1 - x0 + 1e-12))
    base_dir = 1.0 if by >= y_base_on_line else -1.0      # 靠近基站

    def make_seed(ctrl_xs, amp_s, amp_b, amp_wave):
        c = [0.0] * len(ctrl_xs)
        for i, cx in enumerate(ctrl_xs):
            g_s = math.exp(-((cx - sx) / (0.23 * span_x + 1e-9)) ** 2)
            g_b = math.exp(-((cx - bx) / (0.28 * span_x + 1e-9)) ** 2)
            t = (cx - x0) / (x1 - x0 + 1e-12)
            wave = math.sin(math.pi * t)
            c[i] = school_dir * amp_s * y_span * g_s + base_dir * amp_b * y_span * g_b + (school_dir + base_dir) * 0.5 * amp_wave * y_span * wave
        return c

    def optimize_controls(num_ctrl, sigma_scale, init_list, step_init, max_round):
        ctrl_xs, get_path = build_model(num_ctrl, sigma_scale)

        best_c = [0.0] * num_ctrl
        best_sc = score_from_path(get_path(best_c))

        for cand in init_list:
            sc = score_from_path(get_path(cand))
            if sc < best_sc:
                best_sc = sc
                best_c = cand[:]

        step_size = step_init
        for _ in range(max_round):
            improved = False
            for i in range(num_ctrl):
                base = best_c[i]
                for delta in (-step_size, -0.5 * step_size, 0.5 * step_size, step_size):
                    c_try = best_c[:]
                    c_try[i] = base + delta
                    sc = score_from_path(get_path(c_try))
                    if sc < best_sc:
                        best_sc = sc
                        best_c = c_try
                        improved = True
            if improved:
                step_size *= 0.92
            else:
                step_size *= 0.60
            if step_size < 0.04:
                break

        return best_c, best_sc, ctrl_xs, get_path

    # 粗层：先优化大形状（全局）
    coarse_num = 5
    coarse_ctrl_xs, _ = build_model(coarse_num, 1.9)
    coarse_inits = [[0.0] * coarse_num]
    for a_s in (0.25, 0.45, 0.65):
        for a_b in (0.25, 0.45, 0.65):
            coarse_inits.append(make_seed(coarse_ctrl_xs, a_s, a_b, 0.20))
    coarse_inits.append(make_seed(coarse_ctrl_xs, 0.40, 0.40, -0.18))

    coarse_c, _, _, _ = optimize_controls(
        num_ctrl=coarse_num,
        sigma_scale=1.9,
        init_list=coarse_inits,
        step_init=0.30 * y_span,
        max_round=18
    )

    # 细层：插值到12控制点并细化（局部）
    fine_num = 12
    fine_ctrl_xs, _ = build_model(fine_num, 1.45)
    c0 = interpolate_controls(coarse_c, fine_num)
    fine_inits = [
        c0[:],
        [0.85 * v for v in c0],
        [1.15 * v for v in c0],
        make_seed(fine_ctrl_xs, 0.30, 0.30, 0.15),
        make_seed(fine_ctrl_xs, 0.45, 0.35, 0.10),
        [0.0] * fine_num,
    ]

    best_c_ys, _, _, fine_get_path = optimize_controls(
        num_ctrl=fine_num,
        sigma_scale=1.45,
        init_list=fine_inits,
        step_init=0.18 * y_span,
        max_round=28
    )

    # -------- 3) 生成最终路径（轻微平滑，保留弯曲趋势）--------
    ys = fine_get_path(best_c_ys)
    if num_points >= 3:
        tmp = ys[:]
        for i in range(1, num_points - 1):
            tmp[i] = 0.15 * ys[i - 1] + 0.70 * ys[i] + 0.15 * ys[i + 1]
        ys = tmp

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