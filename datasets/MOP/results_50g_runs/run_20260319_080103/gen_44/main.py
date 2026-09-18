# EVOLVE-BLOCK-START
def evolve_drone_path(start, end, school, base, num_points):
    """
    Return a length-num_points list of Y coordinates for uniformly spaced X positions
    between start and end.
    """
    import math

    x0, y0 = start
    x1, y1 = end
    sx, sy = school
    bx, by = base

    if num_points <= 0:
        return []

    dx = (x1 - x0) / (num_points + 1)
    total_dx = (x1 - x0) if (x1 != x0) else 1.0

    xs = [x0 + (i + 1) * dx for i in range(num_points)]

    def baseline_y(x):
        return y0 + (x - x0) * (y1 - y0) / total_dx

    # Determine globally consistent dodge direction.
    y_line_school = baseline_y(sx)
    push_dir = -1.0 if sy > y_line_school else 1.0

    def logistic(z):
        if z >= 0:
            ez = math.exp(-z)
            return 1.0 / (1.0 + ez)
        ez = math.exp(z)
        return ez / (1.0 + ez)

    def smooth_once(vals):
        n = len(vals)
        if n <= 2:
            return vals[:]
        out = vals[:]
        out[0] = 0.80 * vals[0] + 0.20 * vals[1]
        for i in range(1, n - 1):
            out[i] = 0.20 * vals[i - 1] + 0.60 * vals[i] + 0.20 * vals[i + 1]
        out[-1] = 0.80 * vals[-1] + 0.20 * vals[-2]
        return out

    def build_path(a_school, sig_s2, sig_b2, tail_strength, tail_tau, smooth_passes):
        ys = []
        mid_x = 0.5 * (sx + bx)

        for x in xs:
            y_line = baseline_y(x)

            # Localized repulsion from school.
            w_s = math.exp(-((x - sx) ** 2) / sig_s2)
            school_term = push_dir * a_school * w_s

            # Broad attraction toward base altitude.
            w_b = math.exp(-((x - bx) ** 2) / sig_b2)
            base_term = (by - y_line) * w_b

            # Smooth late-stage drift toward the base region.
            tail_gate = logistic((x - mid_x) / tail_tau)
            tail_term = tail_strength * (by - y_line) * tail_gate

            y = y_line + school_term + base_term + tail_term
            ys.append(float(y))

        for _ in range(smooth_passes):
            ys = smooth_once(ys)

        return ys

    def surrogate_score(ys):
        # Segment-aware surrogate using 1/4, 1/2, 3/4 interior samples.
        pts = [(x0, y0)]
        for i, y in enumerate(ys):
            pts.append((xs[i], y))
        pts.append((x1, y1))

        path_len = 0.0
        school_pen = 0.0
        base_pen = 0.0
        sample_count = 0

        for i in range(len(pts) - 1):
            ax, ay = pts[i]
            cx, cy = pts[i + 1]

            seg_dx = cx - ax
            seg_dy = cy - ay
            path_len += math.hypot(seg_dx, seg_dy)

            local_school_vals = []
            local_base_vals = []

            for t in (0.25, 0.50, 0.75):
                px = ax + t * seg_dx
                py = ay + t * seg_dy

                ds2 = (px - sx) ** 2 + (py - sy) ** 2
                db2 = (px - bx) ** 2 + (py - by) ** 2

                # Max-biased school penalty: punishes brief close passes.
                s_cost = math.exp(-ds2 / 180.0) + 0.45 * math.exp(-ds2 / 55.0)
                # Base penalty: encourage staying nearer to the base region.
                b_cost = math.sqrt(db2 + 25.0)

                local_school_vals.append(s_cost)
                local_base_vals.append(b_cost)
                sample_count += 1

            school_pen += 0.55 * max(local_school_vals) + 0.45 * (
                sum(local_school_vals) / len(local_school_vals)
            )
            base_pen += sum(local_base_vals) / len(local_base_vals)

        straight_len = math.hypot(x1 - x0, y1 - y0) + 1e-9
        f1 = path_len / straight_len
        f2 = school_pen / max(1, len(pts) - 1)
        f3 = base_pen / max(1, len(pts) - 1)

        # Weighted combination tuned to favor better school clearance without
        # letting distance explode, while still moving toward the base region.
        return 2.1 * f1 + 14.0 * f2 + 0.085 * f3

    # Candidate search over a compact parameter grid.
    school_amp_candidates = [22.0, 30.0, 38.0, 46.0]
    school_width_candidates = [220.0, 320.0, 460.0]
    base_width_candidates = [700.0, 1100.0, 1500.0]
    tail_strength_candidates = [0.18, 0.32, 0.46]
    tail_tau_candidates = [7.0, 11.0, 15.0]
    smooth_candidates = [1, 2]

    best_score = float("inf")
    best_path = None

    for a_school in school_amp_candidates:
        for sig_s2 in school_width_candidates:
            for sig_b2 in base_width_candidates:
                for tail_strength in tail_strength_candidates:
                    for tail_tau in tail_tau_candidates:
                        for smooth_passes in smooth_candidates:
                            ys = build_path(
                                a_school=a_school,
                                sig_s2=sig_s2,
                                sig_b2=sig_b2,
                                tail_strength=tail_strength,
                                tail_tau=tail_tau,
                                smooth_passes=smooth_passes,
                            )
                            score = surrogate_score(ys)
                            if score < best_score:
                                best_score = score
                                best_path = ys

    return best_path
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