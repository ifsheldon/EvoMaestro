import Image from "next/image";
import type { Step } from "react-joyride";
import {
  BilingualContent,
  LangContent,
  TourEndStep,
  TourWelcomeStep,
} from "./language";

export function tourSteps(): Step[] {
  return [
    // 0. Welcome and mock-dataset notice, before the numbered walkthrough.
    {
      target: '[data-tour="tree-canvas"]',
      content: <TourWelcomeStep />,
      placement: "center",
      skipBeacon: true,
    },
    // 1. Radial tree overview
    {
      target: '[data-tour="tree-canvas"]',
      content: (
        <BilingualContent
          en={
            <>
              <strong>Radial Tree View</strong>
              <p>
                This is the main visualization — a radial tree that grows
                outward from the center. Each sector represents an{" "}
                <em>island</em> (an independent population). Node color
                intensity reflects its score — darker means higher performance.
              </p>
            </>
          }
          zh={
            <>
              <strong>环形树状图</strong>
              <p>
                这是主要的可视化界面：一棵沿半径向外延伸的树状图。每个扇区代表一个
                <em>岛屿</em>
                （独立种群）。节点颜色深浅反映其分数——越深代表性能越好。
              </p>
            </>
          }
        />
      ),
      placement: "center",
      skipBeacon: true,
    },
    // 2. Best nodes (centers the tree, spotlight on global best)
    {
      target: '[data-tour="best-node-overlay"]',
      content: (
        <BilingualContent
          en={
            <>
              <strong>Best Nodes</strong>
              <p>
                The best node on each island is highlighted with a{" "}
                <span className="text-yellow-500 font-semibold">
                  golden ring
                </span>
                . The global best node has a larger, brighter glow. The golden
                path traces the lineage from root to the best-performing
                program.
              </p>
            </>
          }
          zh={
            <>
              <strong>最优节点</strong>
              <p>
                每个岛屿上的最优节点都会用
                <span className="text-yellow-500 font-semibold">金色光环</span>
                高亮标出。全局最优节点的光环更大更亮。金色路径追溯了从根节点到最优程序的演化血统。
              </p>
            </>
          }
        />
      ),
      placement: "auto",
      skipBeacon: true,
      data: { action: "fit-view" },
    },
    // 3. Dissimilarity chord links (fit on entry, including Back from a zoomed node)
    {
      target: '[data-tour="chord-links"]',
      content: (
        <BilingualContent
          en={
            <>
              <strong>Dissimilarity Arcs</strong>
              <p>
                These arcs connect the best nodes across islands. Arc color
                intensity reflects dissimilarity — darker red means more
                different approaches. Two high-scoring, highly dissimilar nodes
                indicate diverse successful strategies.
              </p>
            </>
          }
          zh={
            <>
              <strong>不相似度弧线</strong>
              <p>
                这些弧线连接了不同岛屿上的最优节点。弧线颜色越深红代表方法差异越大。如果两个高分节点不相似度也很高，说明它们用不同的思路都达到了很好的效果。
              </p>
            </>
          }
        />
      ),
      placement: "auto",
      skipBeacon: true,
      data: { action: "fit-view" },
    },
    // 4. Right-click: View group (opens context menu)
    {
      target: '[data-tour="node-context-menu"]',
      content: (
        <BilingualContent
          en={
            <>
              <strong>Right-Click Menu — View</strong>
              <p>
                Right-click any node to open a context menu. The first group
                lets you inspect the node:
              </p>
              <ul className="list-disc pl-4 mt-1 space-y-0.5">
                <li>
                  <strong>Details</strong> — score, metadata, patch description
                </li>
                <li>
                  <strong>Code</strong> — view the source code
                </li>
                <li>
                  <strong>Code Change</strong> — diff against the parent node
                </li>
                <li>
                  <strong>Filter</strong> — dim all nodes scoring below this one
                </li>
              </ul>
            </>
          }
          zh={
            <>
              <strong>右键菜单 — 查看</strong>
              <p>右键点击任意节点打开菜单。第一组用于查看节点信息：</p>
              <ul className="list-disc pl-4 mt-1 space-y-0.5">
                <li>
                  <strong>Details</strong> — 分数、元数据、补丁描述
                </li>
                <li>
                  <strong>Code</strong> — 查看源代码
                </li>
                <li>
                  <strong>Code Change</strong> — 与父节点的代码差异
                </li>
                <li>
                  <strong>Filter</strong> — 将低于此节点分数的节点变灰
                </li>
              </ul>
            </>
          }
        />
      ),
      placement: "right",
      skipBeacon: true,
      data: { action: "show-context-menu" },
    },
    // 4b. Maestro Chat (screenshot)
    {
      target: '[data-tour="node-context-menu"]',
      content: (
        <LangContent
          className="text-left text-sm leading-relaxed overflow-y-auto"
          style={{ maxHeight: "60vh" }}
          en={
            <>
              <Image
                src="/codex-chat.png"
                alt="Maestro Chat panel"
                width={320}
                height={224}
                className="rounded-lg border border-gray-200 mb-3 mx-auto"
              />
              <strong>Maestro Chat</strong>
              <p>
                In the <strong>Code</strong> and <strong>Code Change</strong>{" "}
                windows, you can always ask Maestro to explain the code or diff.
                The AI agent can read the actual source files and query the
                database to give you precise answers about any program.
              </p>
            </>
          }
          zh={
            <>
              <Image
                src="/codex-chat.png"
                alt="Maestro 聊天面板"
                width={320}
                height={224}
                className="rounded-lg border border-gray-200 mb-3 mx-auto"
              />
              <strong>Maestro 聊天</strong>
              <p>
                在 <strong>Code</strong> 和 <strong>Code Change</strong>{" "}
                窗口中，你可以随时向 Maestro 提问来解释代码或差异。AI
                代理可以读取实际源文件并查询数据库，为你提供关于任何程序的精确回答。
              </p>
            </>
          }
        />
      ),
      placement: "right",
      skipBeacon: true,
    },
    // 5. Right-click: Steering group
    {
      target: '[data-tour="node-context-menu"]',
      content: (
        <BilingualContent
          en={
            <>
              <strong>Right-Click Menu — Steer Evolution</strong>
              <p>
                The second group lets you intervene in the evolution process:
              </p>
              <ul className="list-disc pl-4 mt-1 space-y-0.5">
                <li>
                  <strong>Suggest</strong> — tell the AI to modify this node's
                  code based on your idea
                </li>
                <li>
                  <strong>Merge</strong> — combine two nodes' ideas into a new
                  program
                </li>
                <li>
                  <strong>Ban</strong> — prevent the system from evolving
                  further along this node's lineage
                </li>
              </ul>
            </>
          }
          zh={
            <>
              <strong>右键菜单 — 干预演化</strong>
              <p>第二组用于操控演化进程：</p>
              <ul className="list-disc pl-4 mt-1 space-y-0.5">
                <li>
                  <strong>Suggest</strong> — 让 AI 根据你的建议修改代码
                </li>
                <li>
                  <strong>Merge</strong> — 合并两个节点的思路，生成新程序
                </li>
                <li>
                  <strong>Ban</strong> — 禁止系统继续沿此节点方向演化
                </li>
              </ul>
            </>
          }
        />
      ),
      placement: "right",
      skipBeacon: true,
    },
    // 5b. Suggest (detail)
    {
      target: '[data-tour="node-context-menu"]',
      content: (
        <LangContent
          className="text-left text-sm leading-relaxed overflow-y-auto"
          style={{ maxHeight: "60vh" }}
          en={
            <>
              <Image
                src="/suggest.png"
                alt="Expert Suggestion modal"
                width={320}
                height={224}
                className="rounded-lg border border-gray-200 mb-3 mx-auto"
              />
              <strong>Expert Suggestion</strong>
              <p>
                Select a promising node and tell the AI how to improve it. The
                modal shows an AI-generated <em>Recommendation</em> as reference
                — you can follow it, modify it, or write your own idea. The AI
                will generate a new child node based on your guidance.
              </p>
            </>
          }
          zh={
            <>
              <Image
                src="/suggest.png"
                alt="专家建议弹窗"
                width={320}
                height={224}
                className="rounded-lg border border-gray-200 mb-3 mx-auto"
              />
              <strong>专家建议</strong>
              <p>
                选择一个有潜力的节点，告诉 AI 如何改进它。弹窗会显示 AI 生成的
                <em>参考建议</em>
                ——你可以参考、修改或写入自己的想法。AI
                会根据你的指导生成新的子节点。
              </p>
            </>
          }
        />
      ),
      placement: "right",
      skipBeacon: true,
    },
    // 5c. Merge (detail)
    {
      target: '[data-tour="node-context-menu"]',
      content: (
        <LangContent
          className="text-left text-sm leading-relaxed overflow-y-auto"
          style={{ maxHeight: "60vh" }}
          en={
            <>
              <Image
                src="/merge.png"
                alt="Merge modal"
                width={320}
                height={160}
                className="rounded-lg border border-gray-200 mb-3 mx-auto"
              />
              <strong>Merge Programs</strong>
              <p>
                When two nodes have complementary strengths, merge them into a
                new program. Select the nodes, optionally provide guidance on
                how to combine their approaches, and the AI generates a merged
                child. You can also compare the programs before merging.
              </p>
            </>
          }
          zh={
            <>
              <Image
                src="/merge.png"
                alt="合并弹窗"
                width={320}
                height={160}
                className="rounded-lg border border-gray-200 mb-3 mx-auto"
              />
              <strong>合并程序</strong>
              <p>
                当两个节点各有优势互补时，可以将它们合并为新程序。选择节点后，可以提供合并指导意见，AI
                会生成合并后的子节点。合并前还可以对比两个程序的代码和性能。
              </p>
            </>
          }
        />
      ),
      placement: "right",
      skipBeacon: true,
    },
    // 6. Right-click: Mark & Note
    {
      target: '[data-tour="node-context-menu"]',
      content: (
        <BilingualContent
          en={
            <>
              <strong>Right-Click Menu — Mark & Note</strong>
              <p>
                <strong>Mark</strong> bookmarks a node for easy identification.{" "}
                <strong>Note</strong> lets you attach a text annotation. These
                help you track important nodes during exploration.
              </p>
            </>
          }
          zh={
            <>
              <strong>右键菜单 — 标记 & 笔记</strong>
              <p>
                <strong>Mark</strong> 可以给节点打书签方便识别。
                <strong>Note</strong>{" "}
                可以给节点添加文字注释。这些功能帮助你在探索过程中标记重要节点。
              </p>
            </>
          }
        />
      ),
      placement: "right",
      skipBeacon: true,
    },
    // 7. Review-priority lightbulb
    {
      target: '[data-tour="tree-canvas"]',
      content: (
        <LangContent
          en={
            <>
              <Image
                src="/review-priority-indicator.png"
                alt="Review Priority lightbulb indicator"
                width={280}
                height={224}
                className="rounded-lg border border-gray-200 mb-3 mx-auto"
              />
              <strong>Review Priority Indicators</strong>
              <p>
                Lightbulbs mark programs prioritized for expert review. The
                active function may use score improvement, embedding
                dissimilarity, or custom logic. Click a lightbulb to inspect the
                supporting signal.
              </p>
            </>
          }
          zh={
            <>
              <Image
                src="/review-priority-indicator.png"
                alt="审阅优先级灯泡标记"
                width={280}
                height={224}
                className="rounded-lg border border-gray-200 mb-3 mx-auto"
              />
              <strong>审阅优先级标记</strong>
              <p>
                灯泡标记表示该程序已被设为专家优先审阅对象。当前函数可以使用分数提升、嵌入不相似度或自定义逻辑。点击灯泡可查看支持该优先级的信号。
              </p>
            </>
          }
        />
      ),
      placement: "center",
      skipBeacon: true,
    },
    // 8. Evolution Overview (opens the sidebar)
    {
      target: '[data-tour="overview-sidebar"]',
      content: (
        <BilingualContent
          en={
            <>
              <strong>Evolution Overview</strong>
              <p>
                Maestro keeps a running "global insights scratchpad" of what the
                search is learning, and this sidebar shows it live. It's
                organized into a few sections:
              </p>
              <ul className="list-disc pl-5 mt-1 space-y-0.5">
                <li>
                  <strong>Successful algorithmic patterns</strong> — designs
                  that land near the top of the score band, and the concrete
                  tricks that make them work.
                </li>
                <li>
                  <strong>Ineffective approaches</strong> — directions the
                  search tried and abandoned, plus the failure modes
                  (calibration mistakes, structural bugs, mis-modelled costs…).
                </li>
                <li>
                  <strong>Implementation insights</strong> — concrete
                  engineering reasons the current best is fast and accurate.
                </li>
                <li>
                  <strong>Performance analysis</strong> — how the top valid
                  cluster compares and where the remaining gaps are.
                </li>
              </ul>
              <p className="mt-1">
                A quick way to get a global understanding. It auto-refreshes
                when new programs arrive.
              </p>
            </>
          }
          zh={
            <>
              <strong>演化概览</strong>
              <p>
                Maestro
                会持续维护一份"全局洞察备忘录"，记录搜索正在学到的内容，这个侧边栏会实时呈现。它通常分为几个部分：
              </p>
              <ul className="list-disc pl-5 mt-1 space-y-0.5">
                <li>
                  <strong>成功的算法模式</strong>
                  ——稳定接近最佳分数的设计，以及使它们奏效的具体技巧。
                </li>
                <li>
                  <strong>无效的方法</strong>
                  ——搜索尝试过又被放弃的方向，以及失败的原因（如校准偏差、结构性
                  bug、成本建模错误等）。
                </li>
                <li>
                  <strong>实现要点</strong>
                  ——当前最佳程序之所以又快又准确的具体工程原因。
                </li>
                <li>
                  <strong>性能分析</strong>
                  ——靠前的有效程序之间的对比，以及剩余的改进空间。
                </li>
              </ul>
              <p className="mt-1">
                帮助你快速建立全局认知。新程序到达时会自动刷新。
              </p>
            </>
          }
        />
      ),
      placement: "left",
      skipBeacon: true,
      data: { action: "open-overview" },
    },
    // 9. Global Maestro Chat
    {
      target: '[data-tour="global-maestro-chat-btn"]',
      content: (
        <BilingualContent
          en={
            <>
              <strong>Maestro Chat</strong>
              <p>
                Chat with Maestro about the overall evolution experiment.
                Maestro can query the database, read source files and meta
                analyses, and help you understand score trends, mutation
                patterns, and the search trajectory.
              </p>
            </>
          }
          zh={
            <>
              <strong>Maestro 对话</strong>
              <p>
                与 Maestro 进行关于整个演化实验的对话。Maestro
                可以查询数据库、阅读源代码和元分析文件，帮助你理解分数趋势、变异模式和搜索轨迹。
              </p>
            </>
          }
        />
      ),
      placement: "bottom",
      skipBeacon: true,
    },
    // 10. Multi-select
    {
      target: '[data-tour="tree-canvas"]',
      content: (
        <LangContent
          en={
            <>
              <Image
                src="/multi-select.png"
                alt="Multi-select panel"
                width={400}
                height={200}
                className="rounded-lg border border-gray-200 mb-3 mx-auto"
              />
              <strong>Multi-Select</strong>
              <p>
                Hold{" "}
                <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">
                  Ctrl
                </kbd>{" "}
                (or{" "}
                <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">⌘</kbd>
                ) and click to select up to 5 nodes. A floating panel appears
                with actions for the selection — compare code diffs, view
                performance charts, analyze dissimilarities, or merge programs.
              </p>
            </>
          }
          zh={
            <>
              <Image
                src="/multi-select.png"
                alt="多选面板"
                width={400}
                height={200}
                className="rounded-lg border border-gray-200 mb-3 mx-auto"
              />
              <strong>多选</strong>
              <p>
                按住{" "}
                <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">
                  Ctrl
                </kbd>
                （或{" "}
                <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">⌘</kbd>
                ）点击可选择最多 5
                个节点。会弹出浮动面板，提供对比代码差异、查看性能图表、分析不相似度、合并程序等操作。
              </p>
            </>
          }
        />
      ),
      placement: "center",
      skipBeacon: true,
    },
    // 11. Canvas right-click → Distribution
    {
      target: '[data-tour="tree-canvas"]',
      content: (
        <LangContent
          en={
            <>
              <Image
                src="/score-distribution.png"
                alt="Score distribution chart"
                width={400}
                height={270}
                className="rounded-lg border border-gray-200 mb-3 mx-auto"
              />
              <strong>Canvas Right-Click — Score Distribution</strong>
              <p>
                Right-click on empty canvas space to open a menu where you can
                view the overall score distribution. You can also set a
                threshold to filter nodes based on the distribution.
              </p>
            </>
          }
          zh={
            <>
              <Image
                src="/score-distribution.png"
                alt="分数分布图"
                width={400}
                height={270}
                className="rounded-lg border border-gray-200 mb-3 mx-auto"
              />
              <strong>画布右键 — 分数分布</strong>
              <p>
                在画布空白处右键，可以查看整体的分数分布图，也可以根据分布来设置阈值过滤节点。
              </p>
            </>
          }
        />
      ),
      placement: "center",
      skipBeacon: true,
    },
    // 12. Other tabs
    {
      target: '[data-tour="workspace-tabs"]',
      content: (
        <BilingualContent
          en={
            <>
              <strong>Other Views</strong>
              <p>Besides the tree, there are three more tabs:</p>
              <ul className="list-disc pl-4 mt-1 space-y-0.5">
                <li>
                  <strong>Programs</strong> — sortable table of all programs
                </li>
                <li>
                  <strong>Clusters</strong> — PCA scatter plot with GMM
                  clustering
                </li>
                <li>
                  <strong>Path → Best</strong> — linear visualization of the
                  best-performing lineage
                </li>
              </ul>
            </>
          }
          zh={
            <>
              <strong>其他视图</strong>
              <p>除了树状图，还有三个标签页：</p>
              <ul className="list-disc pl-4 mt-1 space-y-0.5">
                <li>
                  <strong>Programs</strong> — 可排序的程序列表
                </li>
                <li>
                  <strong>Clusters</strong> — PCA 降维 + GMM 聚类散点图
                </li>
                <li>
                  <strong>Path → Best</strong> — 最优路径的线性可视化
                </li>
              </ul>
            </>
          }
        />
      ),
      placement: "bottom",
      skipBeacon: true,
    },
    // 13. Search
    {
      target: '[data-tour="search-btn"]',
      content: (
        <BilingualContent
          en={
            <>
              <strong>Search</strong>
              <p>
                Quickly find a node by its number or ID. Useful when you want to
                jump to a specific program in a large tree.
              </p>
            </>
          }
          zh={
            <>
              <strong>搜索</strong>
              <p>
                通过节点编号或 ID
                快速查找节点。在大型树状图中定位特定程序时非常有用。
              </p>
            </>
          }
        />
      ),
      placement: "bottom",
      skipBeacon: true,
    },
    // 14. Settings (opens the settings modal)
    {
      target: '[data-tour="settings-modal"]',
      content: (
        <BilingualContent
          en={
            <>
              <strong>Settings</strong>
              <p>
                Customize your experience — toggle error/timeout node
                visibility, choose color maps (Blues / Viridis), adjust
                dissimilarity thresholds and the Merge recommendation
                quality-diversity balance, switch tree visualization modes, and
                more.
              </p>
            </>
          }
          zh={
            <>
              <strong>设置</strong>
              <p>
                自定义你的体验——切换错误/超时节点的显示、选择颜色方案（Blues /
                Viridis）、调整不相似度阈值与合并推荐的质量和多样性权衡、切换树状图可视化模式等。
              </p>
            </>
          }
        />
      ),
      placement: "left",
      skipBeacon: true,
      data: { action: "open-settings" },
    },
    // 15. Background & Help resources (toolbar buttons)
    {
      target: '[data-tour="resources-group"]',
      content: (
        <BilingualContent
          en={
            <>
              <strong>Background & Help</strong>
              <p>
                Use these toolbar controls to orient yourself anytime:{" "}
                <strong>Guide</strong> replays this guided tour,{" "}
                <strong>LLM Evolution Intro</strong> opens a primer on the
                evolutionary algorithm, and the <strong>language switch</strong>{" "}
                changes the language for the complete interface and this tour.
                The primer opens in a new tab so you can keep this view open.
              </p>
            </>
          }
          zh={
            <>
              <strong>背景与帮助</strong>
              <p>
                工具栏上的这些控件可以随时帮你回顾相关信息：
                <strong>Guide</strong>
                重新播放这个引导教程，<strong>LLM Evolution Intro</strong>
                打开关于演化算法的入门介绍，<strong>语言切换</strong>
                会同时切换整个界面和本导览的语言。入门介绍会在新标签页中打开，便于随时返回当前页面。
              </p>
            </>
          }
        />
      ),
      placement: "bottom",
      skipBeacon: true,
    },
    // Tour end — offer "More Details"
    {
      target: '[data-tour="tree-canvas"]',
      content: <TourEndStep />,
      placement: "center",
      skipBeacon: true,
      buttons: [],
    },
    // ── Extra detail steps (after "More") ──
    // 1. Run Control
    {
      target: '[data-tour="run-panel"]',
      content: (
        <BilingualContent
          en={
            <>
              <strong>Run Control</strong>
              <p>
                Monitor and control the evolution process. You can pause,
                resume, step through one generation at a time, set a target
                generation count, or stop the run entirely. The progress bar
                shows how many nodes have been generated.
              </p>
            </>
          }
          zh={
            <>
              <strong>运行控制</strong>
              <p>
                监控和管理演化过程。可以暂停、继续、单步执行一代、设定目标代数或完全停止运行。进度条显示已生成的节点数量。
              </p>
            </>
          }
        />
      ),
      placement: "right",
      skipBeacon: true,
    },
    // 2. Legend
    {
      target: '[data-tour="tree-legend"]',
      content: (
        <BilingualContent
          en={
            <>
              <strong>Legend</strong>
              <p>
                The legend shows node types, patch shapes, and the performance
                color scale. Click the <strong>average score label</strong>{" "}
                above the performance bar to toggle a global score filter —
                nodes below the average will be dimmed.
              </p>
            </>
          }
          zh={
            <>
              <strong>图例</strong>
              <p>
                图例展示节点类型、补丁形状和性能颜色标尺。点击性能色条上方的
                <strong>平均分数标签</strong>
                可以切换全局分数过滤——低于平均分的节点会变灰。
              </p>
            </>
          }
        />
      ),
      placement: "right",
      skipBeacon: true,
    },
    // 3. Crossover node (zooms to one)
    {
      target: '[data-tour="crossover-overlay"]',
      content: (
        <BilingualContent
          en={
            <>
              <strong>Cross Node</strong>
              <p>
                This node was created by combining code from two parent nodes
                (shown by the dashed blue line).
              </p>
            </>
          }
          zh={
            <>
              <strong>跨岛节点</strong>
              <p>
                这个节点通过合并两个不同岛屿的代码创建（由蓝色虚线连接）。这些"交叉"节点桥接了隔离的种群，通常会引入任何单一岛屿无法独自发现的新颖方法。
              </p>
            </>
          }
        />
      ),
      placement: "auto",
      skipBeacon: true,
      data: { action: "focus-crossover" },
    },
    // 4. Island root node (zooms to one)
    {
      target: '[data-tour="island-root-overlay"]',
      content: (
        <BilingualContent
          en={
            <>
              <strong>Island Root Node</strong>
              <p>
                This is the starting node of an island. Click it to toggle
                filtering by this island's average score — nodes below the
                average will be dimmed. Click again to remove the filter. The
                node's border color reflects the island's average performance.
              </p>
            </>
          }
          zh={
            <>
              <strong>岛屿初始节点</strong>
              <p>
                这是一个岛屿的起始节点。点击它可以按该岛屿的平均分数过滤——低于平均值的节点会变灰。再次点击取消过滤。节点边框颜色反映了该岛屿的平均性能。
              </p>
            </>
          }
        />
      ),
      placement: "auto",
      skipBeacon: true,
      data: { action: "focus-island-root" },
    },
    // 5. Ring arc sections (zooms to show them)
    {
      target: '[data-tour="ring-arc-overlay"]',
      content: (
        <BilingualContent
          en={
            <>
              <strong>Generation Ring Arcs</strong>
              <p>
                These colored arcs show the average score of each island at each
                generation depth. Click any arc to filter — only nodes scoring
                above that island-generation average remain highlighted. This
                reveals which islands were strongest at each stage of evolution.
              </p>
            </>
          }
          zh={
            <>
              <strong>代际环弧</strong>
              <p>
                这些彩色弧段显示了每个岛屿在各代际深度的平均分数。点击任意弧段可以过滤——只有分数高于该岛屿-代际平均值的节点保持高亮。这揭示了哪些岛屿在演化的各个阶段表现最强。
              </p>
            </>
          }
        />
      ),
      placement: "auto",
      skipBeacon: true,
      data: { action: "focus-ring-arc" },
    },
  ];
}
