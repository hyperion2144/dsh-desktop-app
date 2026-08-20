# DSH 插件市场 → 桌面端「DeepSeek Harness Desktop Desktop」机会盘点

> 调研日期：2026-08（数据来自 GitHub `gh api` 实时抓取、npm registry 查询、本机 `~/.dsh` 与 `@deepseek-ai/dsh` 安装目录、桌面壳源码 `desktop/src-tauri/src/lib.rs`）
> 结论速览：**插件生态里"通知/审批事件"与"视觉/剪贴板"两类是桌面壳性价比最高的增强点；内置插件市场、IM 桥、模型路由、远程网关等明确不做。**

## 0. 三个插件来源的真实情况（盘点结论）

| 来源 | 真实情况 | 规模/形态 |
|---|---|---|
| **awesome-dsh-plugin**（`awesome-dsh-plugin/awesome-dsh-plugin`，main 分支） | 社区精选清单，README 980 行、11 个分区（UI / Themes / Models / Sessions / Memory / Tools / Skills / Workflow / Notifications / Dev&Runtime / 市场 / 娱乐） | 数百个插件；每个插件声明 `dsh.bundle` manifest，可 `dsh plugin add` 安装；**PR #695「Add dsh-desktop-tauriapp — DSH desktop packaging skill」已于 2026-08-15 合并**（本桌面壳本体已在 Skills 分区收录） |
| **dsh-market / npm** | `dsh-market/dsh-market` 是 DSH 内置的可视化插件市场插件，npm 包名 **`dshmarket`（v1.6.0）**，安装命令 `dsh plugin --profile web add dshmarket`；npm 上另有 `dsh-find-plugin`、`create-dsh-plugin`、`dsh-usage-stats`(0.1.15)、`dsh-prometheus`(0.1.0)、`dsh-vision-router`(1.2.3)、`dsh-desktop-tauriapp`(0.3.0) 等 | 插件即 npm 包；`dsh plugin add` 实际**转发给 pnpm**（已从 `dsh plugin --profile web --help` 输出验证），来源 = npm registry + git/file 路径 |
| **DSH 本体安装目录**（`~/.nvm/.../node_modules/@deepseek-ai/dsh`，v0.1.0-rc.6） | 无"内置插件目录"概念；CLI 只负责 profile 启动 + `plugin` 命令转发 pnpm（`lib/bin.js` 注释明示）。**真正的插件注册表在 `~/.dsh/profiles/<name>/package.json`**（`dsh.bundle` 清单 + `dependencies`） | 实测本机 `~/.dsh/profiles/web/package.json`：bundles = `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app` + **`dsh-vision-router`** + **`dsh-desktop-tauriapp`** —— 桌面壳当前 profile 已自带 vision router 与自身 bundle |

**关键推论**：桌面壳 spawn 的是完整 `dsh web`，因此**任何纯 Web/Client 侧插件（用量统计、通知 toast、皮肤、桌宠、文件拖拽等）开箱即白嫖**——只要在壳层 spawn 的 profile 里预装对应 npm 包即可，Rust 侧零改动。Rust 侧能"增强"的只有需要**系统级载体**（OS 通知、Dock 角标、托盘、全局快捷键、防睡眠、开机自启、深链、文件系统/剪贴板/截图）的能力。

## 1. 对照表：插件 → 桌面端可加功能

### 1.1 通知 / 审批 / 状态事件类（桌面壳当前只做"任务完成"，缺口最大）

