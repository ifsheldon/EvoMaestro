# EvoMaestro

**理解并引导大语言模型驱动的程序演化。**

EvoMaestro 是一个可视化界面，用于探索程序群体如何演化，并引导演化接下来尝试的方向。
它基于 ShinkaEvolve，将群体结构、算法思路、源代码与评测结果联系起来，帮助你理解有潜力的策略，并在运行过程中进行干预。

[论文（UIST 2026）](https://www.researchgate.net/publication/414382819_EvoMaestro_Toward_Interpretable_and_Steerable_LLM-Driven_Program_Evolution) · [在线演示](https://evomaestro-demo.reify.ing) · [English](README.md) · [快速开始](#快速开始) · [数据集](#数据集)

## 功能

- **探索演化过程：** 在演化树和程序视图中查看谱系、岛屿、交叉事件，以及通向最佳程序的路径。
- **比较算法策略：** 检查代码、差异、提示词、日志与评分，使用代码或推理嵌入分析聚类和不相似性。
- **引导搜索：** 提出修改建议、合并互补程序、禁用或恢复候选，并通过开始、暂停、继续和单步控制已连接的演化运行器。
- **安排审阅重点：** 根据分数变化、嵌入不相似性或自定义规则标记值得关注的程序，调整合并推荐的质量与多样性权重。
- **理解运行背景：** 阅读演化总结，通过 Maestro Chat 讨论实验、单个程序或代码差异。
- **双语学习：** 使用英文或简体中文界面，并通过固定示例数据集完成交互式引导。

## 快速开始

模拟演示通过预设逻辑生成演化过程、嵌入和评测分数，不调用模型 API。
这是体验界面最简单的方式。

### 1. 安装

需要 Git、[uv](https://docs.astral.sh/uv/)、[Bun](https://bun.sh/) 1.4 或更新版本，以及 [Node.js](https://nodejs.org/) 22.22.1 或更新版本。
Python 工作区使用 Python 3.12 或更新版本，由 uv 管理环境。

```sh
git clone --recurse-submodules https://github.com/ifsheldon/EvoMaestro.git
cd EvoMaestro
uv sync --locked --all-packages
bun install --frozen-lockfile
```

请在 `uv sync` 和 `uv run` 命令中均使用 `--all-packages`，将界面所需的 FastAPI、Uvicorn 与 ShinkaEvolve 一起安装和使用。
共享锁文件记录了全部工作区成员，但根目录命令若不带此参数，只会选择根项目的依赖。

请保留仓库固定的 `ShinkaEvolve` 子模块版本，其中包含 EvoMaestro 所需的交互集成。

### 2. 使用内置示例

仓库已包含全部四个数据集：MOP、GraphMOP、`mock-demo` 和 `mock-guide`。
无需另行下载数据。

```text
EvoMaestro/
└── datasets/
    ├── MOP/                       # 任务代码和两次运行记录
    │   ├── run_evo_explicit_50g.py
    │   └── results_50g_runs/run_*/programs.sqlite
    ├── GraphMOP/                  # 任务代码和一次运行记录
    │   ├── run_evo_explicit_50g.py
    │   └── results_50g_runs/run_*/programs.sqlite
    ├── mock-demo/programs.sqlite
    └── mock-guide/programs.sqlite
```

请保留各数据集的完整目录和已有的运行记录。
模拟数据集还包含 `dataset.json`，用于标识演示和引导角色。
使用方法见[内置数据集说明](datasets/README.zh-CN.md)。
选定的[在线演示地址](https://evomaestro-demo.reify.ing)与论文项目网站一致；部署验证仍待完成。

### 3. 启动模拟演示

在仓库根目录运行：

```sh
uv run --locked --all-packages python evomaestro-interface/tools/start_mock_demo.py --release
```

打开 [localhost:3000](http://localhost:3000)。
启动器会构建前端，并同时启动前端、后端和模拟演化运行器。
点击**开始**，从五个初始节点启动演化；或点击**引导**，探索已有节点的演示数据。
完成或退出引导后，界面会恢复之前的数据集与视图。

每次启动都会在仓库内 Git 忽略的 `mock-runs/` 目录中创建新的工作副本，并在终端输出位置。
关闭后保留该副本，数据包中的原始快照不会被修改。
在启动器终端按 `Ctrl+C` 停止服务。

`mock-demo` 中仍显示 Maestro Chat 入口，但聊天视图保持锁定，本地部署也一样，因此演示不会通过聊天消耗主机的 ChatGPT 订阅额度。
模拟演化和引导均不需要 API 密钥。
恢复工作副本和准备示例数据的方法见[模拟示例文档](docs/guides/mock-examples.md)。

## 数据集

| 数据集 | 快照中的程序数 | 用途 |
|---|---:|---|
| **MOP** | 两次运行分别为 58 和 56 | 无人机路径优化，综合考虑路径长度、噪音和信号风险。 |
| **GraphMOP** | 56 | 图上的任务路由，权衡延迟与能耗。 |
| **mock-demo** | 5 | 用于交互式模拟演化的初始岛屿节点。 |
| **mock-guide** | 38 | 固定的引导示例，包含已有分支、交叉节点与双语示意总结。 |

模拟分数与引导总结仅用于说明功能，不代表基准实验结果。
`mock-guide` 为只读数据集，通过**引导**打开，不显示在普通数据集选择菜单中。

### 浏览已有运行

MOP 包含两次运行记录，分别有 58 和 56 个程序；GraphMOP 包含一次运行记录，共 56 个程序。
每个任务目录同时包含可运行的任务代码和 `results_50g_runs/` 下的完整运行记录。

从仓库根目录开始：

```sh
cd evomaestro-interface
uv run --locked --all-packages python start.py \
  --shinka-search-root ../datasets \
  --guide-db ../datasets/mock-guide/programs.sqlite \
  --frontend-port 3000 --backend-port 8001 \
  --release
```

在数据集选择控件中选择 MOP 或 GraphMOP。
该命令只启动界面，不启动演化运行器；继续和单步需要连接运行器才能生成新程序。
连接运行器后，单步会额外提交一个候选，然后暂停后续提交；当前目标已完成时，会按需增加目标。
已经在途的评估仍可能继续完成。
浏览已有运行不需要模型 API 密钥。

## 运行真实演化

真实演化会调用运行器配置的模型服务，并产生相应的 API 费用。
随附的 MOP 和 GraphMOP 显式配置运行器需要 `OPENAI_API_KEY`；其他配置也可能需要 `GEMINI_API_KEY`。

如果尚未创建本地配置，在仓库根目录执行以下命令，然后填入所需密钥：

```sh
cp .env.example .env
```

同时启动一个新的 MOP 运行和界面时，从仓库根目录开始：

```sh
cd evomaestro-interface
uv run --locked --all-packages python start.py \
  --shinka-search-root ../datasets/MOP \
  --guide-db ../datasets/mock-guide/programs.sqlite \
  --example-runner ../datasets/MOP/run_evo_explicit_50g.py \
  --frontend-port 3000 --backend-port 8001 \
  --release
```

运行 GraphMOP 时，将两处 MOP 路径替换为对应的 GraphMOP 路径。
启动器会将运行器连接到界面，并启用交互控制。
如需继续内置运行，请从 `datasets/MOP/results_50g_runs/` 或 `datasets/GraphMOP/results_50g_runs/` 中选择一个完整运行目录，复制到 `datasets/` 之外的新工作目录。
使用对应的运行器，将搜索根目录设为工作目录的父目录，再添加 `--runner-args "--resume /absolute/path/to/working-run"`。
保持内置快照不变；真实演化仍需要你自己的服务商 API 凭据。
MOP/GraphMOP 的代表性真实恢复运行测试仍是待完成的发布验证项。

任务定义与评测细节见 [MOP](datasets/MOP/README.md) 和 [GraphMOP](datasets/GraphMOP/README.md)。

### 在本地使用 Maestro Chat

Maestro Chat 使用 Codex SDK，以及运行 EvoMaestro 的主机上的 Codex 登录状态。
按照[官方认证指南](https://learn.chatgpt.com/docs/auth#sign-in-with-chatgpt)设置 Codex，然后登录你自己的 ChatGPT 账户：

```sh
codex login
```

打开 MOP、GraphMOP 等普通实验数据集，即可使用实验、代码或差异聊天。
两个模拟数据集仍保留聊天限制。
Maestro Chat 使用的 ChatGPT 订阅权限与真实演化所需的模型 API 密钥相互独立。
清空对话会取消当前请求并移除已保存的会话关联，下一条消息将开始新对话；主机上的原始 Codex 会话文件仍保留。

## 当前限制与未来工作

- **聚类过滤：** 过滤时保留基于完整种群的 PCA 布局，让可见节点的位置与空间关系保持稳定。
  隐藏程序仍会影响已存储的投影；过滤不会重新计算坐标。
- **公开部署：** 使用 `uv run --locked --all-packages poe start-mock-interactive-published` 启动共享的匿名演示。
  显式的 `--public-demo` 策略将 HTTP/WebSocket 访问限制在模拟工作副本和固定导览，禁用 Maestro，并验证私有运行器回调。
  访客共享控制与进度；在部署主机上配置 DNS、TLS、代理路由和限流。
  普通本地模式仅面向可信用户，单独使用 `--release` 只构建优化后的前端。
- **规模与解释：** 评估使用了 50 个节点的演化树，系统演示达到了约 200 个节点；更大规模尚未验证，生成的解释也可能存在错误。
  可以进一步检查代码、差异和评测结果。

未来研究方向包括对相关节点组进行引导、在演化收敛时建议或触发暂停、更清晰地展示生成解释的来源，以及面向更大演化树的聚合视图。
这些方向尚未实现，也没有承诺的发布日期。
计划使用的演示地址为 `https://evomaestro-demo.reify.ing`；[部署路由说明](docs/guides/mock-examples.md#single-origin-demo-routing)记录了公开演示策略与部署要求。

## 开发

如需在单个容器中部署模拟演示、项目网站和 MOP/GraphMOP Shinka 查看器，请阅读 [Docker 部署](docker/README.zh-CN.md)。
该配置发布四个大于 10000 的主机回环端口供主机 cloudflared 隧道使用，并在重启后保留模拟进度。

`evomaestro-interface/` 包含 Next.js/React 前端和 FastAPI 后端，ShinkaEvolve 集成以子模块形式提供，其余目录包含基准任务代码。
仓库根目录是 Bun 工作区，成员为 `evomaestro-interface` 和 `project-page`。
`project-page/` 包含独立的公开项目网站，详见其[开发说明](project-page/README.md)。
JavaScript 依赖共享根目录的 `bun.lock`，并提升安装到根目录的 `node_modules/`；存在不兼容版本时，Bun 会按需保留成员目录下的 `node_modules/`。
Python 依赖共享根目录的 `uv.lock`。
在仓库根目录运行 `bun install --frozen-lockfile`；安装时也会配置 Git 钩子。
`datasets/` 中的历史运行记录和模拟快照不参与 Ruff 检查和格式化；MOP 和 GraphMOP 的任务代码仍参与检查。

在 `evomaestro-interface/` 中运行前端检查：

```sh
bun test
bunx --no-install tsc --noEmit
bunx --no-install biome check
bun run build
```

先从[文档索引](docs/README.zh-CN.md)查找所需说明。
更多细节见[前后端开发指南](evomaestro-interface/README.md)、[界面架构](evomaestro-interface/architecture.md)、[ShinkaEvolve 集成](docs/architecture/shinka-evolve.md)和[推理嵌入规则](docs/architecture/reasoning-embeddings.md)。

## 引用

```bibtex
@inproceedings{liang2026evomaestro,
  author = {Liang, Feng and Cheng, Sizhe and Li, Yikai and He, Ruijie and Wen, Xiaolin and Wang, Yong},
  title = {{EvoMaestro}: Toward Interpretable and Steerable {LLM}-Driven Program Evolution},
  booktitle = {The 39th Annual ACM Symposium on User Interface Software and Technology},
  series = {UIST '26},
  year = {2026},
  doi = {10.1145/3830398.3830626}
}
```

## 许可证与致谢

EvoMaestro 源代码采用 [MIT 许可证](LICENSE)。
[ShinkaEvolve 子模块](ShinkaEvolve/)保留其 [Apache 2.0 许可证](ShinkaEvolve/LICENSE)。
EvoMaestro 基于 ShinkaEvolve 构建，并借鉴了 AlphaEvolve 展示的程序演化方法。

`docs/reference-papers/` 中的参考论文与提取图片保留原作者信息和声明，不适用 EvoMaestro 的 MIT 许可证。
