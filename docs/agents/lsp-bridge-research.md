# dsh 生态「LSP 桥」事实调查报告（Monaco ↔ LSP）

> 调查时间：本次会话；调查者：研究子代理。结论统一标注「已确认」（直接引自官方文档/源码/npm registry）或「未确认」（需进一步验证）。
> 专用名词保留原文。全部版本号来自 npm registry 实时查询（2026 会话时点）。

## 1 monaco-languageclient 现状

### 1.1 版本与维护状态（已确认）

- npm 最新稳定版 **monaco-languageclient 10.7.0**；官方兼容表标注 10.7.0 发布于 2026-02-04，配套 monaco-editor 0.55.1、vscode 1.108.2、monaco-vscode-api 25.1.2、vscode-ws-jsonrpc 3.5.0。仓库有未发布的 11.0.0-next.2（对应 monaco-editor 0.56.0）。
  - 来源：npm registry（`npm view monaco-languageclient`）；兼容表 https://github.com/TypeFox/monaco-languageclient/blob/main/docs/versions-and-history.md
- 维护活跃：TypeFox 主导 + 社区维护，仓库默认分支 main，v10.0.0（2025-09）仍在大改（见 1.3）。
  - 来源：https://github.com/TypeFox/monaco-languageclient

### 1.2 与 monaco-editor 的兼容矩阵（0.5x 时代，已确认，来源同上兼容表）

| monaco-editor | monaco-languageclient（建议） | 配套 |
| --- | --- | --- |
| 0.55.1 | 10.4.0 – 10.7.0 | monaco-vscode-api 23.2.2 – 25.1.2，vscode-ws-jsonrpc 3.5.0 |
| 0.54.0 | 10.2.0 – 10.3.0 | vscode-api 22.1.0 / 23.0.0 |
| 0.53.0 | 10.0.0 – 10.1.0 | vscode-api 21.1.0 – 21.3.2 |
| 0.52.2 | **9.0.0 – 9.11.0** | vscode-ws-jsonrpc 3.4.0/3.5.0，monaco-editor-wrapper 6.x（9.11 配套 wrapper 6.12.0） |
| 0.51.0 | 8.8.3 | vscode-api 8.0.4 |
| 0.50.0 | 8.8.0 – 8.8.2 | vscode-api 8.0.x |

要点：monaco-editor 0.52.2 是 9.x 线的甜点位；若要 0.55/0.56 则必须走 10.x（且不再有 monaco-editor-wrapper，见 1.3）。

### 1.3 重要架构事实（已确认）

- **纯 ESM**：v4.0.0（2022-09）起所有代码转为 ESM，npm 包 `type: module`，不再提供 CJS bundle。10.7.0 的 `exports` 提供子路径：`./editorApp`、`./lcwrapper`、`./vscodeApiWrapper`、`./workerFactory`、`./common`、`./fs`、`./debugger`。
  - 来源：兼容表文档（「All code has been transformed to esm … cjs bundles are no longer available」）；npm `exports` 字段。
- **v10 起 wrapper 并入主包**：10.0.0 删除了独立包 monaco-editor-wrapper，其功能移回 monaco-languageclient 子导出；v9/v6 的 `MonacoEditorLanguageClientWrapper` 单配置对象拆成三步：`MonacoVscodeApiWrapper.start()`（全局一次）→ `LanguageClientWrapper.start()` → `EditorApp.start()`。
  - 来源：https://github.com/TypeFox/monaco-languageclient/blob/main/docs/migration.md
- **两种模式**（官方推荐 Extended）：
  - Extended Mode：基于 `@codingame/monaco-vscode-api`，得 VSCode 式服务/扩展能力；默认 `configureDefaultWorkerFactory`。
  - Classic Mode：独立 monaco-editor + 语言特性，更轻，但功能少。
  - 来源：https://github.com/TypeFox/monaco-languageclient/blob/main/docs/introduction.md
- **浏览器侧标准连接姿势（WebSocket）**：
  - 依赖包：`monaco-languageclient` + `vscode-ws-jsonrpc` + monaco-editor（经 `@codingame/monaco-vscode-editor-api` 别名），以及一整套 `@codingame/monaco-vscode-*` 扩展/override 包（如 `@codingame/monaco-vscode-json-default-extension`）。官方 Getting Started 明确要求版本对齐（v10.4.x ↔ @codingame 23）。
  - LanguageClientConfig 里 `connection.options.$type: 'WebSocketUrl'`（给 url `ws://localhost:30000/sampleServer`）或 `'WebSocketDirect'`（自建 WebSocket）。底层走 `vscode-ws-jsonrpc` 的 `WebSocketMessageReader/Writer`。
  - 来源：https://github.com/TypeFox/monaco-languageclient/blob/main/docs/guides/getting-started.md ；示例源码 packages/examples/src/common/client/extendedClient.ts

