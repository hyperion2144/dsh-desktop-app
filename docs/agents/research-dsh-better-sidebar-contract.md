# 研究：dsh-better-sidebar 0.14.0 扩展契约（自研 Monaco 右栏插件决策支撑）

> 权威来源：本机已装包 `/Users/mutou/.dsh/profiles/web/node_modules/dsh-better-sidebar/`（v0.14.0）。
> 检索时间：2026-08-22。所有签名照抄自 `.d.ts` / `src/*.ts(x)` 原文，行号以本机包文件为准。
> 注意：README 指向的 `docs/external-plugin-guide.md` 与 `AGENTS.md` **未随 npm 包发布**（package.json `files` 不含 docs/；本机包内无此文件），是 GitHub 仓库文档 —— 本报告以包内 README 的相关章节代替。

## npm 发布形态

- `npm view dsh-better-sidebar`：`version = '0.15.0'`，`dist-tags = { beta: '0.12.0-beta.1', latest: '0.15.0' }`，registry = `https://registry.npmjs.org/`，`license = 'MIT'`，`publishConfig.access = 'public'`。
- 本机已装 0.14.0（npm latest 已是 0.15.0，本地略旧）。

## 1. 服务接入方式

- 服务按 **inject 声明**接入（非可选读取）。服务本身说明（`lib/types/client/service.d.ts:1-21`）：「The service is published to the cordis context as `ctx.betterSidebar` … consumers declare it in `inject` and call `registerTab` / `registerFileViewer`, both returning a disposer that cordis auto-invokes on fiber disposal (HMR-safe).」
- 类型合并：`context-types.d.ts:396-466` 声明 `declare module 'cordis' { interface Context { betterSidebar: BetterSidebarService; … } }`，同时给 `@deepseek-ai/cordis` 也加了同名字段（`context-types.d.ts:462-466`）。
- 服务由 client 半区发布（`src/client/index.tsx:69-70`）：`const service = createBetterSidebarService(sidebarStore); ctx.provide('betterSidebar', service)`，「Published before the panel mounts so consumers injecting 'betterSidebar' are ready by the time the sidebar renders.」
- README 官方最小示例（`README.md:196-204`，照抄）：
  ```ts
  import type {} from 'dsh-better-sidebar'  // 触发 ctx.betterSidebar 类型合并
  export const inject = ['betterSidebar']
  export function apply(ctx: Context) {
    ctx.effect(() => ctx.betterSidebar.registerTab({
      id: 'my-plugin:db', title: 'Database', component: ({ scope }) => <DbView sessionId={scope.sessionId} />,
    }))
  }
  ```
- 注册返回 disposer（`() => void`），官方示例包在 `ctx.effect` 里，disposal 自动注销（HMR 安全）。

## 2. tab 描述符能力（`lib/types/client/service.d.ts`）

完整签名（照抄）：

```ts
export interface TabDescriptor {
    id: string;
    title: string | (() => string);
    icon?: ReactNode | ((size: number) => ReactNode);
    order?: number;                 // + 菜单排序，升序；默认 100
    hidden?: boolean;               // 从 + 菜单隐藏（editor 由文件打开触发）
    available?: (ctx: Context, scope: SessionScope, state: SidebarState) => boolean;  // + 菜单禁用谓词
    single?: boolean;               // 单实例糖：等价 dedupeKey: () => id
    dedupeKey?: (tab: SidebarTab) => string | undefined;  // undefined = 不去重，总是新开
    createTab?: (state: SidebarState) => { tab: SidebarTab; patch?: Partial<SidebarState> } | null;  // 自定义铸 tab；null 拒绝创建
    urlTarget?: (url: URL) => boolean;  // v0.13.0+ 外链接管认领
    settings?: SidebarSettingsDeclaration;
    badge?: (ctx: Context, scope: SessionScope, state: SidebarState) => string | number | null | undefined;  // v0.12.0+
    onOpen?: (tab: SidebarTab, scope: SessionScope) => void;     // v0.12.0+ 服务路径新开
    onActivate?: (tab: SidebarTab, scope: SessionScope) => void; // v0.12.0+ 聚焦（dedupe 聚焦/激活）
    onClose?: (tab: SidebarTab, scope: SessionScope) => void;    // v0.12.0+ closeTab 关闭
    component: (props: TabComponentProps) => ReactNode;
}
```

`SidebarTab`（`lib/types/client/state.d.ts:35-45`）：`id: string; type: TabType; title: string; path?; diff?; meta?: unknown`（meta 必须 JSON 可序列化，随布局持久化，v0.12.0+）。

任意 ReactNode 渲染入口 = `component: (props: TabComponentProps) => ReactNode`，props 为（`service.d.ts:122-137`）：
```ts
export interface TabComponentProps {
    ctx: Context;
    store: SidebarStore;
    scope: SessionScope;             // { sessionId: string; cwd?: string }
    tab: SidebarTab;
    visible: boolean;                // 激活且面板打开时 true，否则暂停渲染
    expanded?: string[];
    onToggleDir?: (path: string) => void;
    onReferenceFile?: (path: string) => void;
    onOpenFile?: (path: string) => void;
    onOpenDiff?: (tab: SidebarTab) => void;
    onSubagentJump?: (childSessionId: string) => void;
}
```

