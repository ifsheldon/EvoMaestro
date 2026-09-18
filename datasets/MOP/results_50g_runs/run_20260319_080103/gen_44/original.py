# EVOLVE-BLOCK-START
def evolve_drone_path(start, end, school, base, num_points):
    """
    【无人机连续空间多目标折线优化】
    LLMs 将被要求在这里编写代码（可以使用启发式寻找策略，或者单纯使用规则拟合）。
    你需要返回一个长度为 num_points 的列表，包含从起点到终点按 X 匀速布置对应的 Y 轴偏移量。
    """
    import math

    class DronePathOptimizer:
        def __init__(self, start, end, school, base, num_points):
            self.start = start
            self.end = end
            self.school = school
            self.base = base
            self.num_points = num_points
            self.dx = (end[0] - start[0]) / (num_points + 1)

        def get_baseline_y(self, x):
            """Calculate the Y coordinate on the straight line between start and end."""
            x0, y0 = self.start
            x1, y1 = self.end
            return y0 + (x - x0) * (y1 - y0) / (x1 - x0)

        def apply_school_repulsion(self, x, y_line):
            """Calculate the repulsion offset away from the school."""
            sx, sy = self.school
            
            # Gaussian weight based on X-distance to school
            w_s = math.exp(-((x - sx) ** 2) / 350.0)
            
            # Sign-based fixed-force direction
            push_dir = -1.0 if sy > y_line else 1.0
            
            # Geometry-aware amplitude: stronger push when the baseline is vertically close to the school
            dist_y = abs(y_line - sy)
            amp = 15.0 + 35.0 * math.exp(-(dist_y ** 2) / 500.0)
            
            return push_dir * amp * w_s

        def apply_base_attraction(self, x, current_y):
            """Calculate the attraction offset towards the base station."""
            bx, by = self.base
            
            # Gaussian weight based on X-distance to base station
            w_b = math.exp(-((x - bx) ** 2) / 450.0)
            
            # Proportional attraction towards the base station's Y coordinate
            return (by - current_y) * w_b

        def optimize(self):
            """Generate the optimized Y coordinates for the drone path."""
            y_coords = []
            for i in range(self.num_points):
                x = self.start[0] + (i + 1) * self.dx
                
                # 1. Start with the straight line
                y = self.get_baseline_y(x)
                
                # 2. Apply school repulsion
                y += self.apply_school_repulsion(x, y)
                
                # 3. Apply base station attraction
                y += self.apply_base_attraction(x, y)
                
                y_coords.append(float(y))
                
            return y_coords

    optimizer = DronePathOptimizer(start, end, school, base, num_points)
    return optimizer.optimize()
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