# 桌面壳增强设计：进程守护 · Profile 切换 · 远程 dsh · 本地端口设置

> 状态：设计稿。对应功能：托盘 + 侧边栏状态标识 + 远程/Profile/端口管理。
> 关联现状：桌面壳 spawn `dsh --profile web` + `--patch` 注入（0.5.7 起），单 web profile，
> 端口默认 3080（DSH_DESKTOP_PORT 可覆盖），托盘已有「显示/重启 dsh 服务/切换模式/退出」。

## 0. 目标

1. **守护**：侧边栏底部（settings 按钮旁）显示 dsh 进程状态标识；检测异常后自动回到启动页并拉起（与「重启」同一套流程）。
2. **Profile 切换**：托盘二级菜单扫描/切换已有 profile；支持二级菜单中「新增 Profile…」弹窗输入新建。
3. **远程 dsh**：托盘一级「**dsh 服务地址**」二级菜单：内置「本地」+ 已存远程列表 + 「新增地址…」弹窗；
   高级模式使用远程时要求远程已安装本插件（否则提示切兼容）。
4. **本地端口设置**：托盘「本地端口…」显示当前端口，点击弹窗输入新端口（默认 3080），随后按新端口重启。

## 1. 状态模型与持久化

### 1.1 DshState 扩展

- status: AtomicU8 —— Idle | Starting | Ready | External | Restarting | Stale | Down | Remote
- active_profile: RwLock<String>（默认 "web"）
- port: AtomicU16（默认 3080，现值来自 app_port()）
- remote_addr: RwLock<Option<String>>（None=本地；Some("host:port")=远程）
- internal_hosts: RwLock<Vec<String>>（导航守卫运行时放行清单=本地默认 ∪ 远程 host）

### 1.2 持久化文件（$DSH_HOME/settings.yaml（顶层键 dsh-desktop-tauriapp），原子写，参考 pet.json）

```json
{
  "port": 3080,
  "activeProfile": "web",
  "remote": { "active": null, "list": [{ "addr": "192.168.1.10:3080", "label": "NAS", "addedAt": "..." }] }
}
```

- 优先级：DSH_DESKTOP_PORT 环境变量 > settings.json.port > 3080。
- 写路径：临时文件 + rename（原子）。

## 2. 功能一：进程守护 + 侧边栏状态标识

### 2.1 状态标识（client 注入）

- **注入点**：`sidebar.footer.action` 槽（与已装 dsh-cost-meter 同款：
  `slots.inject('sidebar.footer.action', () => slots.register({ name: 'sidebar.footer.action', id: 'dsh-desktop-status', order: 20, ... }, StatusChip))`）——settings 按钮所在底部区，天然并排。
- 组件：状态圆点 + tooltip（运行中/复用外部/启动中/重启中/异常(可重试)/远程）；点击 = 请求重启（回启动页→停→拉起，复用现有 restart_dsh_in_mode）。
- 数据流：新建命令 get_dsh_status()（进入页面时拉一次）+ Rust Emitter::emit("dsh-status", ...) 推送；client 事件订阅实时刷新，不轮询。

### 2.2 守护器（Rust watchdog）

- setup 起 tokio 任务（间隔 5s，生命周期随 app）：
  1. 本地：`port_open(port)`（已有 TcpStream 实现）+ 最小 HTTP GET `/`（自写 socket 读，超时 2s）确认 200/3xx；
  2. 连续 3 次失败 → Down/Stale；已就绪过一次才触发自动恢复；
  3. 恢复流程 = restart_dsh_in_mode 同款：navigate_to_loading → 停旧 child → 按当前 profile/模式 spawn → wait_ready_and_navigate → Ready；
  4. 连续重启失败 3 次 → 停在加载页 + 系统通知 + 窗口聚焦，不再自愈（避免循环）；
  5. 远程：只做 TCP/HTTP 可达性检测，**不**自动重启远程实例（无法代拉），状态=远程异常时标识提示，由用户手动处理。
- 静默期：setup 后首次就绪前不算异常；自动重启间隔 ≥ 30s 防抖。

## 3. 功能二：Profile 切换

### 3.1 枚举与校验

- 枚举 `$DSH_HOME/profiles/*`（含 package.json 的目录）→ name。
- 可选中规则（参考 anywhere-labs 项目）：bundles 顺序**先含 @deepseek-ai/dsh-base、后含 @deepseek-ai/dsh-web-app**（直接依赖顺序）；否则禁选并灰显。
- 名称校验（新建时）：非空、[A-Za-z0-9_-]、禁止路径分隔符与控制字符。

### 3.2 托盘菜单

```text
托盘一级菜单（动态重建）：
├─ 显示窗口
├─ dsh 服务地址 ▸        （功能三，见 §4）
├─ Profile ▸
│   ├─ web            ✓（当前，勾选）
│   ├─ headless
│   ├─ ...（全部可选中项）
│   ├─ ──────────
│   └─ 新建 Profile…   （弹窗输入）
├─ 本地端口… 3080       （功能四，见 §4.4）
├─ 重启 dsh 服务
├─ 切换为兼容/高级模式
└─ 退出
```