| 插件（来源） | 它做什么 | 桌面端机会 | 难度 | 优先级 |
|---|---|---|---|---|
| `omdsh-dev/dsh-notification`（GitHub） | 回合完成桌面通知，按结果与关键词规则 | 事件词汇表参考：区分完成/失败/等待输入 | 低 | P0 |
| `doncelee229-cmyk/dsh-plugin-approval-alert` | 审批/提问/计划评审的 OS 通知，点击跳转 | **审批请求通知是最大价值点**——agent 卡住等用户；壳层可观察审批对话框 DOM 而非只测 busy→idle | 中 | P0 |
| `pany0593/dsh-ui-notifications`、`dingyi222666/dsh-session-notification`、`bill9109/dsh-web-ui-notify`、`ly6170/dsh-messager` | 完成/等待输入/审批/错误的多状态通知 | 与壳层现有本地 HTTP 桥（lib.rs `task_notifier_script`）合并为统一事件源，扩展注入脚本观察的状态集合 | 中 | P0 |
| `Bing-Bryan/dsh-unread-dot` | macOS Dock 角标 + 隐藏时提示音（Badging API） | 壳层已有 `set_badge_count`（lib.rs 523 行）；可补齐"点击角标跳窗口"语义与隐藏时提示音 | 低 | P1 |
| `wsxwj123/dsh-plugins#pet-bridge` | dsh 会话状态 → 桌宠气泡（thinking/toolcall/完成） | **桌宠气泡的现成协议**：壳层若做"DeepSeek Harness Desktop Desktop气泡"直接复用其状态语义 | 中 | P1 |
| `YuMo226/dsh-task-notify`、`CAOGGL/dsh-ding`、`ldchaowin/dsh-plugin-notify-sound`、`AI-Galaxy-GPU/dsh-sound` | Windows toast / 完成音效、按事件区分声音 | 壳层可加"按事件类型的声音/静音策略"（完成 vs 审批 vs 失败），Tauri notification 自带 sound 配置 | 低 | P2 |
| `THEWOLFWALKER/dsh-notifier` | 统一 notify() API，25+ 渠道 + 多渠道审批回传 | 参考其事件路由矩阵（timeSensitive/active/passive）设计壳层的打扰分级 | 低(参考) | P2 |
| `zhengjy01/dsh-period-report` | 周期报告 + 定时提醒（macOS/Linux 系统通知） | 与"预定任务消化通知"（1.3）合并考虑 | 中 | P2 |

### 1.2 视觉 / 图像理解类（壳层 profile 已装 dsh-vision-router，可直接加 OS 载体）

| 插件（来源） | 它做什么 | 桌面端机会 | 难度 | 优先级 |
|---|---|---|---|---|
| `ysr666/dsh-vision-router`（npm v1.2.3，**已在 profile bundles 中**） | 免 key 视觉链 + 像素工具（Q&A/grounding/crop/OCR/截图） | 白嫖基础已具备；加"截图问DeepSeek Harness Desktop Desktop"：壳层 `screencapture -i`/Windows 截图 → 注入 composer 或调视觉工具 | 中 | P0 |
| `GOU-GEE/deepseek-vision#plugins/dsh-plugin-deepseek-vision` | `analyze_clipboard` / `compare_images` / 免费 GLM-4.6V-Flash | **剪贴板图片分析**——壳层可加全局快捷键"分析剪贴板图"（Tauri 全局快捷键 + clipboard 读取） | 中 | P1 |
| `niyongsheng/free-vision-skill` | macOS Vision Framework 本地 OCR/看图，**图片不出本机** | 隐私卖点：桌面端"本地看图"模式，与壳层品牌一致 | 中 | P1 |
| `FuzzySoul/dsh-free-vision`、`gloryxpnv/dsh-tool-vision`、`jyh20030112/dsh-visual-plugin`、`kaixinbaba/dsh-vision-recognizer` | 各类视觉桥（免费商 / 本地 VLM / 结构化 JSON 证据） | 同上一行：统一走"粘贴/拖拽 → 描述进 composer"；壳层补 Tauri 文件拖拽（`onDragDropEvent`）与剪贴板图片监听 | 低-中 | P1 |

### 1.3 网页 / 浏览器自动化与 Computer Use