声明式设置三件套（`service.d.ts:96-121`）：
- `toggles?: readonly SidebarSettingToggle[]` —— 键必须命中宿主 PrefsSchema 字段（内置：'autoOpenSubagent'、'agentTerminalTools'、'terminalFontFamily' 等）；未知键被设置缝丢弃。
- `pluginToggles?: readonly SidebarSettingToggle[]` —— v0.12.0+ 插件自有设置行（switch/text/number），键是插件局部的，持久化在 `pluginSettings[<descriptor id>]`，**无需宿主 PrefsSchema 字段**。
- `render?: (props: SidebarSettingsRenderProps) => ReactNode` —— v0.12.0+ 自定义设置面板，替代行列表。props 含 `store / service / prefs / pluginSettings / updatePluginSetting(key, value) / close()`（`service.d.ts:85-95`）。
- `SidebarSettingToggle` 控制类型：`'switch' | 'text' | 'number' | 'select'`（`service.d.ts:37`），select 支持 `options` + `multi`（v0.13.0+ 能力 `settingSelect`）。

## 3. 与内置编辑器/文件树的关系

- 内置 tab/viewer **也走同一服务注册**（dogfooding）：`src/client/builtins/index.ts:20-37` `registerBuiltins` 循环 `service.registerTab(tab)` / `service.registerFileViewer(viewer)`。
- 内置 tab 共 **6 个**（代码事实，`src/client/builtins/tabs.tsx:76-283`）：`editor` / `git` / `subagent` / `terminal` / `browser` / `diff`（注释原文「The 6 built-in tab descriptors」）。
- README 声称「7 tab + 6 viewer」（`README.md:35,194`；`README_EN.md:35,225`）——**作者意图 vs 代码事实差异**：`explorer` 曾是独立 tab，后并入 `editor`（状态迁移 `src/client/state.ts:912-922`：「The standalone explorer tab type merged INTO the editor (the single files window): a persisted explorer tab reopens as an editor home tab」；README `#151` 改动条目「文件窗口与资源管理器二合一」）。即 README 的「7」是按历史口径数（含 explorer），当前代码注册 6 个 tab 描述符。
- 内置 viewer 共 **6 个**（`src/client/builtins/viewers.tsx:48-125`）：`image`（exts png/jpg/jpeg/gif/webp/svg/bmp/ico/avif，mediaUrl）、`pdf`（exts ['pdf']，mediaUrl）、`markdown`（exts md/markdown，fsRead）、`html`（exts html/htm，fsRead）、`code`（**exts: [] 兜底，priority -100**，fsRead，CodeMirror 文本编辑器 TextEditor）、`binary-download`（exts doc/xls/ppt，priority -50，detect NUL 探测，binary-download）。
- **匹配机制**（`service.d.ts:18-21, 332-335`）：`matchFileViewer(path, head?)` 按 priority 降序、稳定序遍历；每个描述符先试 `detect`（给 head 字节时），再试 `exts`；`exts: []` 是全匹配 catch-all；禁用 viewer 跳过、落到下一个。注册序在 `builtins/viewers.tsx` 优先于外部？——不：priority 决定；内置均 0（code 是 -100），第三方注册时给更高 priority（如 100）即可按扩展名认领 `.ts/.tsx` **在 editor tab 内部**替换 CodeMirror。
- **FileViewerProps**（`service.d.ts:227-252`）给什么：`ctx / store / scope / path / title / viewerId / content?（fsRead 时）/ truncated? / mediaUrl? / customData?（custom load 时）/ toolbar?: 'self' | 'host' / onToolbarState? / onToolbarControls?`。editor tab 渲染 viewer 时强制 `toolbar: 'host'` + 两个回调（`EditorHost.tsx:335-346`），即 Monaco viewer 可以直接挂进宿主工具栏（dirty/save/mode 上报与命令回传）。
- FileTree / 资源管理器归属：**better-sidebar 内置**（不是外部 fs 插件）。`FileTree.tsx` 是包内 client 组件，数据来自宿主 `/sidebar/api/<method>` 路由（fs.tree/fs.search/fs.read/fs.write，见 `api.ts:133-144`），由 `EditorHost`（editor tab）经 `TreePanel` 渲染（`EditorHost.tsx:260-279, 348-371`）。第三方编辑器插件**不需要自带文件树**：若注册为 FileViewer，直接在既有 editor tab 内替换渲染器；若注册为独立 tab，则要自己实现 UI（props 里有 `onOpenFile`/`expanded`/`onToggleDir` 可接到宿主 explorer 状态，但 tab 本体 UI 自建）。

## 4. 设置接入

