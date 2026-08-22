# 研究：dsh-better-sidebar 0.14.0 → 0.15.0 契约差异（第三方编辑器插件决策支撑）

> 权威来源：npm registry 实拉 tarball（`npm pack dsh-better-sidebar@0.14.0` / `@0.15.0`），解包后逐文件 diff。所有签名照抄自 `.d.ts` / `src/*.ts(x)` 原文。检索时间：2026-08-22。
> 对象：我们要做基于 dsh-better-sidebar 的第三方编辑器插件（注册 FileViewer / Tab），需要确认 0.15.0 是否改了扩展契约，以决定原型基线。

---

## npm 发布形态对比

| 项 | 0.14.0 | 0.15.0 |
|---|---|---|
| 发布时间 | 2026-08-19T18:11:22Z | 2026-08-21T15:23:05Z（间隔约 2 天） |
| dist-tags | latest=0.15.0（发布时点即最新） | latest=0.15.0，beta=0.12.0-beta.1 |
| fileCount | 183 | 206 |
| unpackedSize | 11,370,485 B | 11,886,276 B |
| `type` / `main` / `types` | module / lib/index.js / lib/types/index.d.ts | 同左 |
| engines | node >=20 | 同左 |

- **dependencies：完全未变**（同一组：ws、clsx、rxjs、mermaid、node-pty、schemastery、全部 @codemirror/*、@lezer/highlight）。
- **exports 7 个 key：完全未变**（`.`, `./invariant`, `./client`, `./client/service`, `./client/api`, `./src/*`, `./package.json`；两版 key 集合逐项相等）。
- **files 数组：逐项未变**（lib 6 个 js + `lib/types/**/*.d.ts` + `src` + scripts + cordis.patch.yml + README/README_EN/LICENSE）。
- **无 docs/、无 AGENTS.md、无 CHANGELOG 随包发布**（两版皆如此；README 引用的 `docs/external-plugin-guide.md` 仍是仓库文档，不入包）。
- **peerDependencies：仅新增 1 项** `@deepseek-ai/dsh-subagent: ^0.1.0-rc.8`；其余 16 项及版本范围与 0.14 完全一致（`react ^18.2.0`、`react-dom ^18.2.0`、`cordis ^4.0.0-rc.8`（optional meta）、`@deepseek-ai/cordis ^4.0.1`、各 `@deepseek-ai/dsh-* ^0.1.0-rc.8`）。peerDependenciesMeta 两版相同（仅 cordis optional）。
- **devDependencies：0.15 全部 `@deepseek-ai/*` 从 `0.1.0-rc.8` → `0.1.1-rc.1`**，并新增 `@deepseek-ai/dsh-subagent: 0.1.1-rc.1`。注意：README 声称 CI 验证基线为 `0.1.1-rc.2`（lockfile 零 rc.8 残留），但**包内 package.json 的 devDependencies 实际钉的是 `0.1.1-rc.1`**——README 与包内容不一致，以包内为准。

---

## 0.15.0 契约 delta（第三方扩展契约部分）

**结论先行：FileViewer / Tab 扩展契约零破坏。** 与注册、描述符、服务面相关的类型文件全部逐字节相同。

### service.d.ts（`lib/types/client/service.d.ts`）

唯一差异（全文件 11 行 diff）：

```diff
-export declare const SIDEBAR_SERVICE_VERSION = "0.14.0";
+export declare const SIDEBAR_SERVICE_VERSION = "0.15.0";
```

- `BetterSidebarService` 接口：**未变化**。完整签名（0.15，与 0.14 相同）：
  ```ts
  export interface BetterSidebarService {
      registerTab(descriptor: TabDescriptor): () => void;
      registerFileViewer(descriptor: FileViewerDescriptor): () => void;
      getTabs(): readonly TabDescriptor[];
      getFileViewers(): readonly FileViewerDescriptor[];
      getTab(id: string): TabDescriptor | undefined;
      isTabEnabled(id: string): boolean;
      isViewerEnabled(id: string): boolean;
      matchFileViewer(path: string, head?: Uint8Array): FileViewerDescriptor | undefined;
      openTab(seed: OpenTabSeed, scope?: SessionScope): void;
      closeTab(tabId: string, scope?: SessionScope): void;
      subscribe(listener: () => void): () => void;
      readonly version: string;
      readonly features: readonly string[];
      getSnapshot(): SidebarSnapshot;
      subscribeState(listener: () => void): () => void;
      updateTab(tabId: string, patch: { title?: string; path?: string; meta?: unknown }): void;
      activateTab(tabId: string, scope?: SessionScope): void;
      openFile(scope: SessionScope, path: string, title?: string): void;
  }
  ```
- `TabDescriptor`：**未变化**。字段全集（0.15 照抄）：`id`、`title: string | (() => string)`、`icon?`、`order?`、`hidden?`、`available?`、`single?`、`dedupeKey?`、`createTab?`、`urlTarget?`（v0.13.0+）、`settings?`、`badge?`（v0.12.0+）、`onOpen?` / `onActivate?` / `onClose?`（v0.12.0+）、`component: (props: TabComponentProps) => ReactNode`。
- `FileViewerDescriptor`：**未变化**。字段全集：`id`、`title`、`exts`、`fetchStrategy: FileFetchStrategy`（`'none' | 'fsRead' | 'mediaUrl' | 'custom' | 'binary-download'`）、`detect?`、`load?`、`settings?`、`component: (props: FileViewerProps) => ReactNode`。`FileViewerProps` / `OpenTabSeed` / `FileFetchStrategy` / `EditorToolbarState` / `EditorToolbarControls` 均未变。
- `SIDEBAR_FEATURES` 能力数组：**未变化**（10 项，运行时与 .d.ts 双向确认）：
  ```ts
  export declare const SIDEBAR_FEATURES: readonly ["badge", "tabLifecycle", "updateTab", "openFile", "targetedOpen", "stateSubscription", "tabMeta", "pluginSettings", "urlTarget", "settingSelect"];
  ```

### plugins-tabs.d.ts / plugins-viewers.d.ts / plugins-shared.d.ts

**三文件逐字节相同（未变化）。** 说明：这三个文件是「推荐插件目录」（`PluginEntry` 形态 + 两个 catalog 常量），`TabDescriptor` / `FileViewerDescriptor` 的真正定义在 `service.d.ts`（139 行 / 269 行），不在 plugins-*.d.ts 里——若此前以为它们在 plugins-*.d.ts，需修正认知。

### context-types.d.ts（有新增，全部 additive，皆为 Side Chat 功能服务面）

- `SidebarAgentsService` 新增两个**可选**成员（旧代码不受影响）：
  ```ts
  create?(options: unknown): Promise<{ agent: SidebarAgent; dispose(): Promise<void> }>;
  resume?(options: unknown): Promise<{ agent: SidebarAgent; dispose(): Promise<void> }>;
  ```
- 新增接口（0.15 独有）：`SidebarSubagentsService`（`listDescendants(rootSessionId, signal?)`）、`SidebarSubagentDescendantEntry`、`SidebarAgentPresetsService`、`SidebarSessionTitleService`、`SidebarSessionPersistenceService`、`SidebarSessionHistoryRpc`。
- `SidebarConnectionHandle.api` 新增 `sessions: SidebarSessionHistoryRpc`。
- `SidebarSessionsService` 新增两个**可选**成员：
  ```ts
  fork?(opts: { sessionId: string; atSeq?: number; increaseTitle?: boolean }): Promise<string>;
  binding?(id: string): { session: { rename(title: string): Promise<unknown> } } | undefined;
  ```
- `SidebarContext`（`declare module 'cordis'` / `@deepseek-ai/cordis`）新增可选服务面：`subagents` / `agentPresets` / `sessionTitle` / `sessionPersistence`（注释均标注 optional，缺省部署降级）。

### 其余 .d.ts 变更（不涉及 FileViewer/Tab 扩展契约，列出以免遗漏）

- `client/state.d.ts`、`client/index.d.ts`、`types/index.d.ts`、`client/builtins/{index,tabs,viewers}.d.ts`：**逐字节相同**。
- `client/api.d.ts`：新增 `SubagentLiveResult`、`uploadFile`、`subagentsLive`、`sidechatStart/Prompt/Cancel/Dispose/Info` 等 wire 方法。
- `config.d.ts`：`SidebarConfig` / `ResolvedSidebarConfig` 各新增字段 `uploadLimit?: number`。
- `prefs-shared.d.ts`：`SidebarPrefs` 新增 `titleBarScheme: TitleBarScheme`（`'auto'|'web'|'preset'|'custom'`）、`titleBarPresetId: string`、`customCss: string`；`titleBarCompat` / `titleBarStripPx` 标注为 **LEGACY 迁移保留**。新增 `TITLE_BAR_SCHEMES` 常量。
- `wire.d.ts`：`SidebarErrorCode` 新增 `'too-large' | 'sidechat-error' | 'subagents-unavailable'`。
- `client/desktop-env.d.ts`：`DesktopEnv` 字段**替换**：`win32OverlayTop: number` → `titlebarInset: number`（桌面兼容四选项重构，#284）。
- `client/FileTree.d.ts`：`FileTree` props 新增 `onUploadRequest` / `busy`。
- `subagent-activity.d.ts`：**从 `lib/types/client/` 移至 `lib/types/`**（顶层），`lastActivity` 签名由 `SidebarHistoryEntry[]` 改为 `readonly SidebarSessionEvent[]`（新增可选 `maxMessages` 参数）。
- 新增文件：`client/{SideChatView,UploadOverlay,shell-presets,sidechat-transcript,titlebar-strip,upload,wco}.d.ts`，`types/{fs-operations,sidechat-core,sidechat-routes,subagent-live-route}.d.ts`。
- 删除文件（仅移动）：`client/subagent-activity.d.ts`（见上）。

### 运行时 bundle 表面（lib/*.js）

- `SIDEBAR_SERVICE_VERSION = "0.14.0"` → `"0.15.0"`（client.js 与 client-registry.js 两处同步）。
- `SIDEBAR_FEATURES` 运行时数组：**10 项与 .d.ts 完全一致（未变）**。
- `.registerFileViewer` / `registerTab` / `openTab` / `closeTab` / `updateTab` / `activateTab` / `openFile` / `getSnapshot` / `subscribeState`：两版同名同现，注册/打开链路 API 名未变。

---

## 挂载与守卫（双挂载守卫）

- **`cordis.patch.yml`：字节级相同**（两版 md5 均为 `b20cf6b67ecf876d2c812adc971daccf`）。防聚合包双挂载的退让逻辑（单条 `- insert: { id: better-sidebar, ... disabled: !!js "[...ctx.loader.entries()].some(...)" }`）**未变化**。
- **`src/client/index.tsx`：字节级相同**（客户端挂载自检 `mounted`/`disposed` 守卫逻辑未变；`dsh.client.inject` 清单未变）。
- host 侧 `src/index.ts` 有 diff（新增 `/sidebar/upload` 路由、`subagents.live`、`sidechat.*` 路由），属功能新增，不涉及扩展契约与守卫。

---

## 依赖与打包影响（对第三方插件）

- 我们（第三方编辑器插件）若只依赖 `ctx.betterSidebar` 的 registerTab / registerFileViewer：**0.15 无任何破坏**；peer 下限保持 `^0.1.0-rc.8`，README 明确「rc.8 用户无需升级 DSH」。
- 新增 peer `@deepseek-ai/dsh-subagent ^0.1.0-rc.8`：npm 7+ 会自动解析安装；**只有当我们要消费 `ctx.subagents`（SidebarSubagentsService）或 Side Chat 相关能力时才需要显式依赖它**。注册 FileViewer/Tab 不需要。
- 我们插件自身的 peerDependencies 若钉 `dsh-better-sidebar@^0.14.0`，会解析到 0.15.0（latest），契约兼容，可直接放宽到 `^0.14.0 || ^0.15.0` 或直接 `^0.15.0`。
- 打包影响：包内无 docs/ 与 AGENTS.md 随包发布（两版相同），接入文档仍只能看 GitHub 仓库。

---

## README 用户可见变更（0.14 → 0.15，即 0.15 changelog）

**新功能**
- 💬 **侧边对话 Side Chat（beta）Tab**（[#286](https://github.com/omdsh-dev/DSH-better-sidebar/pull/286)）：Codex 风格侧边线程，每对话一个独立 Tab；子会话继承主会话完整上下文（含进行中回合，以 interrupted 冻结标记）；同组合复用前缀输入缓存；重启后冷恢复；一键「保存为新会话」提升为顶层会话。
- 📤 **文件窗口上传**（[#239](https://github.com/omdsh-dev/DSH-better-sidebar/pull/239)）：上传文件/文件夹按钮 + 拖放上传；全屏进度弹层；413 本地化、`relativePath` 安全加固。
- 🧩 **桌面兼容四选项**（[#284](https://github.com/omdsh-dev/DSH-better-sidebar/pull/284)）：位置兼容模式改为主行下拉——自动检测（WCO 几何）/ DSH 官方 Web / 壳兼容方案（内置 preset，仅收录 100+ star 的壳）/ 自定义 CSS；旧配置自动迁移到自定义方案。
- 🎛️ **设置页 UI/UX 现代化**（[#300](https://github.com/omdsh-dev/DSH-better-sidebar/pull/300)）：二级设置改为卡片底部「功能设置」条；双色启用态；颜色仍为 `--dsw-alias-*` 令牌派生。
- ➕ **推荐插件目录新增**：`dsh-docs-panel`、`dsh-flowglass`、`dsh-git-forge`、`dsh-ssh-tunnel`、`dsh-turn-review`（src/client/plugins-tabs.ts 新增 5 个条目；注意此处为**目录数据**，配合同版本 `src/client/builtins/tabs.tsx` 新增内置 `sidechat` tab）。

**修复**
- ⚡ 子代理页实时预览批量接口 `subagents.live`（#298，O(N²)→O(N)）。
- 🖱️ 拖拽中断 / 快速释放不再回滚（#249）。
- 📐 推挤变量挂载期持续有效（#259）。
- 🔧 适配 DSH 0.1.1-rc.1 / rc.2（#297 #305）：逐包比对 DOM 槽位 / CSS 令牌 / boot 协议 / MarkdownText `codeLabels` / webServer 路由，零破坏，无代码逻辑改动；peer 下限保持 `^0.1.0-rc.8`。
- 🔒 上传链路安全加固（#239）。

**计数口径备注（如实记录，不臆测）**：README「核心理念」行两版均为「内置的 7 tab + 6 viewer」（未变化），而 0.14 的 `src/client/builtins/tabs.tsx` 注释为「6 built-in tab descriptors」（editor/git/subagent/terminal/browser/diff），0.15 为「7」（新增 sidechat）。即 README 的 7 在 0.14 时已与代码注释口径不一致（README 口径或含 explorer/文件窗口），两版 README 此行文本完全相同，diff 确认未变。内置 viewer 两版均为 6：image / pdf / markdown / html / code / binary-download（builtins/viewers.tsx 未变）。

---

## 结论（第三方编辑器插件决策）

1. **0.15.0 下注册 FileViewer / Tab 的写法与 0.14 完全一致**：
   ```ts
   import type {} from 'dsh-better-sidebar'   // 触发 ctx.betterSidebar 类型合并
   export const inject = ['betterSidebar']
   export function apply(ctx: Context) {
     ctx.effect(() => ctx.betterSidebar.registerFileViewer({ id, title, exts, fetchStrategy, component }))
   }
   ```
   `registerTab` / `registerFileViewer` 签名、`TabDescriptor` / `FileViewerDescriptor` 全字段、返回 disposer 语义、`SIDEBAR_FEATURES` 能力门控（10 项未变）、`declare module 'cordis'` 类型合并——全部未变。0.14 编写的插件代码可在 0.15 下原样工作。

2. **原型基线建议：直接用 0.15.0（latest）**。理由：扩展契约零破坏；peer 下限 `^0.1.0-rc.8` 意味着 DSH 环境 rc.8 或 0.1.1-rc.x 均可运行；0.15 新增内容（Side Chat、上传、桌面兼容、设置页）是内部功能，不影响我们的 FileViewer/Tab 面。唯一注意点：以 npm 实包 devDependencies（0.1.1-rc.1）为准，README 所述 rc.2 为仓库 HEAD 口径。

3. **可选防御性代码**：若插件需要做版本探测，用 `SIDEBAR_FEATURES`（未变）而非 `SIDEBAR_SERVICE_VERSION`（随版本号变化）；能力都在 features 列表内，0.15 未新增任何能力，无需新 gate。

4. 若后续要消费 0.15 新能力（Side Chat、`ctx.subagents`、上传 API），对应签名见上文「context-types.d.ts / api.d.ts delta」，全部为 additive 可选面，按 optional 处理即可。