### 1.4 CDN / 无打包器 ESM 可行性（部分已确认、部分未确认）

- 已确认：monaco-languageclient 与 monaco-editor（0.56 的 `esm/vs/index.js` import 入口）都提供官方 ESM 产物；monaco-editor AMD 构建已标记 deprecated。
  - 来源：npm `exports`；https://github.com/microsoft/monaco-editor#readme（README：「inside /esm: ESM version … AMD support is deprecated」）
- 已确认：官方文档把 **「支持 ES modules 的 web bundler（Vite/Webpack 等）」列为前置条件**，worker 加载需按 bundler 单独配置（webpack 要预打包 worker，vite 要 import-meta-url 插件）；npm 安装还要求 `overrides/resolutions` 把 monaco-editor 别名到 `@codingame/monaco-vscode-editor-api`。即官方支持的路径是打包器，不是裸 ESM <script>。
  - 来源：https://github.com/TypeFox/monaco-languageclient/blob/main/docs/installation.md ；https://github.com/TypeFox/monaco-languageclient/blob/main/docs/guides/troubleshooting.md
- 未确认：在 dsh client（无打包器、原生 ESM）里直接 import map + CDN 全链路可跑——理论上可行（纯 ESM 包 + jsDelivr/unpkg 分发的 monaco ESM），但 worker（editor/ts/textmate）与几十个 `@codingame/monaco-vscode-*` 依赖的装配没人验证过，且 monaco 官方明确提示跨域 worker 需 CORS。
- 实践提示（本仓库语境，已确认）：dsh-desktop-tauriapp 的 client 半区本来就是 esbuild 打包成单一 `lib/client.js`（package.json `build:client` + AGENTS.md 说明），所以最稳的做法是随 client 插件用 esbuild 把 monaco + monaco-languageclient 打进 bundle，而不是裸 ESM 直连。

## 2 LSP 服务器侧方案

### 2.1 typescript-language-server（已确认）

- npm 最新 **typescript-language-server 6.0.0**（bin: `lib/cli.mjs`；`type: module`；engines **node >=22.22.2**；rollup 打包自带全部运行依赖；文档安装示例为 `npm install -g typescript-language-server typescript@6`）。
  - 来源：npm registry；https://www.npmjs.com/package/typescript-language-server ；unpkg 包内 package.json
- **启动参数（已确认，读源码 src/cli.ts）**：当前（master=6.0.0，且 v5.3.0、v4.3.3 一致）CLI 只有：
  - `--stdio`（required option，「use stdio」）
  - `--log-level <logLevel>`（1-4）
  - `-V/--version`、`-h/--help`
  - **不存在 `--socket / --host / --port / --node-ipc`**（至少在 v4.3.3 / v5.3.0 / v6.0.0 三处源码均无）。如需网络传输，得由外部桥（2.2）做 stdio↔ws 或 stdio↔socket 转发。
  - 来源：https://github.com/typescript-language-server/typescript-language-server/blob/master/src/cli.ts （v5.3.0、v4.3.3 同路径可对照）
- Node 侧 spawn 姿势：host 进程 `spawn('typescript-language-server', ['--stdio'])`，子进程 stdin/stdout 即 LSP 消息流。
  - 来源：同上 CLI（`createLspConnection(...).listen()` 走 stdio）

### 2.2 进程模型（vscode-languageserver/node，已确认）

- 语言服务器侧标准写法：`createConnection(..., ProposedFeatures.all)`（或 `_Connection`）+ `TextDocuments` + `listen()`；JSON server 示例即如此（`vscode-languageserver/node`）。
  - 来源：packages/examples/src/json/server/json-server.ts（https://github.com/TypeFox/monaco-languageclient/tree/main/packages/examples/src/json/server）
- npm 现状：vscode-languageserver 10.1.0、vscode-languageserver-protocol 3.18.2（monaco-languageclient 10.7.0 内部锁 `~3.17.5`，wire 兼容无碍，但类型版本需留意）。

### 2.3 stdio ↔ WebSocket 桥接方案（已确认 + 状态标注）

