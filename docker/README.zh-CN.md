# Docker 部署

[English](README.md) | [简体中文](README.zh-CN.md)

单个容器运行模拟演示前端、私有后端、模拟运行器、项目网站，以及两个 ShinkaEvolve 查看器。
Supervisor 管理六个进程，Compose 使用 `restart: unless-stopped`。
容器内不需要模型密钥、Codex 登录、反向代理或 cloudflared 配置。

## 构建与启动

需要 Docker Engine、Compose v2 或更新版本，以及已初始化且保持固定版本的 ShinkaEvolve 子模块。
在仓库根目录运行；如果当前账户需要特权访问 Docker，请在 Docker 命令前加 `sudo`：

```sh
git submodule update --init --recursive
docker compose -f docker/compose.yaml up -d --build --wait --wait-timeout 180
docker compose -f docker/compose.yaml ps
```

构建通过 uv 和 Bun 安装锁定的依赖，并将两个 Next.js 应用编译为 standalone 生产版本。
运行镜像包含追踪到的前端依赖和 Python 运行依赖，不包含构建工具或开发服务器。
构建时需要联网获取依赖、基础镜像与 Google Fonts；运行时的模型调用均为模拟。
Dockerfile 专用忽略文件排除了凭据、本地工作副本、依赖目录、Git 元数据和构建产物，并仅选取随附的历史运行。

## Cloudflared 源站

在主机的 cloudflared 隧道中配置以下 HTTP 源站：

| 公开域名 | 主机源站 |
| --- | --- |
| `evomaestro-demo.reify.ing` | `http://127.0.0.1:13000` |
| `evomaestro.reify.ing` | `http://127.0.0.1:13001` |
| `shinka-mop.reify.ing` | `http://127.0.0.1:19870` |
| `shinka-graph-mop.reify.ing` | `http://127.0.0.1:19871` |

所有发布端口仅绑定主机回环地址。
模拟前端将 HTTP 和 WebSocket 请求代理到容器内的 `127.0.0.1:18001`；后端端口不发布到主机。
演示域名需要保留 WebSocket 升级。
DNS、TLS、隧道路由及公开访问限流由此 Compose 项目之外的配置负责。

通过 `EVOMAESTRO_DEMO_PORT`、`EVOMAESTRO_PROJECT_PORT`、`EVOMAESTRO_MOP_PORT` 和 `EVOMAESTRO_GRAPH_MOP_PORT` 可覆盖主机端口。
例如，在仓库根目录运行：

```sh
EVOMAESTRO_DEMO_PORT=23000 docker compose -f docker/compose.yaml up -d --wait
```

后续 Compose 命令应使用相同的覆盖值。
修改主机端口不需要重新构建；生产代理配置中的容器内后端端口固定不变。

## 状态与访问

首次启动时，将五个节点的模拟种子以原子方式复制到 `mock-data` 命名卷中的 `/data/mock-demo`。
重启和重新构建复用该副本；现有数据库无效时初始化会失败，不会重置进度。
点击 Start 开始演示；恢复的演化等待用户控制。
所有访客共享这个工作副本及其控制。
固定导览、MOP 的两次历史运行和 GraphMOP 的历史运行保留在只读镜像中。
构建时将镜像内副本设置为 SQLite DELETE 日志模式，使浏览无需创建可写的 WAL 辅助文件；仓库快照及其逻辑数据保持不变。

后端启用现有的公开演示策略，全部 Maestro 路由保持禁用。
生成的回调凭据仅保存在私有运行时 tmpfs 中，提供给后端和模拟运行器，不进入浏览器或 Next.js 环境。
容器使用 UID/GID `10001`、只读根文件系统，不挂载主机源码或凭据。
仅模拟数据卷持久化；临时文件与 Next.js 缓存使用 tmpfs。

Shinka 启动器复用现有 HTML 与浏览处理逻辑，并增加数据集白名单、目录穿越与符号链接拒绝，以及明确的静态文件白名单。
MOP 请求不能选择 GraphMOP 或可写模拟运行，其他查看器同样受限。
没有 `attempt_log` 的旧快照不显示失败提案节点；浏览不会新增表或迁移随附数据库。

## 运维

在仓库根目录运行：

```sh
docker compose -f docker/compose.yaml logs -f --tail=100
docker compose -f docker/compose.yaml exec web supervisorctl -c /app/docker/supervisord.conf status
docker compose -f docker/compose.yaml restart
docker compose -f docker/compose.yaml stop
docker compose -f docker/compose.yaml start
```

Supervisor 重启退出的服务进程，并在关闭时终止对应进程组。
健康检查验证四个站点、每份历史数据库、私有 API 和运行器心跳。
健康检查失败会显示在 `docker compose ps` 中；Docker 不会仅因容器不健康就自动重启。
连续启动失败最终会将对应 Supervisor 进程标记为 FATAL；请查看日志、修复原因，再重启容器。
Docker 的 local 日志驱动会轮转容器日志；随着访客演化程序，数据卷中的运行产物会持续积累。

更新代码后使用相同的 `up -d --build --wait` 命令重新构建。
使用 `docker compose -f docker/compose.yaml down` 可移除容器并保留工作副本。
为 `down` 添加 `--volumes` 会永久删除模拟工作副本；下次启动会使用随附种子重新初始化。
备份命名卷前应停止容器，确保 SQLite 和运行产物一致。

## 开发检查

在仓库根目录运行：

```sh
docker compose -f docker/compose.yaml config --quiet
uv run --locked --all-packages ruff check docker
uv run --locked --all-packages ruff format --check docker
SHINKA_PRICING_MODE=offline uv run --locked --all-packages pytest docker/test_runtime.py
```

测试覆盖重启持久化、初始化失败处理、保留快照的浏览行为，以及公开路径访问限制。
镜像构建会验证两个 standalone Next.js 应用。
本地开发见[模拟工作流](../docs/guides/mock-examples.md)，现有公开演示约定见[界面架构](../evomaestro-interface/architecture.md)。
