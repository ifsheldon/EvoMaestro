# EVOLVE-BLOCK-START
import math

def evolve_drone_path(start, end, school, base, num_points):
    """
    连续空间多目标路径优化（新算法）：
    - 用势场 + 平滑正则构造目标函数
    - 通过迭代梯度下降同时优化距离/学校噪声/基站信号
    - 返回按 X 匀速采样的内部 y 坐标（长度 = num_points）
    """
    x0, y0 = start
    x1, y1 = end
    sx, sy = school
    bx, by = base

    if num_points <= 0:
        return []

    # 全部采样点：含起终点，共 n = num_points + 2
    n = num_points + 2
    xs = [x0 + (x1 - x0) * i / (n - 1) for i in range(n)]
    dx = abs((x1 - x0) / (n - 1)) + 1e-9

    # ---------- 初始化：直线 + “远离学校/靠近基站”高斯偏置 ----------
    def line_y(x):
        t = 0.0 if abs(x1 - x0) < 1e-12 else (x - x0) / (x1 - x0)
        return y0 * (1 - t) + y1 * t

    y_school_line = line_y(sx)
    y_base_line = line_y(bx)

    # 远离学校方向：按当前线与学校相对位置决定
    dir_school = 1.0 if (y_school_line - sy) >= 0.0 else -1.0
    # 靠近基站方向
    dir_base = 1.0 if (by - y_base_line) >= 0.0 else -1.0

    x_span = abs(x1 - x0) + 1e-9
    sig_school = max(8.0, 0.12 * x_span)
    sig_base = max(10.0, 0.15 * x_span)

    # 偏置幅度适中，避免 F1 急剧上升
    amp_school = 10.0
    amp_base = 14.0

    ys = []
    for x in xs:
        y_lin = line_y(x)
        bump_school = dir_school * amp_school * math.exp(-0.5 * ((x - sx) / sig_school) ** 2)
        bump_base = dir_base * amp_base * math.exp(-0.5 * ((x - bx) / sig_base) ** 2)
        ys.append(y_lin + bump_school + bump_base)

    # 固定端点
    ys[0], ys[-1] = y0, y1

    # ---------- 多目标能量优化 ----------
    # 权重（可调）
    w_len = 0.85       # 路径长度
    w_school = 220.0   # 学校排斥（噪声风险）
    w_base = 0.020     # 基站吸引（信号损失）
    w_smooth = 1.35    # 曲率平滑

    eps = 1e-6
    lr = 0.045
    iterations = 160

    # 合理 y 范围限制，防止数值发散
    y_low = min(y0, y1, sy, by) - 120.0
    y_high = max(y0, y1, sy, by) + 120.0

    for it in range(iterations):
        grad = [0.0] * n

        # 1) 路径长度项梯度
        for i in range(1, n - 1):
            a = ys[i] - ys[i - 1]
            b = ys[i] - ys[i + 1]
            l_prev = math.sqrt(dx * dx + a * a) + eps
            l_next = math.sqrt(dx * dx + b * b) + eps
            grad[i] += w_len * (a / l_prev + b / l_next)

        # 2) 学校排斥项: 1 / (dist^2 + eps)
        for i in range(1, n - 1):
            dxs = xs[i] - sx
            dys = ys[i] - sy
            r2 = dxs * dxs + dys * dys + 4.0  # softening
            grad[i] += w_school * (-2.0 * dys) / (r2 * r2)

        # 3) 基站吸引项: dist^2
        for i in range(1, n - 1):
            grad[i] += w_base * (2.0 * (ys[i] - by))

        # 4) 平滑项: sum (y_{k-1} - 2y_k + y_{k+1})^2
        # 对每个 curvature c 累加导数
        for k in range(1, n - 1):
            c = ys[k - 1] - 2.0 * ys[k] + ys[k + 1]
            g = 2.0 * w_smooth * c
            grad[k - 1] += g
            grad[k] += -2.0 * g
            grad[k + 1] += g

        # 更新内部点，端点固定
        step = lr * (0.985 ** it)
        for i in range(1, n - 1):
            ys[i] -= step * grad[i]
            if ys[i] < y_low:
                ys[i] = y_low
            elif ys[i] > y_high:
                ys[i] = y_high

    # 返回内部点
    return [float(v) for v in ys[1:-1]]
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