- **方案 A（推荐，官方同款）**：`vscode-ws-jsonrpc` 的 `server` 子路径（`createServerProcess` + `createStreamConnection` + `createWebSocketConnection` + `forward`）。官方 example-server 的完整桥：
  - `WebSocketServer`（ws 包，`noServer: true`）→ http server `upgrade` 事件里按 path 匹配（如 `/sampleServer`）→ `handleUpgrade` → 组装 `IWebSocket`（send/onMessage/onError/onClose/dispose）→ `createConnection(WebSocketMessageReader/Writer)` 得 socketConnection → `createServerProcess(name, 'node', [serverPath, '--stdio'])` 得 serverConnection → `forward(socketConnection, serverConnection, handler)` 双向转发；dispose 回调 `process.kill()`。
  - 即：**host 侧只需要 ws + vscode-ws-jsonrpc/server 两个包**，无需额外进程代理。
  - 来源：packages/vscode-ws-jsonrpc/src/server/index.ts（https://github.com/TypeFox/monaco-languageclient/blob/main/packages/vscode-ws-jsonrpc/src/server/index.ts）与 packages/examples/src/common/node/server-commons.ts（https://github.com/TypeFox/monaco-languageclient/blob/main/packages/examples/src/common/node/server-commons.ts）
- **方案 B（现成代理，已确认但维护度差）**：
  - `lsp-ws-connection@0.7.1`：浏览器侧「LSP 感知」wrapper，要求语言服务器已在 WebSocket 上；依赖锁死旧 `vscode-ws-jsonrpc ~1.0.2`，基本过时。来源：npm registry + https://github.com/krassowski/lsp-ws-connection
  - `jsonrpc-ws-proxy@0.0.5`：stdio↔WebSocket 转发代理，配置文件把 URL 路径（如 `/python`）映射到 spawn 命令（`node dist/server.js --port 3000 --languageServers servers.yml`）；npm last publish 2022-05-06，长期未更新。来源：npm registry + https://github.com/wylieconlon/jsonrpc-ws-proxy
- **方案 C（自写转发）**：vscode-ws-jsonrpc 已提供全部原语（StreamMessageReader/Writer + WebSocketMessageReader/Writer + forward），自写约等于把官方 server-commons.ts 抄 30-50 行，工程量很小。已确认（原语存在），实际取舍看是否想避开官方示例依赖。

### 2.4 monorepo / workspace 适配话题（部分已确认）

- 已知问题确凿存在：
  - Issue #495「Wrong tsconfig.json being used in monorepo」——monorepo 里 tsserver 选错 tsconfig（2022）。
  - Issue #313「typescript version is no longer resolved above the rootUri」——typescript 版本解析不再越过 rootUri 向上查找（workspace 场景）。
  - 来源：https://github.com/typescript-language-server/typescript-language-server/issues/495 、https://github.com/typescript-language-server/typescript-language-server/issues/313
- 未确认：6.0.0 的具体行为改进与推荐 monorepo 配置（workspaceFolders 支持、`initializationOptions.tsserver.path` 等），需要原型实测。

## 3 替代路径（简要对比）

- **浏览器内 WASM 跑 TS LSP（WebContainers 风格）**：一行结论——对 TypeScript **不可行/不划算**。tsserver 依赖 Node 的 fs/进程能力，无官方 WASM 版 LSP；monaco-languageclient 的 Web Worker 模式只对「纯 JS/WASM 语言服务器」（如 Langium）成立；tsserver 官方下一代是 native Go（TypeScript 7，typescript-go），不是 WASM。而 dsh host 本身就在 Node 进程里，原生 spawn tsserver 反而最省事。已确认（tsserver README + monaco-languageclient introduction.md 的 Worker 模式说明）。
- **直接复用 vscode-languageserver-protocol 手写桥**：工程量中等偏高——协议库只给 DTO/消息原语（vscode-jsonrpc），你还要自己实现 client 侧连接生命周期、取消/进度、动态能力注册、与 monaco 的适配层；这恰是 monaco-languageclient + vscode-languageclient 已解决的问题。除非做极其精简的定制，否则不划算。已确认（基于两库职责边界）。

## 4 风险清单