| 插件（来源） | 它做什么 | 桌面端机会 | 难度 | 优先级 |
|---|---|---|---|---|
| `agent-browser`（npm v0.34.0，vercel-labs） | 浏览器自动化 CLI（会话内已作为 skill 存在） | 壳层不必重复造；把"当前窗口截图/OCR/剪贴板"暴露成 agent 可用的原生工具才是有增量处 | 中 | P2 |
| `ZRui-C/dsh-computer-use`（GitHub） | Playwright/CDP + macOS 无障碍控制，出签名 DMG | 参考其"权限申请/安全护栏"设计；桌面壳做完整 computer-use 属过度设计 | 高 | 排除/观望 |
| `wqty123/dsh-browser`、`kyo615/dsh-browser-control`、`guo6x/dsh-pilot`、`anweat/dsh-browser`、`jiayan-xu/dsh-nuphus-mcp` | 各类真实/共享浏览器控制 | 桌面端唯一有增量的点：**浏览器打开权限、窗口聚焦、防误操作白名单**可做成系统级弹窗（壳层做），自动化本身留给插件 | 中 | P2 |
| `988hj7tczd-oss/dsh-computer-use` | 跨平台 computer-use（虚拟鼠标，11 工具） | 同 ZRui-C：高风险高成本，暂不做 | 高 | 排除 |

### 1.4 工作流 / 定时编排类（托盘的天然用武之地）

| 插件（来源） | 它做什么 | 桌面端机会 | 难度 | 优先级 |
|---|---|---|---|---|
| `titanwings/dsh-automation`、`Sev7een/dsh-plugin-automations`、`Jesse-njx/dsh-routines`、`Ceelog/dsh-plugins#scheduled-tasks`、`yangyongzhen/dsh-scheduler` | 定时/off-peak 跑 fresh agent 会话，结果经 webhook/通知投递 | **壳层是常驻托盘进程**：预定任务执行完 → 壳层系统通知 + Dock 角标；mac 可在任务窗口前 `caffeinate` 防睡眠 | 中 | P1 |
| `Dely0/dsh-workbench`、`causebefore/dsh-pomodoro` | 任务工作台 / 番茄钟（含浏览器通知） | 番茄钟/提醒可升级为**系统级通知**（壳层已有 notification 权限）；工作台本身留在 Web | 低 | P2 |
| `omdsh-dev/dsh-deep-research`、`apheli0os/deepseek-harness-orchestrate`、`icetomoyo/dsh_workflow` | 多 agent 编排 / 任务 DAG | 编排结束/失败是"大任务完成"事件，纳入壳层通知优先级模型 | 低 | P2 |

### 1.5 成本 / Token 统计类

| 插件（来源） | 它做什么 | 桌面端机会 | 难度 | 优先级 |
|---|---|---|---|---|
| `Make0209/dsh-usage-stats`（npm v0.1.15）等 20+ 用量/余额插件 | 用量热力图、余额、成本、峰值定价 | **托盘菜单余额/用量摘要 + 阈值告警**（余额<¥5 → OS 通知）。数据源建议用稳定端点（`xxiaoxiong/dsh-prometheus` 的 metrics 或插件 JSONL），别依赖 DOM | 中 | P1 |
| `xxiaoxiong/dsh-prometheus`（npm v0.1.0） | Prometheus 指标（会话/agent/LLM/tools/审批） | 壳层可轮询 loopback metrics 做用量/异常统计，比 DOM 启发式可靠 | 中 | P1 |
| `zh667/TokenLedger`、`bobcat848/dsh-calculator`、`dsh-context`（bowenliang123） | 明细记账 / 上下文构成 | 不做：数据展示留在 Web；壳层只消费"告警阈值"这一层 | 低 | P2 |

### 1.6 会话管理类

| 插件（来源） | 它做什么 | 桌面端机会 | 难度 | 优先级 |
|---|---|---|---|---|
| `qyw233/dsh-deeplink` | `?session=` / `?workspace=` 深链 | **Tauri URL scheme / 自定义协议**：`dsh://session/<id>` 从浏览器/Spotlight 直达会话，托盘"最近会话"菜单点击跳转 | 中 | P2 |
| `Semidia/dsh-session-manager`、`LeslieWylie/dsh-session-search-pro`、`mayf3/dsh-session-doctor` | 会话右键菜单 / 搜索 / 卡死诊断 | 托盘菜单可列"活跃会话 + 状态"（数据经会话查询端点），点击开窗 | 中 | P2 |
| `Nwflower/dsh-chat-import`、`lsz-asd/dsh-plugin-session-delete` | 跨工具导入 / 删除会话 | 无桌面增量 | - | 排除 |

