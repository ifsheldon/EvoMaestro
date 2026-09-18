# EVOLVE-BLOCK-START
def evolve_drone_path(start, end, school, base, num_points):
    """
    【无人机连续空间多目标折线优化】
    LLMs 将被要求在这里编写代码（可以使用启发式寻找策略，或者单纯使用规则拟合）。
    你需要返回一个长度为 num_points 的列表，包含从起点到终点按 X 匀速布置对应的 Y 轴偏移量。
    """
    x_start, y_start = start
    x_end, y_end = end

    import math

    school_x, school_y = school
    base_x, base_y = base

    xs = [x_start + (i + 1) * (x_end - x_start) / (num_points + 1) for i in range(num_points)]
    line_ys = [y_start + (i + 1) * (y_end - y_start) / (num_points + 1) for i in range(num_points)]

    straight_dist = math.hypot(x_end - x_start, y_end - y_start)
    if straight_dist == 0:
        straight_dist = 1.0

    # Determine whether school/base are over or under the straight line
    school_dirs = [1.0 if y < school_y else -1.0 for y in line_ys]
    base_dirs = [1.0 if base_y > y else -1.0 for y in line_ys]

    W_choices = [100.0, 300.0, 600.0, 1000.0]

    # Precompute structural Gaussian basis shapes for rapid grid combinations
    shape_school = []
    for W in W_choices:
        shape_school.append([school_dirs[i] * (-1.0) * math.exp(-((xs[i] - school_x)**2) / W) for i in range(num_points)])

    shape_base = []
    for W in W_choices:
        shape_base.append([base_dirs[i] * 1.0 * math.exp(-((xs[i] - base_x)**2) / W) for i in range(num_points)])

    best_score = float('inf')
    best_ys = line_ys

    # Adjust step stride dynamically to prevent Python overhead timeouts purely for overly dense meshes
    A_steps = 3 if num_points <= 100 else 6
    if num_points > 500: A_steps = 10

    # Fully explore the configuration space internally via Surrogate Function Check
    for A_school in range(0, 61, A_steps):
        for A_base in range(0, 61, A_steps):
            for w_s_idx in range(len(W_choices)):
                ss = shape_school[w_s_idx]
                for w_b_idx in range(len(W_choices)):
                    sb = shape_base[w_b_idx]

                    ys = [line_ys[i] + A_school * ss[i] + A_base * sb[i] for i in range(num_points)]

                    dist = 0.0
                    px, py = x_start, y_start
                    f2 = 0.0
                    f3 = 0.0

                    # Single-pass execution block for F1, F2, and F3 surrogates evaluations
                    for i in range(num_points):
                        cx, cy = xs[i], ys[i]

                        dist += math.hypot(cx - px, cy - py)
                        px, py = cx, cy

                        D_sq_school = (cx - school_x)**2 + (cy - school_y)**2
                        f2 += 1.0 / (D_sq_school + 1e-3)

                        D_sq_base = (cx - base_x)**2 + (cy - base_y)**2
                        f3 += math.sqrt(D_sq_base)

                    dist += math.hypot(x_end - px, y_end - py)
                    f1 = dist / straight_dist

                    score = f1 * f2 * f3
                    if score < best_score:
                        best_score = score
                        best_ys = ys

    # Fine-tune with Adam optimizer
    ys = list(best_ys)
    m = [0.0] * num_points
    v = [0.0] * num_points
    beta1 = 0.9
    beta2 = 0.999
    alpha = 1.0
    eps = 1e-8

    for step in range(150):
        dist = 0.0
        f2 = 0.0
        f3 = 0.0
        px, py = x_start, y_start

        for i in range(num_points):
            cx, cy = xs[i], ys[i]
            dist += math.hypot(cx - px, cy - py)
            px, py = cx, cy

            D_sq_school = (cx - school_x)**2 + (cy - school_y)**2
            f2 += 1.0 / (D_sq_school + 1e-3)

            D_sq_base = (cx - base_x)**2 + (cy - base_y)**2
            f3 += math.sqrt(D_sq_base)

        dist += math.hypot(x_end - px, y_end - py)
        f1 = dist / straight_dist

        score = f1 * f2 * f3
        if score < best_score:
            best_score = score
            best_ys = list(ys)

        for i in range(num_points):
            cy = ys[i]
            cx = xs[i]

            prev_x = x_start if i == 0 else xs[i-1]
            prev_y = y_start if i == 0 else ys[i-1]
            next_x = x_end if i == num_points - 1 else xs[i+1]
            next_y = y_end if i == num_points - 1 else ys[i+1]

            d1 = math.hypot(cx - prev_x, cy - prev_y)
            d2 = math.hypot(next_x - cx, next_y - cy)

            df1_dy = (cy - prev_y) / (d1 + 1e-6) + (cy - next_y) / (d2 + 1e-6)
            df1_dy /= straight_dist

            D_sq_school = (cx - school_x)**2 + (cy - school_y)**2
            df2_dy = -2.0 * (cy - school_y) / ((D_sq_school + 1e-3)**2)

            D_sq_base = (cx - base_x)**2 + (cy - base_y)**2
            df3_dy = (cy - base_y) / (math.sqrt(D_sq_base) + 1e-6)

            grad = df1_dy * f2 * f3 + f1 * df2_dy * f3 + f1 * f2 * df3_dy

            m[i] = beta1 * m[i] + (1 - beta1) * grad
            v[i] = beta2 * v[i] + (1 - beta2) * (grad * grad)

            m_hat = m[i] / (1 - beta1**(step + 1))
            v_hat = v[i] / (1 - beta2**(step + 1))

            ys[i] -= alpha * m_hat / (math.sqrt(v_hat) + eps)

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