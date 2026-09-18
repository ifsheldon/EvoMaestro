# 内置数据集

[English](README.md)

| 目录 | 程序数 | 用途 |
| --- | ---: | --- |
| `MOP/` | 58 和 56 | 无人机路径优化代码和两次运行记录。 |
| `GraphMOP/` | 56 | 图任务路由代码和一次运行记录。 |
| `mock-demo/` | 5 | 用于交互式模拟演化的初始岛屿节点。 |
| `mock-guide/` | 38 | 固定的引导教程快照，包含示例性的双语摘要。 |

MOP 和 GraphMOP 同时包含评测代码、初始程序、运行器和以下完整运行目录：

- `MOP/results_50g_runs/run_20260319_080103/`：58 个程序。
- `MOP/results_50g_runs/run_20260319_182915/`：56 个程序。
- `GraphMOP/results_50g_runs/run_20260319_183058/`：56 个程序。

每个运行目录包含 `programs.sqlite`，以及已有的配置、生成程序、评测结果、摘要和日志。
两份 MOP 数据库已迁移到当前评审优先级结构，原始数据库备份保留在仓库外。
两份数据库的评审指标缓存已于 2026-09-18 离线补齐，分别覆盖全部 58 和 56 个程序，每份运行均有 49 个非空推理距离指标。
修复保留了所有程序字段、历史优先级分配和其他数据表；现在修改评审设置可以重新计算所有节点的优先级。
备份和验证记录保留在仓库外，操作方式见[仅修复指标缓存的工作流](../docs/architecture/reasoning-embeddings.md#missing-review-metric-rows)。
历史配置和日志保留原路径；启动或恢复演化时，请使用同目录下的任务运行器。
新的运行目录、临时评测输出、Python 缓存和 SQLite 辅助文件仍由 Git 忽略。
模拟快照还包含 `dataset.json`，用于声明其角色。
模拟分数和摘要仅用于演示，不代表研究结果。
引导数据只读，模拟数据集的 Maestro Chat 保持锁定。

## 浏览已有运行

在仓库根目录运行：

```sh
cd evomaestro-interface
uv run --locked --all-packages python start.py \
  --shinka-search-root ../datasets \
  --guide-db ../datasets/mock-guide/programs.sqlite \
  --frontend-port 3000 --backend-port 8001 --release
```

打开 `http://localhost:3000`，选择 MOP 或 GraphMOP。
浏览无需模型 API 密钥，也不会启动演化。
如需继续已有运行，请将完整的 `results_50g_runs/run_*/` 运行目录复制到 `datasets/` 之外的新工作目录，再使用对应的 MOP 或 GraphMOP 运行器和 `--interactive --resume /absolute/path/to/working-run` 参数启动。
真实演化需要你自己的服务商凭据，并会产生 API 费用；详见[运行真实演化](../README.zh-CN.md#运行真实演化)。

## 启动模拟演示

在仓库根目录启动新的演示：

```sh
uv run --locked --all-packages python evomaestro-interface/tools/start_mock_demo.py --release
```

启动器先将 `mock-demo` 复制到 Git 忽略的 `mock-runs/demo-*/mock-demo/` 目录，再启动演化，并使用此处固定的 `mock-guide`。
请保持内置快照不变；如需保留自己的进度，请恢复对应工作副本。
详见[公开说明](../README.zh-CN.md#数据集)和[模拟演示工作流](../docs/guides/mock-examples.md)。