### 1.7 桌宠 / 品牌类（与"DeepSeek Harness Desktop Desktop"人设最贴合）

| 插件（来源） | 它做什么 | 桌面端机会 | 难度 | 优先级 |
|---|---|---|---|---|
| `LeemanCheung/dsh-whale-animation` | 60 帧鲸鱼下潜动画（主题自适应） | **可直接复用为壳层通知动画/托盘图标动画素材**，与现有品牌注入（CSS 替换 logo）同源 | 低 | P1 |
| `hellosz/dsh-pets`（`pet_say` 工具）、`mengyun233/dsh-codex-pet`、`Nanki-nn/dsh-answer-pet`、`nzl153/pet-whale`、`vlln/whale-girl` | 各类 agent 状态桌宠（9 状态引擎、气泡） | 真"DeepSeek Harness Desktop Desktop桌宠"：Tauri 透明置顶窗口比网页 overlay 更强（跨窗口可见）；**复用 pet-bridge 状态协议 + whale 素材**，但注意别过度设计，先做"通知气泡"形态 | 中 | P1 |
| `eric-song-dev/dsh-ikun-pet`、`zealot00/dsh-pet` | 完成提示音 / 闹钟+番茄钟桌宠 | 闹钟/番茄钟可并入系统通知策略 | 低 | P2 |
| `XanthanL/dsh-plugin-uisfx`、`dsh-plugin-tts` | 语义音效 / TTS 朗读 | 壳层可用 TTS 播报"DeepSeek Harness Desktop Desktop汇报"（mac `say` / Windows SAPI，与 `Alan2Z/dsh-speak` 同思路） | 低 | P2 |

### 1.8 明确排除（桌面壳做不了、也不该做）

| 插件类别 | 理由 |
|---|---|
| **内置插件市场/管理器**（`dshmarket`、`dsh-store`、`dsh-plugin-workshop` 等 15+ 个） | 装插件=执行第三方代码；桌面壳做成"一键装插件"的 UI 会把安全与供应链责任引到壳层。**市场留在 Web GUI**，壳层只保证 spawn 的 profile 预装好精选集 |
| **IM 桥**（WeChat/Feishu/Telegram/DingTalk/Lark 等 20+ 个） | 纯服务端集成，无桌面载体；壳层做通知是消费端，不是桥接端 |
| **模型路由 / Provider / OAuth**（`dsh-codex-oauth`、`dsh-sub2api`、tier router 等） | 配置域，桌面壳零增量 |
| **LAN / 远程访问网关**（`dsh-lan-access`、mobile PWA、`dsh-remote-tunnel`、`dsh-web-lan-access` 等） | 安全敏感（token/隧道），与壳层"只信任 127.0.0.1:3080"的模型冲突；远程化是产品决策，不是壳层顺手之事 |
| **记忆 / 上下文 / 自我进化类**（Memory 分区 30+ 个） | agent 侧能力，壳层不碰 |
| **完整 computer-use**（虚拟鼠标控制整机） | 权限与安全成本高（屏幕录制/辅助功能授权），壳层现有人力不值得；留白 |

## 2. 桌面壳比纯网页更强的载体（增强清单）

| 载体 | 壳层现状（lib.rs） | 可增强方向 |
|---|---|---|
| 系统通知 | 已有：任务完成（busy→idle DOM + 本地 HTTP 桥 + 失焦才弹） | 事件源扩展：审批/提问/计划评审/失败/目标受阻；点击通知聚焦窗口（`set_focus`） |
| Dock 角标 | 已有：`set_badge_count`（未读任务数） | 补"点击跳窗清角标"、隐藏时提示音（参考 `dsh-unread-dot`） |
| 托盘 | 已有：TrayIcon + tip | 升级为状态中心：活跃会话列表、余额/用量摘要、最近会话深链、防睡眠开关、预定任务下一执行时间 |
| 常驻 + 开机自启 | 已有：单实例 + 托盘常驻 | 预定任务消化通知（配 1.4 的定时插件）；mac 任务窗口前 `caffeinate` |
| 全局快捷键 | 无 | "截图问DeepSeek Harness Desktop Desktop""分析剪贴板图""呼出窗口"（Tauri global-shortcut） |
| 文件拖拽 / 剪贴板 | 无 | `onDragDropEvent` 注入路径进 composer；剪贴板图片监听 → 视觉插件 |
| URL scheme / 深链 | 无 | `dsh://` 协议注册（Windows 注册表 / macOS CFBundleURLTypes），配 `dsh-deeplink` |