| 风险 | 内容 | 状态 |
| --- | --- | --- |
| 版本兼容 | monaco-languageclient / monaco-editor / @codingame/monaco-vscode-api 三者必须按官方矩阵对齐（如 10.x↔0.55.1）；npm 需 overrides/resolutions 别名 | 已确认（有官方矩阵） |
| 打包器与 worker | 官方要求 bundler + worker 配置（vite import-meta-url、webpack 预打包 worker）；跨域 worker 需 CORS | 已确认（官方文档）；dsh 具体装配未确认 |
| CSP | Monaco worker 需 `worker-src`（同源/blob），WebSocket 需 `connect-src ws://127.0.0.1:<port>`；对 dsh web 实例扫描其 lib bundle 未发现 CSP 头字符串，但响应头可能由服务端设置——**未确认，需实测** | 未确认 |
| WebSocket 端口暴露 | WebSocket 不受浏览器同源策略/CORS 约束，任何本地网页都可尝试连 `ws://127.0.0.1:PORT`；建议绑定 127.0.0.1 + 路径令牌/升级时校验 Origin；另注意本仓库已有 mobile lane/远端访问代理链路，勿让 LSP 端口被隧道暴露 | 推理（协议事实已确认） |
| 进程泄漏 | `createServerProcess` 的 dispose 只 `process.kill()` 直接子进程；tsserver 是 typescript-language-server 的子进程，杀父不一定连带，需确认清理链（kill 进程组或显式关闭） | 未确认（原语已确认） |
| dsh HMR 重载清理 | client 插件 HMR 重载会重跑模块：需模块级单例 + editor/LanguageClientWrapper dispose 纪律；host 侧 ws server 端口 EADDRINUSE、旧连接残留需随插件生命周期（ctx.effect/dispose）回收 | 未确认（取决于 dsh 插件生命周期实现，需按 cordis 生命周期验证） |

## 结论

**推荐技术栈（一句话）**：host 半区用 `ws` + `vscode-ws-jsonrpc/server` 起 WebSocket 桥（`createServerProcess` spawn `typescript-language-server --stdio` + `forward`），client 半区用 monaco-languageclient 10.x（Extended Mode，`$type: 'WebSocketUrl'` 直连 ws://127.0.0.1:<port>/<path>），monaco 与全部依赖随 dsh client 插件由 esbuild 打进单一 bundle（沿用本仓库 build-client 链路），版本按官方兼容矩阵对齐（目标 monaco-editor 0.52.2 ↔ mlc 9.x，或 0.55.1 ↔ mlc 10.7.0）。

**需要进一步验证的点（均未确认）**：
1. dsh web 实际 CSP 头（worker-src / connect-src）与 monaco worker 在同源页面下的装配方式。
2. dsh client 插件 HMR 重载时，模块单例、ws 端口复用与 host 侧子进程清理的完整生命周期。
3. typescript-language-server 6.0.0 对 monorepo（多 tsconfig/workspaceFolders）的实际行为与 `initializationOptions` 配置。
4. tsserver 子进程的级联清理（杀父不连带问题）与长时间运行的内存表现。

---

### 主要来源索引

- npm registry（本机 `npm view` 实时查询）：monaco-languageclient、monaco-editor、vscode-ws-jsonrpc、typescript-language-server、vscode-languageserver、vscode-languageserver-protocol、monaco-editor-wrapper、lsp-ws-connection、jsonrpc-ws-proxy
- https://github.com/TypeFox/monaco-languageclient/blob/main/docs/versions-and-history.md
- https://github.com/TypeFox/monaco-languageclient/blob/main/docs/introduction.md
- https://github.com/TypeFox/monaco-languageclient/blob/main/docs/installation.md
- https://github.com/TypeFox/monaco-languageclient/blob/main/docs/guides/getting-started.md
- https://github.com/TypeFox/monaco-languageclient/blob/main/docs/guides/troubleshooting.md
- https://github.com/TypeFox/monaco-languageclient/blob/main/docs/migration.md
- https://github.com/TypeFox/monaco-languageclient/blob/main/packages/vscode-ws-jsonrpc/src/server/index.ts
- https://github.com/TypeFox/monaco-languageclient/blob/main/packages/examples/src/common/node/server-commons.ts
- https://github.com/TypeFox/monaco-languageclient/blob/main/packages/examples/src/json/server/json-server.ts
- https://github.com/TypeFox/monaco-languageclient/blob/main/packages/examples/src/common/client/extendedClient.ts
- https://github.com/TypeFox/monaco-languageclient/blob/main/packages/examples/src/common/worker/classic-workers.ts
- https://github.com/typescript-language-server/typescript-language-server/blob/master/src/cli.ts
- https://github.com/typescript-language-server/typescript-language-server/blob/master/README.md
- https://github.com/microsoft/monaco-editor#readme
- https://github.com/krassowski/lsp-ws-connection
- https://github.com/wylieconlon/jsonrpc-ws-proxy
- https://github.com/typescript-language-server/typescript-language-server/issues/495
- https://github.com/typescript-language-server/typescript-language-server/issues/313