- 切换流程（与模式切换同构）：navigate_to_loading → 停旧实例 → spawn `--profile <name>` + 现有 `--patch` 注入（享共享池实体跨 profile 可解析——这正是选「共享模块池」而非 profile node_modules 的原因）→ wait_ready → 刷新状态与托盘勾选。
- 切换失败：回退 last-known-good（settings.json 记录）并发通知。

### 3.3 新建 Profile

- 弹窗输入名称（§5）→ 执行 `dsh plugin --profile <name> add @deepseek-ai/dsh-base` 与 `add @deepseek-ai/dsh-web-app`（官方报错即「profile 不存在；用 plugin add 创建」；pnpm 由 dsh 转发）→ 成功后进列表（可选立即切换）→ 失败复制日志到通知/加载页。

## 4. 功能三：远程 dsh + 本地端口

### 4.1 二级菜单（一级项命名「dsh 服务地址」）

```text
dsh 服务地址 ▸
├─ 本地（127.0.0.1:<port>） ✓/○
├─ 192.168.1.10:3080（已存列表，当前项勾选）
├─ ──────────
├─ 新增地址…
└─ 删除地址 ▸（列表，点选删除）
```

- 新增弹窗：输入 `host[:port]`（默认端口 3080）；自动补 http://，拒绝 scheme/路径/凭据。

### 4.2 启动行为

| 模式 | 本地 | 远程 |
|---|---|---|
| 兼容 | 现状：spawn 或复用，无标记 | 直接导航 http://host:port/（无标记），系统原生标题栏；**不 spawn/不 kill 远程** |
| 高级 | spawn + --patch + 标记 | 导航 ?dsh-desktop-tauriapp-mode=advanced&...；**要求远程已安装 dsh-desktop-tauriapp**（页面 client 由远程提供） |

- 高级+远程预检：导航前 fetch 远程首页 HTML，查 `/plugins/dsh-desktop-tauriapp/client.js` 挂载；缺失 → 弹窗提示「远程未安装本插件，建议切兼容模式；仍要进入高级？」；选择进入则照常导航（无 chrome 自担）。

### 4.3 导航守卫与 ACL 改造

- navigate_guard 的 internal 判定改为「本地默认清单（127.0.0.1/::1/localhost/tauri.localhost）∪ 当前 remote host」（运行时读 DshState）。
- capability `remote-desktop.json` 的 `remote.urls`：确认 URLPattern（WHATWG 语义）支持 `http://*` 等通配主机（tauri-utils RemoteUrlPattern 基于 urlpattern crate，`*` 可用）→ 增补宽放行通配并保留现有精确项；若实测通配不可用 → 备选：启用 tauri `dynamic-acl` feature，运行期对所选地址 add_capability（实现阶段二选一验证）。

### 4.4 本地端口设置

- 一级项「**本地端口…<当前值>**」→ 弹窗输入 1..65535 → 写 settings.yaml（只动 dsh-desktop-tauriapp 键） → 立即走重启流程（加载页→停→新端口 spawn→就绪）。
- 与通知桥/桌宠无关；远程不受影响。

## 5. 输入/确认弹窗（通用组件）

- tauri-plugin-dialog 无文本输入，方案：**主窗口 w.eval 注入 in-page modal**（输入框 + 确定/取消），确认后调用新命令 `ui_input_confirm(flow, value)` 把值送回 Rust 驱动对应流程（新建 profile/新增地址/端口修改共用）。
- 兜底：webview 拒绝 eval 时用加载页自带 modal 变体。
- 备选（列而不选）：独立 input.html 小窗（同 pet 模式）。

## 6. 新增命令与权限

Rust 命令：get_dsh_status、restart_dsh（已有）、list_profiles、create_profile、switch_profile、list_remotes、add_remote、remove_remote、set_dsh_port、ui_input_confirm。

- permissions/app-commands.toml 追加对应 allow-*（连字符命名，命令名下划线不变）。
- capabilities 同步：default.json（本地页）、remote-desktop.json（远程页状态标识用 get_dsh_status/restart）。

## 7. 失败处理与幂等

- 切换/新建/端口修改全程 status=Restarting + 既有 restarting 防重入标志；托盘菜单在 Restarting 时禁用相关项。
- last-known-good：profile 与 remote 均双写（上次 good + pending）；失败自动回退并重启一次。
- 全部操作落日志（[tray] / [watchdog] 前缀）+ 完成/失败通知。

## 8. 实施顺序（建议）

1. settings.json 持久化 + app_port() 改读它（本地端口设置的后半）
2. 状态机 status + watchdog + dsh-status 事件与 get_dsh_status → client 状态标识（sidebar.footer.action）
3. profile 枚举/新建/切换 + 托盘二级（复用弹窗组件）
4. 远程地址管理 + guard/ACL 改造 + 高级预检
5. 验收回归：外链、右键刷新、局部 chrome、通知、桌宠、托盘切换模式

## 9. 开放问题（实现时确认）

- remote.urls 通配实测（URLPattern http://*）→ 失败则 dynamic-acl 备选；
- 新建 profile 时 dsh plugin add 的最小 bundle 组合与首次 pnpm 时长（可能 1–3 分钟，弹窗需显示进度）；
- 远程首页 fetch 预检的稳定性（rev 参数、页面是否 SSR 含 script 标签）；
- 多 profile 共享 sessions/settings 的既有语义（参考项目同款：默认共用 $DSH_HOME 数据，不迁移）。
