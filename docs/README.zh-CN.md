# 文档

[English](README.md) | [简体中文](README.zh-CN.md)

安装与启动请先阅读[项目说明](../README.zh-CN.md)，随附示例的使用方法见[数据集指南](../datasets/README.zh-CN.md)。
请在指南指定的工作目录中运行示例命令。
下列技术文档以英文为主。

## 使用指南

- [模拟示例与交互导览](guides/mock-examples.md)：启动或恢复演示、准备示例数据、了解固定导览数据集，以及配置同源部署。
- [界面开发指南](../evomaestro-interface/README.md)：前后端环境、命令与检查流程。
- [论文项目网站](../project-page/README.md)：维护与构建项目展示页面。

## 架构

- [ShinkaEvolve 集成](architecture/shinka-evolve.md)：演化运行器、存储、人工干预、检查点与完成进度统计。
- [推理嵌入](architecture/reasoning-embeddings.md)：有效性规则、相似度、投影与离线修复流程。
- [界面架构](../evomaestro-interface/architecture.md)：视图、导览生命周期、聊天与后端集成。

## 基准任务

- [无人机路径优化（MOP）](benchmarks/drone-path-optimization.md)：输入、输出、约束与评分。
- [图多目标路由（GraphMOP）](benchmarks/graph-mop.md)：路由、服务器分配、延迟与能耗目标。
- [随附数据集](../datasets/README.zh-CN.md)：任务代码、历史运行记录与工作副本使用方法。

## 维护

- [发布检查清单](maintenance/release-checklist.md)：剩余源码问题、发布前检查与公开部署要求。
- [文档维护规则](AGENTS.md)：分类、权威来源、翻译与链接检查。

## 归档

- [模拟导览实施计划](archive/mock-guide-implementation-plan.md)：已完成的设计与验证历史；当前命令请以持续维护的模拟示例指南为准。

## 参考论文

这些第三方材料保留原作者署名与声明，不适用 EvoMaestro 的 MIT 许可证。

- AlphaEvolve：[提取文本](reference-papers/alpha-evolve/AlphaEvolve.md) · [原始 PDF](reference-papers/alpha-evolve/AlphaEvolve_origin.pdf)。
- ShinkaEvolve：[提取文本](reference-papers/shinka-evolve/shinka_evolve.md) · [原始 PDF](reference-papers/shinka-evolve/shinka_evolve_origin.pdf)。
