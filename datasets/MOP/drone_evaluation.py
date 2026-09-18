import math
import time
import concurrent.futures

def dist(p1, p2):
    return math.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)

def calculate_objectives(y_coords, start, end, school, base, num_points):
    if len(y_coords) != num_points:
        return float('inf'), float('inf'), float('inf')
        
    x_start, y_start = start
    x_end, y_end = end
    
    dx = (x_end - x_start) / (num_points + 1)
    points = [start]
    for i in range(num_points):
        x_i = x_start + (i + 1) * dx
        points.append((x_i, y_coords[i]))
    points.append(end)
    
    f1 = 0.0
    f2 = 0.0
    f3 = 0.0
    
    for i in range(len(points) - 1):
        f1 += dist(points[i], points[i+1])
        
    for i in range(1, len(points) - 1):
        px, py = points[i]
        f2 += 1000.0 / ((px - school[0])**2 + (py - school[1])**2 + 10.0)
        f3 += dist((px, py), base)
        
    # 归一化处理，屏蔽点数带来的尺度差异
    straight_dist = dist(start, end)
    f1_norm = f1 / straight_dist if straight_dist > 0 else 1.0  # 理想值为1.0（即完全贴合直线）
    f2_norm = f2 / num_points                                   # 平均每个检查点受到的学校噪音干扰
    f3_norm = f3 / num_points                                   # 平均每个检查点距离基站的偏差
    
    return f1_norm, f2_norm, f3_norm

def evaluate_single_case(user_func, case):
    start, end, school, base, num_points = case
    try:
        y_coords = user_func(start, end, school, base, num_points)
        y_coords = [max(-50.0, min(50.0, float(y))) for y in y_coords]
        return calculate_objectives(y_coords, start, end, school, base, num_points)
    except Exception as e:
        print(f"执行异常: {e}")
        return float('inf'), float('inf'), float('inf')

class DroneGrader:
    def __init__(self):
        # num_points 写入用例，点数从小到大阶梯递增，增加搜索空间维度
        self.cases = [
            # (start, end, school, base, num_points)
            ((0, 0), (100, 0),   (40, 20), (70, -30), 10),     # Level 1: 基础 (10维度)
            ((0, 10), (120, -10),(50, 30), (80, -40), 15),     # Level 2: 略增 (15维度)
            ((10, -10), (90, 20),(30, 0),  (60, 40), 20),      # Level 3: 中等 (20维度)
            ((-20, 0), (80, 0),  (20, 20), (50, -20), 30),     # Level 4: 进阶 (30维度)
            ((0, 20), (100, 20), (40, 0),  (70, 40), 40),      # Level 5: 困难 (40维度)
            ((0, -20), (100, 20),(30, 20), (80, -10), 60),     # Level 6: 极难 (60维度)
            ((10, 10), (110, -10),(60, 10), (40, -30), 80),    # Level 7: 噩梦 (80维度)
            ((-10, -10),(110, 10),(40, -20),(80, 30), 100),    # Level 8: 地狱 (100维度)
        ]

    def grade(self, user_func, timeout=15):
        print(f"开始并发评测... 盲测数据集: {len(self.cases)} 组, 超时拦截: {timeout} 秒")
        start_time = time.time()
        results = []
        
        with concurrent.futures.ProcessPoolExecutor(max_workers=8) as executor:
            future_to_case = {
                executor.submit(evaluate_single_case, user_func, case): i 
                for i, case in enumerate(self.cases)
            }
            try:
                for future in concurrent.futures.as_completed(future_to_case, timeout=timeout):
                    case_idx = future_to_case[future]
                    res = future.result()
                    results.append(res)
                    print(f"  √ 用例 {case_idx+1}/8 (维度:{self.cases[case_idx][4]}) 计算完毕.")
            except concurrent.futures.TimeoutError:
                print(f"评测被中断！您的代码跑了超过了 {timeout} 秒的时间限制。")
                executor.shutdown(wait=False, cancel_futures=True)
                return None
                
        eval_time = time.time() - start_time
        print(f"物理计算耗时: {eval_time:.2f} 秒")
        
        if len(results) != len(self.cases):
            print("未能完成所有用例计算，无成绩。")
            return None
            
        avg_f1 = sum(r[0] for r in results) / len(results)
        avg_f2 = sum(r[1] for r in results) / len(results)
        avg_f3 = sum(r[2] for r in results) / len(results)
        
        # 因为均值归一化过了，直接相乘就是比较公平的全局打分
        final_score = avg_f1 * avg_f2 * avg_f3
        
        print(f"\n=============== 最终成绩单 ===============")
        print(f"[F1] 平均归一化飞行距离 (趋近1) : {avg_f1:.4f}")
        print(f"[F2] 平均单点校园噪音值 (越小越好): {avg_f2:.4f}")
        print(f"[F3] 平均单点无信号间距 (越小越好): {avg_f3:.4f}")
        print(f"----------------------------------------")
        print(f"最终得分 (三者乘积，越小越优异) : {final_score:.4f}")
        print(f"========================================\n")
        return final_score

    def grade_silent(self, user_func, timeout=12):
        """供演化算法黑盒调用的静默评测接口返回值（单进程稳定版以防 Pickle Exception）"""
        results = []
        try:
            for case in self.cases:
                # 屏蔽多进程，直接在主进程里跑以适配 shinka eval 的沙箱 module
                res = evaluate_single_case(user_func, case)
                results.append(res)
        except Exception as e:
            return float('inf'), float('inf'), float('inf'), float('inf')

        if len(results) != len(self.cases):
            return float('inf'), float('inf'), float('inf'), float('inf')
            
        avg_f1 = sum(r[0] for r in results) / len(results)
        avg_f2 = sum(r[1] for r in results) / len(results)
        avg_f3 = sum(r[2] for r in results) / len(results)
        final_score = avg_f1 * avg_f2 * avg_f3
        
        return avg_f1, avg_f2, avg_f3, final_score