## 3. 推荐做的前 5 项（按性价比排序）

1. **P0 · 审批/提问/异常 → 系统通知 + 点击聚焦**（难度：中）
   在现有注入脚本的 DOM 观察上，从"仅 busy→idle"扩展到"出现审批对话框/提问框/plan-review/错误卡片"；事件经现有本地 HTTP 桥推到壳层，弹 OS 通知并 `set_focus`。参考 `dsh-plugin-approval-alert` / `dsh-ui-notifications` 的选择器思路。**理由**：agent 卡住等用户是桌面通知价值最大的一类，改动集中在注入脚本，Rust 侧改动小。
2. **P0 · 截图/剪贴板 → 视觉理解（配已装的 dsh-vision-router）**（难度：中）
   壳层加"区域截图"（mac `screencapture -i`、Windows 自带截图）与剪贴板图片读取，注入 webview composer 或直接调视觉工具。**理由**：profile 已预装 vision router，白嫖基础在；"截图问DeepSeek Harness Desktop Desktop"是人设+功能双赢的差异点。
3. **P1 · 托盘升级为状态中心**（难度：中）
   托盘菜单列活跃会话/状态、余额用量摘要（经 `dsh-prometheus` loopback metrics 或插件 JSONL）、最近会话、防睡眠开关。**理由**：常驻是壳层核心存在感，把 Web 里散落的统计收敛到托盘，一次开发多处受益。
4. **P1 · 预定任务消化通知 + 防睡眠**（难度：中）
   预装 `dsh-routines`/`dsh-plugin-automations` 类定时插件，壳层在任务窗口前后 `caffeinate` 防睡眠，完成/失败经壳层系统通知。**理由**：托盘常驻 + 开机自启的组合天然适合"无人值守定时跑"，是网页做不到的场景。
5. **P1 · DeepSeek Harness Desktop Desktop通知气泡（轻量桌宠）**（难度：中）
   复用 `dsh-whale-animation` 素材 + `pet-bridge` 状态语义，做成通知样式的小鲸鱼气泡（先不做 always-on-top 桌宠窗口，避免过度设计）；后续可升级 TTS 播报。**理由**：品牌一致性强、与现有品牌注入同源，情绪价值高。

## 4. 证据来源

- awesome-dsh-plugin 清单（gh api 实时抓取 README，980 行）：https://github.com/awesome-dsh-plugin/awesome-dsh-plugin
- PR #695 合并记录：https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/695 （2026-08-15 merged, "Add dsh-desktop-tauriapp — DSH desktop packaging skill"）
- dsh-market 插件市场：https://github.com/dsh-market/dsh-market ；npm `dshmarket@1.6.0`
- DSH 本体：`@deepseek-ai/dsh@0.1.0-rc.6`，`dsh plugin` 转发 pnpm（本机 `dsh plugin --profile web --help` 实测）
- 本机插件注册表：`~/.dsh/profiles/web/package.json`（bundles 含 `dsh-vision-router@^1.2.0`、`dsh-desktop-tauriapp`）
- 桌面壳源码：`desktop/src-tauri/src/lib.rs`（通知桥/角标/托盘/品牌注入），插件侧 `index.js` + `cordis.patch.yml`
- npm 核对：`dsh-vision-router@1.2.3`、`dsh-prometheus@0.1.0`、`dsh-usage-stats@0.1.15`、`agent-browser@0.34.0`、`dsh-desktop-tauriapp@0.3.0`
