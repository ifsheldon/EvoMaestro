# EVOLVE-BLOCK-START
def evolve_drone_path(start, end, school, base, num_points):
    """
    【无人机连续空间多目标折线优化】
    LLMs 将被要求在这里编写代码（可以使用启发式寻找策略，或者单纯使用规则拟合）。
    你需要返回一个长度为 num_points 的列表，包含从起点到终点按 X 匀速布置对应的 Y 轴偏移量。
    """
    x_start, y_start = start
    x_end, y_end = end
    
    # 【初始方案：最无脑的纯直线】
    y_coords = []
    dy = (y_end - y_start) / (num_points + 1)
    
    for i in range(num_points):
        y_coords.append(float(y_start + (i + 1) * dy))
        
    return y_coords
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
