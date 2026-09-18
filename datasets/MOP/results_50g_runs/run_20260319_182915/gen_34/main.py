# EVOLVE-BLOCK-START
import math

class SpectralPathOptimizer:
    """
    Optimizes the drone path in amplitude-space using a multi-scale Gaussian basis.
    This architecture ensures smooth curves and allows for broad global bends 
    (to minimize F3) and local detours (to minimize F2) simultaneously.
    """
    def __init__(self, start, end, school, base, num_points):
        self.xs, self.ys = start
        self.xe, self.ye = end
        self.sx, self.sy = school
        self.bx, self.by = base
        self.n = num_points
        
        # Calculate X-intervals
        total_dx = self.xe - self.xs
        if abs(total_dx) < 1e-7:
            self.dx = 0.0
            self.t_coords = [0.0] * num_points
        else:
            self.dx = total_dx / (num_points + 1)
            self.t_coords = [(i + 1) / (num_points + 1) for i in range(num_points)]
        
        self.x_coords = [self.xs + t * total_dx for t in self.t_coords]
        
        # Spectral Basis: 10 narrow Gaussians (0.08 sigma), 6 wide Gaussians (0.3 sigma)
        # This allows the optimizer to control both narrow avoidance and wide attraction.
        self.basis_mu = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.35, 
                         0.15, 0.3, 0.45, 0.6, 0.75, 0.9]
        self.basis_sig = [0.08] * 10 + [0.35] * 6
        self.weights = [0.0] * len(self.basis_mu)
        
        # Precompute Basis Matrix: row=point, col=basis activation
        self.basis_matrix = []
        for t in self.t_coords:
            envelope = math.sin(math.pi * t)
            activations = [envelope * math.exp(-(t - mu)**2 / (2 * sig**2)) 
                           for mu, sig in zip(self.basis_mu, self.basis_sig)]
            self.basis_matrix.append(activations)

    def get_y_coords(self, weights):
        """Constructs specific Y coordinates from weights."""
        y_out = []
        for i in range(self.n):
            # Straight baseline
            y_linear = self.ys + self.t_coords[i] * (self.ye - self.ys)
            # Spectral offset
            y_spectral = sum(weights[k] * self.basis_matrix[i][k] for k in range(len(weights)))
            y_out.append(y_linear + y_spectral)
        return y_out

    def compute_basis_gradients(self, weights):
        """Computes gradients of the total energy landscape w.r.t basis weights."""
        y = self.get_y_coords(weights)
        y_full = [self.ys] + y + [self.ye]
        
        # Initialize y-level gradients
        dy_grads = [0.0] * self.n
        
        # 1. Path Distance Gradient (F1 minimize)
        # Penalizes path length to keep drone from wandering too far 
        w_f1 = 6.0
        for i in range(self.n + 1):
            seg_len = math.sqrt(self.dx**2 + (y_full[i+1] - y_full[i])**2 + 1e-10)
            grad_val = (y_full[i+1] - y_full[i]) / seg_len
            if i > 0: dy_grads[i-1] += w_f1 * grad_val
            if i < self.n: dy_grads[i] -= w_f1 * grad_val
            
        # 2. School Noise Gradient (F2 minimize - repulsion)
        w_f2 = 2800.0
        sig_f2 = 24.0 # Influence radius
        for i in range(self.n):
            dist_sq = (self.x_coords[i] - self.sx)**2 + (y[i] - self.sy)**2
            repulsion = math.exp(-dist_sq / (2 * sig_f2**2))
            # d/dy exp(-d^2/2s^2) = exp(-d^2/2s^2) * -1 * (y-sy)/s^2
            dy_grads[i] += w_f2 * (-repulsion * (y[i] - self.sy) / (sig_f2**2))
            
        # 3. Signal Loss Gradient (F3 minimize - attraction)
        # Strong focus on F3 reduction: broad pull towards the base coordinate (bx, by)
        w_f3 = 1.3
        sig_f3_x = 42.0 
        for i in range(self.n):
            # Distance squared to base stationary Y
            # Pull magnitude is modulated by horizontal proximity to base station
            weight_x = math.exp(-(self.x_coords[i] - self.bx)**2 / (2 * sig_f3_x**2))
            dy_grads[i] += w_f3 * weight_x * (y[i] - self.by)

        # Mapping Y gradients back to the low-dimensional basis weight space
        weight_grads = [0.0] * len(weights)
        for i in range(self.n):
            for k in range(len(weights)):
                weight_grads[k] += dy_grads[i] * self.basis_matrix[i][k]
                
        return weight_grads

    def optimize(self, its=220):
        """Standard Adam optimizer implemented for weight convergence."""
        m = [0.0] * len(self.weights)
        v = [0.0] * len(self.weights)
        beta1, beta2, eps = 0.9, 0.999, 1e-8
        lr = 6.5 # High LR for amplitude space
        
        for t in range(1, its + 1):
            grads = self.compute_basis_gradients(self.weights)
            for k in range(len(self.weights)):
                m[k] = beta1 * m[k] + (1.0 - beta1) * grads[k]
                v[k] = beta2 * v[k] + (1.0 - beta2) * (grads[k] ** 2)
                m_h = m[k] / (1.0 - beta1**t)
                v_h = v[k] / (1.0 - beta2**t)
                self.weights[k] -= lr * m_h / (math.sqrt(v_h) + eps)
        
        return self.get_y_coords(self.weights)

def evolve_drone_path(start, end, school, base, num_points):
    """
    Entry point for drone path optimization. Effectively minimizes distance, 
    school noise, and signal drop by solving for basis coefficients.
    """
    if num_points <= 0:
        return []
    
    # Initialize the spectral optimizer
    optimizer = SpectralPathOptimizer(start, end, school, base, num_points)
    
    # Run optimization loop to find best path amplitudes
    path_y = optimizer.optimize()
    
    return path_y
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