def simple_baseline(start, end, school, base, num_points):
    x_start, y_start = start
    x_end, y_end = end
    
    y_coords = []
    dy = (y_end - y_start) / (num_points + 1)
    
    for i in range(num_points):
        y_coords.append(y_start + (i + 1) * dy)
        
    return y_coords

def smart_optimizer_baseline(start, end, school, base, num_points):
    """
    【进阶优化 Baseline】
    纯 Python 实现的数值梯度下降（无需安装 numpy 或 scipy）。
    这会将多目标通过加上不同的权重融合成单目标函数进行极速求解。
    它可以绕开学校区域，并稍稍向基站弯曲。
    """
    x_start, y_start = start
    x_end, y_end = end
    
    def objective(y_coords):
        # 实时计算内联的三大指标
        dx = (x_end - x_start) / (num_points + 1)
        points = [start]
        for i in range(num_points):
            x_i = x_start + (i + 1) * dx
            points.append((x_i, y_coords[i]))
        points.append(end)
        
        f1, f2, f3 = 0.0, 0.0, 0.0
        
        for i in range(len(points) - 1):
            f1 += dist(points[i], points[i+1])
            
        for i in range(1, len(points) - 1):
            px, py = points[i]
            # 强化一点排斥力
            f2 += 1000.0 / ((px - school[0])**2 + (py - school[1])**2 + 5.0)
            f3 += dist((px, py), base)
            
        # 根据经验设定的标量化权重，将 MOP 降维打击成单目标优化
        return 1.0 * f1 + 2.0 * f2 + 0.1 * f3

    # 起始解依然是纯直线
    dy = (y_end - y_start) / (num_points + 1)
    y_opt = [y_start + (i + 1) * dy for i in range(num_points)]
    
    # 简易梯度下降参数
    learning_rate = 2.0
    epochs = 150
    eps = 1e-4
    
    for _ in range(epochs):
        grad = [0.0] * num_points
        base_val = objective(y_opt)
        
        # 计算每个维度的数值梯度
        for i in range(num_points):
            y_opt[i] += eps
            val_plus = objective(y_opt)
            y_opt[i] -= eps
            grad[i] = (val_plus - base_val) / eps
            
        # 批量更新并添加物理裁剪
        for i in range(num_points):
            y_opt[i] -= learning_rate * grad[i]
            y_opt[i] = max(-50.0, min(50.0, y_opt[i]))
            
    return y_opt

if __name__ == "__main__":
    grader = DroneGrader()
    print("【正在评测 - 纯直线基准模型】")
    score_simple = grader.grade(simple_baseline, timeout=15)
    
    print("\n\n【正在评测 - 纯Python数值流形优化模型】")
    score_smart = grader.grade(smart_optimizer_baseline, timeout=15)
    
    if score_simple and score_smart:
        print(f"📈 优化模型 的提升幅度: {(score_simple - score_smart) / score_simple * 100:.1f} %")