- 「侧边卡片」设置区注册路径（`src/client/index.tsx:354-365`）：DSH Settings shell 的 `settings.section` 槽位。
  ```ts
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'better-sidebar',
    order: 100,
    label: () => t('settingsNav'),
    inject: () => ({ store: sidebarStore, service }),
  }, SideCardSection))
  ```
- 预读取路径：宿主注册设置命名空间 + fenced 设置路由。`src/index.ts:521-529`「Register the namespace with the settings provider … the client reaches this namespace through the plugin's own fenced routes below ('settings.get'/'settings.update')」；`src/config.ts:114-145` `PrefsSchema`（schemastery，含 `tabsEnabled/viewersEnabled` 开放 map、`pluginSettings` 开放嵌套 map）——注释（`config.ts:140-144`）：「This is the 'settings seam' opening — without it the seam would drop third-party keys as unknown schema fields.」；client 经 `api.settingsGet/settingsUpdate`（`prefs.ts:1-9,139-147`）。
- **第三方插件能贡献自己的设置区吗**：能。两种途径：
  1. 在自身的 tab/viewer 描述符里声明 `settings.pluginToggles` / `settings.render` —— 自动出现在「侧边卡片」设置页该卡片的齿轮里，键持久化到 `pluginSettings[id]`，不需要改 Host PrefsSchema（但有 `SidebarPrefs` 命名空间 `'dsh-better-sidebar'`，`prefs-shared.ts:10`）。
  2. 也可以像该插件一样注册 DSH 全局 `settings.section` 槽位（`ctx.slots.register`），但那属于 DSH settings shell 的通用机制，非 better-sidebar 专属。

## 5. 许可与分发

- `LICENSE`：**MIT Copyright (c) 2026 dsh-external**。要求（LICENSE:12-13）：「The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.」——即分发（含自研插件若附带/改造其代码）须保留版权声明与许可文本。
- npm 已发布：`latest 0.15.0`（本机 0.14.0 为较旧安装），registry `https://registry.npmjs.org/`，tarball `https://registry.npmjs.org/dsh-better-sidebar/-/dsh-better-sidebar-0.15.0.tgz`。
- 挂载方式：`cordis.patch.yml` 是 `dsh.bundle.patch` 层（package.json:42-45），官方安装命令 `dsh plugin --profile <name> add dsh-better-sidebar@<version>`；补丁单条 `- insert: { id: better-sidebar, name: 'dsh-better-sidebar', disabled: !!js "[...ctx.loader.entries()].some(...)" }`（防聚合包双挂载退让）。

## 6. 结论（自研 Monaco 编辑器插件推荐路径）

**推荐：注册 FileViewer（不注册独立 tab）**，让 Monaco 在既有 editor tab 内部按扩展名认领文件：

- `id: 'my-plugin:monaco'`（唯一，命名空间化）；
- `exts: ['ts','tsx','js','jsx','json','css','html', …]`；`priority: 100`（内置 viewer 均 0、code 兜底 -100，priority 高者先匹配）；
- `fetchStrategy: 'fsRead'` → 组件拿 `content` prop，直接喂 Monaco；
- 组件实现 `FileViewerProps` 渲染 Monaco，如需保存/脏标记挂 `toolbar: 'host'` + `onToolbarState`/`onToolbarControls`，或自绘 `toolbar: 'self'`；
- 文件树、路径输入、新开 tab 全部复用内置 editor tab —— 不需要自带文件树。

**备选：注册独立 tab**（若要有自己完整编辑器工作台）：`registerTab` + `createTab`/`dedupeKey` 控制实例化与去重；tab UI 完全自定义（props 仅给 ctx/store/scope/tab/visible + explorer 回调）。

**必须遵守的契约点**：
1. client 插件 `inject: ['betterSidebar']` + `import type {} from 'dsh-better-sidebar'`（类型合并）。
2. 注册包在 `ctx.effect` 内（返回 disposer，HMR 安全注销）。
3. `id` 全局唯一（tab/viewer 均是开放集合，`type` 任意字符串，未注册类型 tab 渲染 OrphanedTab，见 `state.ts:904-910`）。
4. `exts` 小写无点；`[]` = 全匹配兜底；priority 高者赢；禁用 viewer 落到下一匹配。
5. `meta`/`pluginSettings` 值必须 JSON 可序列化（持久化契约）。
6. 能力探测：`service.features` 单调清单（`SIDEBAR_FEATURES`：'badge' | 'tabLifecycle' | 'updateTab' | 'openFile' | 'targetedOpen' | 'stateSubscription' | 'tabMeta' | 'pluginSettings' | 'urlTarget' | 'settingSelect'，`service.d.ts:434`），新 API 按成员门控。
7. 若走独立 tab + `urlTarget`，注意「首个注册认领、注册序优先；内置 browser 不声明 urlTarget 故永不被遮蔽」（`service.d.ts:178-193`）。
8. 分发：MIT 保留版权声明；切 `latest` 到 0.15.0 前先对齐 0.14→0.15 变更（本机 0.14.0 未含 0.15 内容）。