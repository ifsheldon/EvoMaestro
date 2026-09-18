# GraphMOP 任务教程

## 1. 任务背景

这个任务建模的是一个典型的边缘计算/网络卸载问题：

- 网络是一个由若干节点构成的无向图
- 少数节点部署了服务器，具备较高算力，但功耗更高
- 其余节点是终端设备，会持续产生需要卸载处理的任务
- 每个任务都必须从源节点出发，沿着图中的一条合法路径，最终到达某个服务器节点进行处理

这不是单纯的最短路问题，因为你要同时平衡两类目标：

- 延迟
- 能耗

而且二者会彼此冲突：

- 选最近的服务器，可能导致该服务器过载，排队延迟上升
- 把任务分散到更远的服务器，能减轻排队，但会增加传输延迟和传输能耗
- 关闭部分服务器可以节能，但又可能让剩余服务器拥堵

因此这是一个标准的多目标优化问题。

## 2. 优化目标

本任务显式优化两个目标：

### 2.1 端到端延迟最小化

端到端延迟由两部分构成：

- 传输延迟
  - 路径越长、跳数越多，延迟越高
  - 链路负载越高，拥堵越重，延迟会进一步放大
- 排队延迟
  - 服务器负载越接近其服务能力，排队等待越久

### 2.2 系统总能耗最小化

总能耗也由两部分构成：

- 路由能耗
  - 任务流量经过链路时消耗能量
- 计算能耗
  - 活跃服务器会产生空载功耗
  - 随着利用率增加，还会产生额外的动态功耗

## 3. 目录结构

本任务目录位于：

- [`GraphMOP`](.)

主要文件如下：

- [`initial.py`](./initial.py)
  - 定义可演化函数 `evolve_task_routing(...)`
  - 也是当前基线策略所在位置
- [`graph_evaluation.py`](./graph_evaluation.py)
  - 定义图拓扑测试集、合法性校验、评分函数和 baseline
- [`evaluate.py`](./evaluate.py)
  - 连接 ShinkaEvolve 评测框架
- [`run_evo_explicit_50g.py`](./run_evo_explicit_50g.py)
  - 50 代演化入口

## 4. 输入输出接口

核心函数是：

```python
def evolve_task_routing(
    num_nodes,
    edges,
    server_nodes,
    task_sources,
    task_info,
    server_info,
):
    ...
```

### 4.1 输入含义

`edges` 中每条边格式为：

```python
(u, v, base_latency, energy_cost, capacity)
```

`task_info[source]` 格式为：

```python
(arrival_rate, payload_size, compute_demand)
```

`server_info[server]` 格式为：

```python
(service_rate, idle_power, dynamic_power)
```

### 4.2 输出格式

返回一个字典：

```python
{
    source_node: {
        "server": server_node,
        "path": [source_node, ..., server_node],
    },
}
```

约束如下：

- 每个 `task_source` 都必须有一个分配结果
- `server` 必须属于 `server_nodes`
- `path` 必须从源节点出发，终点是对应服务器
- `path` 中相邻节点必须在图中有边
- `path` 必须是简单路径，不能有环

## 5. 评分逻辑

评分函数在 [`graph_evaluation.py`](./graph_evaluation.py) 中。

### 5.1 链路负载统计

每个任务的流量定义为：

- `traffic = arrival_rate * payload_size`

### 5.2 服务器负载统计

每台服务器的总计算负载定义为：

- `arrival_rate * compute_demand`

若服务器负载超过服务能力，解会被判为无效。

### 5.3 传输延迟

每条边的有效时延为：

- `base_latency * (1 + 0.55 * load_ratio)`

其中：

- `load_ratio = edge_load / capacity`

### 5.4 排队延迟

服务器排队时延采用：

- `queue_delay = 1 / (service_rate - load)`

### 5.5 路由能耗

每条边上的路由能耗按流量累计：

- `traffic * energy_cost`

### 5.6 计算能耗

若某台服务器被使用，则能耗包括：

- 空载功耗 `idle_power`
- 动态功耗 `dynamic_power * utilization^1.35`

其中：

- `utilization = load / service_rate`

### 5.7 最终分数

最终分数为：

```python
final_score = avg_latency * avg_energy * (1 + 0.05 * avg_hops + 0.03 * active_servers)
```

注意：

- `final_score` 越小越好
- `evaluate.py` 中映射为 `combined_score = -final_score`

## 6. 当前基线策略

当前 [`initial.py`](./initial.py) 的基线策略会：

- 按任务负载强度排序
- 遍历候选服务器
- 用综合权重最短路生成候选路径
- 根据路径长度、预计利用率、空载功耗和动态功耗选择更优服务器

此外 [`graph_evaluation.py`](./graph_evaluation.py) 还提供了：

- `nearest_server_baseline`
- `balanced_weighted_baseline`

## 7. 测试集设计

当前内置了 4 组图拓扑：

- `mesh-10`
- `ring-chords-12`
- `gridish-14`
- `backbone-16`

## 8. 如何单独评测

```bash
# 在克隆的仓库根目录执行
uv run --locked --all-packages python datasets/GraphMOP/evaluate.py --program_path datasets/GraphMOP/initial.py --results_dir datasets/GraphMOP/tmp_eval
```

重点看：

- `Latency`
- `Energy`
- `Graph MOP Score`
- `combined_score`

## 9. 如何运行演化

```bash
# 在克隆的仓库根目录执行
uv run --locked --all-packages python datasets/GraphMOP/run_evo_explicit_50g.py
```

运行前在仓库根目录的 `.env` 或环境变量中设置 `OPENAI_API_KEY`。
当前入口的生成模型、摘要模型和嵌入模型均使用 OpenAI，不需要 `GEMINI_API_KEY`。

结果会写入：

- `datasets/GraphMOP/results_50g_runs/run_时间戳/`

## 10. 结果目录怎么看

典型目录里会有：

- `programs.sqlite`
- `experiment_config.yaml`
- `gen_*/main.py`
- `gen_*/edit.diff`
- `gen_*/rewrite.txt`
- `gen_*/results/metrics.json`

比较每代效果时，重点看：

- `Graph MOP Score`
- `Latency`
- `Energy`

## 11. 可继续增强的方向

- 为每个源节点保留多条候选路径
- 先做粗分配，再做局部迁移
- 引入轻量局部搜索
- 增加更大规模和更复杂的图拓扑
- 使用更真实的排队和拥塞模型

## 12. 常见错误

- 返回值结构不对
- 路径起点或终点错误
- 路径包含不存在的边
- 路径存在环
- 某些源节点漏分配
- 单台服务器过载

出现这些问题时，评测通常会退化成无效分数。

## 13. 推荐阅读顺序

1. [`initial.py`](./initial.py)
2. [`graph_evaluation.py`](./graph_evaluation.py)
3. [`evaluate.py`](./evaluate.py)
4. [`run_evo_explicit_50g.py`](./run_evo_explicit_50g.py)
