# EVOLVE-BLOCK-START
def evolve_drone_path(start, end, school, base, num_points):
    """
    【无人机连续空间多目标折线优化】
    Generates an optimized drone path blending procedural efficiency with
    sophisticated spatial behavioral modifiers (School Avoidance & Base Attraction).
    """
    import math

    x_start, y_start = start
    x_end, y_end = end
    sx, sy = school
    bx, by = base

    dx = x_end - x_start
    dy = y_end - y_start

    path = []
    
    for i in range(1, num_points + 1):
        # Calculate percentage progress across the X-axis (0.0 to 1.0 exclusive)
        pct = i / (num_points + 1)
        x = x_start + pct * dx
        y_line = y_start + pct * dy
        
        y = y_line
        
        # 1. School Avoidance Modifier
        dist_x_s = abs(x - sx)
        w_s = math.exp(-(dist_x_s ** 2) / 850.0)
        direction = -1.0 if sy > y_line else 1.0
        
        # Push drone away aggressively from the school
        y += direction * 54.0 * w_s
        
        # 2. Base Attraction Modifier
        dist_x_b = abs(x - bx)
        w_b = math.exp(-(dist_x_b ** 2) / 2800.0)
        
        # Modulate base pull strength using the presence of school noise
        # This resolves geographical conflicts by resisting pull until the drone is safe from noise
        pull = 0.98 * (1.0 - 0.45 * w_s) * (1.0 + 0.40 * (1.0 - w_s))
        if pull > 1.0:
            pull = 1.0
            
        # Linearly interpolate towards the dynamic target
        target_y = y + (by - y) * pull
        y += (target_y - y) * w_b
        
        # 3. Endpoint Smoothing Envelope (Zero-edge constraint)
        # Using a fractional exponent rapidly raises the window to 1.0 but forces absolute 0.0 at borders.
        # This drastically minimizes useless starting distance jumping (saving F1), 
        # whilst preserving deep bends inside the domain (boosting F2/F3).
        window = math.sin(math.pi * pct) ** 0.6
        
        final_y = y_line + (y - y_line) * window
        path.append(float(final_y))

    return path
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