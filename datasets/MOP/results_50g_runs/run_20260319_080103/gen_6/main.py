# EVOLVE-BLOCK-START
class PathModifier:
    def apply(self, x, y):
        pass

class SchoolAvoidanceModifier(PathModifier):
    def __init__(self, school_x, school_y, push_distance=45.0, width=900.0):
        self.sx = school_x
        self.sy = school_y
        self.push_distance = push_distance
        self.width = width
        
    def apply(self, x, y):
        dist_x = abs(x - self.sx)
        weight = 2.71828 ** (-(dist_x ** 2) / self.width)
        
        # Determine direction to push away from school
        direction = -1 if self.sy > y else 1
        
        return y + direction * self.push_distance * weight

class BaseAttractionModifier(PathModifier):
    def __init__(self, base_x, base_y, pull_ratio=0.9, width=2000.0):
        self.bx = base_x
        self.by = base_y
        self.pull_ratio = pull_ratio
        self.width = width
        
    def apply(self, x, y):
        dist_x = abs(x - self.bx)
        weight = 2.71828 ** (-(dist_x ** 2) / self.width)
        
        # Pull y towards base y
        target_y = y + (self.by - y) * self.pull_ratio
        return y + (target_y - y) * weight

class DronePathGenerator:
    def __init__(self, start, end, num_points):
        self.start = start
        self.end = end
        self.num_points = num_points
        self.modifiers = []
        
    def add_modifier(self, modifier):
        self.modifiers.append(modifier)
        
    def generate(self):
        x_start, y_start = self.start
        x_end, y_end = self.end
        
        dx = (x_end - x_start) / (self.num_points + 1)
        dy = (y_end - y_start) / (self.num_points + 1)
        
        path = []
        for i in range(1, self.num_points + 1):
            x = x_start + i * dx
            y_line = y_start + i * dy
            y = y_line
            
            # Apply all modifiers sequentially
            for mod in self.modifiers:
                y = mod.apply(x, y)
                
            # Apply window function to ensure endpoints are anchored
            # Using a cubic window for a flatter middle section to maximize base proximity
            progress = i / (self.num_points + 1)
            window = 1.0 - abs(2.0 * progress - 1.0)**3
            
            # Interpolate between the straight line and the modified path
            final_y = y_line + (y - y_line) * window
            path.append(float(final_y))
            
        return path

def evolve_drone_path(start, end, school, base, num_points):
    """
    【无人机连续空间多目标折线优化】
    Generates an optimized drone path using a modifier-based architecture.
    Applies repulsive forces from the school and attractive forces to the base.
    """
    generator = DronePathGenerator(start, end, num_points)
    
    # Add behavioral modifiers to sculpt the path
    generator.add_modifier(SchoolAvoidanceModifier(school[0], school[1], push_distance=45.0, width=900.0))
    generator.add_modifier(BaseAttractionModifier(base[0], base[1], pull_ratio=0.9, width=2000.0))
    
    return generator.generate()
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
