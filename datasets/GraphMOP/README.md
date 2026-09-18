# GraphMOP：无向图中的服务器路由多目标优化

这个目录实现了一个新的 ShinkaEvolve 任务：在一个无向图拓扑中，把终端设备产生的任务路由到少数服务器节点。

优化目标：

- 端到端延迟最小化
  - 传输延迟：路径跳数更多、链路更拥堵时延迟更高
  - 排队延迟：服务器负载越高，排队延迟越高
- 系统总能耗最小化
  - 路由能耗：数据沿链路传输产生能耗
  - 计算能耗：活跃服务器的空载功耗和动态功耗

目录结构：

- `initial.py`
  - 可演化函数 `evolve_task_routing(...)`
- `graph_evaluation.py`
  - 图拓扑用例、合法性校验、评分函数和基线策略
- `evaluate.py`
  - Shinka 评测入口，把最小化目标映射为 `combined_score = -final_score`
- `run_evo_explicit_50g.py`
  - 显式 Python 配置的 50 代演化入口

本地单次评测：

```bash
uv run --locked --all-packages python datasets/GraphMOP/evaluate.py --program_path datasets/GraphMOP/initial.py --results_dir datasets/GraphMOP/tmp_eval
```

启动演化：

```bash
cp .env.example .env
# 在 .env 中设置 OPENAI_API_KEY
uv run --locked --all-packages python datasets/GraphMOP/run_evo_explicit_50g.py
```

启动脚本会从仓库根目录的 `.env` 加载密钥；已有的环境变量不会被覆盖。

## 已有运行记录

`results_50g_runs/run_20260319_183058/` 包含 56 个程序及其数据库、配置、逐代代码、评测结果、摘要和日志。
浏览方法见[内置数据集说明](../README.zh-CN.md)。
如需恢复演化，请复制完整运行目录，并使用本目录的运行器和 `--interactive --resume /absolute/path/to/working-run` 参数启动。
