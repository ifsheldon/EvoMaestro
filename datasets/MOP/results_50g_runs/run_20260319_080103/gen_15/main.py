# EVOLVE-BLOCK-START
def evolve_drone_path(start, end, school, base, num_points):
    import math

    x_start, y_start = start
    x_end, y_end = end
    sx, sy = school
    bx, by = base

    if num_points <= 0:
        return []

    dx = (x_end - x_start) / (num_points + 1)
    N = num_points

    # Determine Y grid boundaries
    # Expand grid to include school and base, but cap the expansion to avoid losing resolution
    # if they are too far away (in which case it's not worth detouring anyway).
    min_y = min(y_start, y_end)
    max_y = max(y_start, y_end)
    
    if min_y - 200.0 < sy < max_y + 200.0:
        min_y = min(min_y, sy)
        max_y = max(max_y, sy)
        
    if min_y - 200.0 < by < max_y + 200.0:
        min_y = min(min_y, by)
        max_y = max(max_y, by)
        
    min_y -= 60.0
    max_y += 60.0

    M = 81
    dy_step = (max_y - min_y) / (M - 1) if M > 1 else 0
    y_cands = [min_y + j * dy_step for j in range(M)]

    # Weights derived from the gradients of the multiplier score
    weight_dist = 1.0
    weight_noise = 400.0 * dx
    weight_signal = 0.03 * dx

    # Precompute segment lengths to optimize the inner DP loop
    seg_len_matrix = [[weight_dist * math.hypot(dx, (j - k) * dy_step) for k in range(M)] for j in range(M)]

    dp = [[float('inf')] * M for _ in range(N + 2)]
    parent = [[-1] * M for _ in range(N + 2)]

    # Step 1: i = 1
    mid_x = x_start + 0.5 * dx
    for j in range(M):
        y_curr = y_cands[j]
        mid_y = (y_start + y_curr) / 2.0
        
        seg_len = weight_dist * math.hypot(dx, y_curr - y_start)
        d_school_sq = (mid_x - sx)**2 + (mid_y - sy)**2
        noise = weight_noise / (d_school_sq + 10.0)
        d_base = weight_signal * math.hypot(mid_x - bx, mid_y - by)
        
        dp[1][j] = seg_len + noise + d_base
        parent[1][j] = -1

    # Step 2 to N
    for i in range(2, N + 1):
        mid_x = x_start + (i - 0.5) * dx
        
        # Precompute mid costs for all possible (j + k) combinations
        cost_mid = [0.0] * (2 * M - 1)
        for sum_idx in range(2 * M - 1):
            mid_y = min_y + sum_idx * (dy_step / 2.0)
            d_school_sq = (mid_x - sx)**2 + (mid_y - sy)**2
            noise = weight_noise / (d_school_sq + 10.0)
            d_base = weight_signal * math.hypot(mid_x - bx, mid_y - by)
            cost_mid[sum_idx] = noise + d_base
            
        prev_dp = dp[i-1]
        curr_dp = dp[i]
        curr_parent = parent[i]
        
        for j in range(M):
            min_cost = float('inf')
            best_p = -1
            seg_row = seg_len_matrix[j]
            
            for k in range(M):
                c = prev_dp[k] + seg_row[k] + cost_mid[j + k]
                if c < min_cost:
                    min_cost = c
                    best_p = k
                    
            curr_dp[j] = min_cost
            curr_parent[j] = best_p

    # Step N+1: to y_end
    i = N + 1
    mid_x = x_start + (i - 0.5) * dx
    min_cost = float('inf')
    best_p = -1
    
    for k in range(M):
        y_prev = y_cands[k]
        mid_y = (y_prev + y_end) / 2.0
        
        seg_len = weight_dist * math.hypot(dx, y_end - y_prev)
        d_school_sq = (mid_x - sx)**2 + (mid_y - sy)**2
        noise = weight_noise / (d_school_sq + 10.0)
        d_base = weight_signal * math.hypot(mid_x - bx, mid_y - by)
        
        c = dp[N][k] + seg_len + noise + d_base
        if c < min_cost:
            min_cost = c
            best_p = k

    # Backtrack to reconstruct the optimal path
    path = []
    curr_p = best_p
    for i in range(N, 0, -1):
        path.append(y_cands[curr_p])
        curr_p = parent[i][curr_p]
        
    path.reverse()

    # Laplacian smoothing to remove grid discretization artifacts
    y_coords = path
    smooth_alpha = 0.4
    for _ in range(3):
        smoothed = []
        for i in range(num_points):
            left = y_start if i == 0 else y_coords[i - 1]
            right = y_end if i == num_points - 1 else y_coords[i + 1]
            smoothed.append((1.0 - smooth_alpha) * y_coords[i] + smooth_alpha * 0.5 * (left + right))
        y_coords = smoothed

    return [float(y) for y in y_coords]
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
