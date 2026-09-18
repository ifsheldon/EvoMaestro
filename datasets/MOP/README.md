# MOP：基于 ShinkaEvolve 的无人机多目标路径演化任务

## 1. 任务简介

本目录实现了一个小型但完整的 **LLM 演化优化任务**：

- 用 `ShinkaEvolve` 持续改写 `evolve_drone_path(...)` 函数。
- 让无人机在固定起点-终点之间生成一条离散路径（给定 X 坐标，优化每个中间点的 Y 坐标）。
- 同时优化三个目标：
  - `F1`：飞行路径长度（越短越好）
  - `F2`：靠近学校导致的噪音惩罚（越小越好）
  - `F3`：与基站距离导致的信号风险（越小越好）

这个任务是对 AlphaEvolve / ShinkaEvolve 方法论的一个落地示例：

- **AlphaEvolve 思路**：用“代码进化 + 自动评估”驱动算法发现。
- **ShinkaEvolve 思路**：在此基础上提升样本效率（父代采样、novelty rejection、LLM 动态选择等）。
- **本任务目标**：把上述范式应用到可解释的工程型多目标优化（MOP）问题上。

## 2. 问题建模

### 2.1 路径参数化

路径不是直接优化二维连续曲线，而是采用更稳定的参数化：

- 起点 `start=(x0,y0)`、终点 `end=(x1,y1)` 固定。
- X 轴按等间距插入 `num_points` 个中间点。
- 只需要输出这些中间点对应的 Y 值列表（长度必须是 `num_points`）。

这样把几何路径问题转成了“可执行代码生成 + 向量输出”的优化问题，适合演化式代码搜索。

### 2.2 三目标与最终分数

评测在 `drone_evaluation.py` 中完成，返回：

- `avg_f1`：平均归一化路径长度
- `avg_f2`：平均学校噪音惩罚
- `avg_f3`：平均基站距离惩罚
- `final_score = avg_f1 * avg_f2 * avg_f3`

注意：

- 业务含义上 `final_score` 越小越好。
- Shinka 框架默认“越大越好”，所以 `evaluate.py` 中做了映射：
  - `combined_score = -final_score`
- 因此在 Shinka 数据库里，`combined_score` 越大越好（即越接近 0 越好）。

## 3. 代码结构

- `initial.py`
  - 任务入口。
  - `# EVOLVE-BLOCK-START/END` 包住可演化函数 `evolve_drone_path`。
  - `run_experiment()` 供评测框架调用。
- `drone_evaluation.py`
  - 多组不同维度案例（10 到 100 个中间点）。
  - 计算 F1/F2/F3 与总分。
- `evaluate.py`
  - 对接 `run_shinka_eval(...)`。
  - 负责指标聚合、合法性校验、`-score` 映射、文本反馈。
- `run_evo.py`
  - 演化启动脚本（代数、并行数、模型池、岛屿参数等）。
- `run_evo_explicit_50g.py`
  - 显式配置的演化入口，支持交互式运行和从结果目录恢复。
- `results_50g/`
  - `run_evo.py` 的本地输出目录，运行后生成，不随源代码分发。

## 4. 演化流程（从 AlphaEvolve 到 ShinkaEvolve）

本任务在执行上遵循标准循环：

1. 从当前程序库采样父代（island + 采样策略）。
2. LLM 生成 `diff/full` 代码修改。
3. 运行 `evaluate.py` 调 `run_experiment()` 得到指标。
4. 将候选程序、指标、日志入库。
5. 持续迭代，保留并扩散高质量程序。

和 AlphaEvolve 原型一致之处：

- “代码就是搜索空间”。
- “自动评测就是适应度函数”。

和 ShinkaEvolve 一致之处：

- island archive 维护多样性。
- 可接入多模型与动态采样。
- 可通过 novelty / 反馈机制提升样本效率。

## 5. 如何运行

> 推荐在克隆后的仓库根目录 执行命令。

### 5.1 环境准备

```bash
uv sync --locked --all-packages
cp .env.example .env
```

在 `.env` 中设置 `OPENAI_API_KEY` 和 `GEMINI_API_KEY`。`run_evo.py` 会从仓库根目录的 `.env` 加载密钥；已有的环境变量不会被覆盖。

### 5.2 单次评测（不演化）

```bash
uv run --locked --all-packages python datasets/MOP/evaluate.py --program_path datasets/MOP/initial.py --results_dir datasets/MOP/tmp_eval
```

### 5.3 启动演化

```bash
uv run --locked --all-packages python datasets/MOP/run_evo.py
```

默认会在 `datasets/MOP/results_50g/` 下生成代际结果。

## 6. 查看发布数据集

本目录同时包含任务代码和 `results_50g_runs/` 下的两次完整运行记录：`run_20260319_080103` 有 58 个程序，`run_20260319_182915` 有 56 个程序；程序总数包含岛屿副本。
每个运行目录中的 `programs.sqlite` 保存代码、分数、父子关系和元数据，`gen_*/` 保存可用的逐代代码、提示、模型输出、评测结果和日志。
两份数据库已迁移到当前评审优先级结构，原始备份保留在仓库外。

按[公开说明中的数据集浏览步骤](../../README.zh-CN.md#浏览已有运行)启动界面，选择 `MOP`，通过 Programs 和 Path → Best 查看实际记录及其改进路径。
数据包中的配置记录了历史运行环境；重新演化时应使用本目录的启动脚本。

## 7. 复现与扩展建议

### 7.1 可调参数

- 演化预算：`num_generations`
- 并行度：`max_parallel_jobs`
- patch 比例：`patch_types` 与 `patch_type_probs`
- 岛屿与迁移：`num_islands`、`migration_interval`、`migration_rate`
- 父代策略：`parent_selection_strategy`、`exploitation_alpha`

### 7.2 常见扩展方向

- 调整目标加权（例如把 F2 噪音惩罚拉高）。
- 增加障碍物/禁飞区约束。
- 在 `evaluate.py` 输出更细粒度文本反馈，引导 LLM 更快收敛。
- 对 `results_50g` 做二次分析（代际趋势、策略迁移、失败模式）。

## 8. 注意事项

- `evolve_drone_path` 必须返回长度严格等于 `num_points` 的可转 `float` 列表。
- 评测中会对 Y 值进行 `[-50, 50]` 裁剪。
- 一旦异常或超时，分数会退化到无效值（`inf`/极低 `combined_score`）。
- 本目录是“方法演示 + 任务样例”，不是最终生产级飞行控制器。

## 9. 你可以从哪里开始看

如果你第一次接触这个任务，建议阅读顺序：

1. `initial.py`（理解输入输出接口）
2. `drone_evaluation.py`（理解目标函数）
3. `evaluate.py`（理解 Shinka 评分映射）
4. `run_evo.py`（理解演化配置）
5. 本目录 `results_50g_runs/run_*/` 中的 `programs.sqlite` 和 `gen_*/main.py`（在界面中选择一个已演化程序，再查看对应源码）
