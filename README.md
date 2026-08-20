# Deepseek Harness（dsh-desktop-app）

[![awesome · DSH plugin](https://awesome-dsh-plugin.com/badge.svg)](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
[![npm](https://img.shields.io/npm/v/dsh-desktop-app)](https://www.npmjs.com/package/dsh-desktop-app)

> 主人好呀～ 这是 **Deepseek Harness** 桌面客户端仓库，把 DeepSeek Harness Web GUI 封装成 macOS/Windows 桌面应用。一键启动、托盘常驻、退出自动回收子进程。
> 一键安装：`dsh plugin add dsh-desktop-app`（npm）或 `dsh plugin add github:happpsee/dsh-desktop-app`（GitHub），主人家的 agent 就学会「把 DSH 封装成桌面应用」的手艺了呢～

这个仓库把 DeepSeek Harness 做成桌面端（macOS + Windows 双平台），主要看点：

1. **Windows 无管理员工具链方案**：无 VS Build Tools 也能构建 Tauri 2（xwin + rust-lld + clang-cl + 真 rc.exe），全部用户级安装，附配置模板与脚本
2. **国内镜像哨兵机制**：rustup/cargo/npm/GitHub/NSIS 全套镜像 + subagent 超时判定，Windows 新环境不再卡外网
3. **真机实测审计报告**：Win11 无管理员逐条实测 + 20 条修订清单（docs/）

桌面壳本身（`desktop/`，macOS + Windows 双平台，托盘常驻 / 单实例 / 子进程回收 / 任务完成通知 / macOS Overlay 标题栏）作为可运行参考实现。

## 命名

- 应用展示名：**Deepseek Harness**（与已安装的 `DeepSeek Harness.app` 保持一致）
- 技术标识：ASCII 的 `dsh-desktop-app` / `dsh-desktop` / `com.arcreel.dsh-desktop`
- 应用图标：复用已安装的 `DeepSeek Harness.app` 的 `icon.icns`（保真度最高的 macOS icns）
- 应用内左上角图标：保留 DSH Web GUI 原始样式；桌面 chrome（拖拽条/标题栏占位/窗口按钮）由内置 `dsh-desktop-app` 插件的 client 提供——应用启动时自动把插件挂进 web profile（走官方 `dsh plugin --profile web add`，幂等检测），窗口加载 URL 带 `dsh-desktop-mode=advanced&dsh-desktop-platform=<平台>` 标记，插件 client 借此接管 root slot 渲染拖拽区/标题栏；普通浏览器访问不激活、不受影响

## 特性

- **一键启动**：双击 app → 探测本地 dsh web（默认 127.0.0.1:3080，`DSH_DESKTOP_PORT`
  覆盖；`dsh` 升级后默认会打开系统浏览器，桌面壳 spawn 时带 `--no-open` 关闭）。空闲则由本应用
  拉起带桌面 overlay 的实例并直接启用桌面 chrome；已有实例时，启动页弹「兼容/高级」模式选择：
  - **兼容模式**：复用外部实例、标准布局、系统原生标题栏（不启用桌面 chrome，浏览器不影响）
  - **高级模式**：先停用占用端口的现有 dsh（含外部/终端进程），再以桌面 overlay 实例重启、
    启用完整桌面 chrome
  退出只回收自己拉起的实例
- **托盘常驻**：关闭窗口仅隐藏（首次有通知提示），托盘左键唤起、菜单退出；
  拦截 Cmd+Q 防误退
- **托盘「重启 dsh 服务」**：会停掉当前占用端口的实例（含复用的外部实例，例如终端/浏览器
  起的 dsh web），再以带桌面 overlay 的桌面壳实例重启，从而从「降级接入」升级为完整桌面 chrome
- **进程回收**：只回收本次启动 spawn 的 dsh 子进程，stdout/stderr 落盘日志
- **单实例**：重复双击聚焦已有窗口，不会拉起第二个服务
- **窗口状态记忆**：位置与大小自动恢复
- **桌面 chrome（插件式，参考 dsh-plugin-desktop 实现）**：由内置 `dsh-desktop-app` 插件 client（`src/client/`，构建产物 `lib/client.js`）接管 dsh web 的 root slot，按平台渲染——macOS `titleBarStyle: Overlay` 保留原生红绿灯 + sidebar 顶部空白拖拽区（`data-tauri-drag-region` 原生拖拽，`core:window` 权限经 remote capability 放行）；Windows/Linux 用 `decorations:false` 隐藏系统标题栏，client 自绘 caption 行 + 最小化/最大化/关闭按钮；布局/配色全部跟随主题 token（`--dsw-alias-bg-base` 等），无硬编码、可换主题；macOS Overlay 顶部原生标题栏材质属系统标准行为
- **自动接线 web profile**：应用启动（需拉起 dsh 时）检测 `~/.dsh/profiles/web` 是否已挂 `dsh-desktop-app`，缺失则用官方 `dsh plugin --profile web add <spec>` 装入（幂等，代码内完成、不手工改配置）；`<spec>` 指向**内嵌在 app 内的插件副本**（见下条「内嵌插件跨平台路径」）；spawn 时带内置 overlay `--patch` 禁用 stock `ui-layout`，让桌面 root slot 接管布局，浏览器 GUI 不受影响
- **内嵌插件跨平台路径**：`dsh-desktop-app` 打包时经 `bundle.resources` 内嵌进安装包——
  macOS 落在 `Contents/Resources/dsh-desktop-app`、Windows 落在可执行文件所在安装目录、
  Linux 落在 `/usr/lib/<应用>`（deb）或 AppImage 挂载点；运行时统一用 `app.path().resource_dir()`
  解析真实位置，安装目录不在 /Applications 也不受影响。
- **鲸鱼娘桌宠**：透明置顶无边框小窗，纯 CSS 呼吸/漂浮动画 + 椭圆阴影；拖拽移动
  （4px 阈值区分点击）、左键唤起主窗、右键菜单（穿透开关/隐藏/退出）、任务完成
  弹气泡；位置记忆（多屏钳位 + 拖拽防抖）；托盘「显示/隐藏桌宠」开关
- **任务完成通知**：注入 JS 监听运行中标记（`data-state="ongoing"`）的"忙碌→空闲"
  翻转，任务结束时 Dock 角标 +1；窗口失焦/隐藏时弹系统通知并跳 Dock（前台不打扰），
  回到窗口自动清零；通知桥内置 CORS 预检应答（跨源 fetch 不再被浏览器拦截）
- **三平台通知权限**：启动时 best-effort 申请/确认系统通知权限（macOS UNUserNotificationCenter /
  Windows Toast / Linux dbus），所有系统通知的发送结果统一落日志，便于排查"通知不生效"
- **外链默认浏览器打开**：webview 里任意位置的 http(s)/mailto/tel 链接（对话内、设置页等），
  由插件 client 拦截并转交系统默认浏览器（Tauri 命令 `open_external`），同时覆盖 `window.open`
  （"在新窗口打开链接"等）；纯浏览器页面不做任何拦截
- **启动控制台**：加载页实时显示 `dsh web` 子进程的 stdout/stderr（原生侧 emit
  `dsh-console` 事件到页面），控制台样式输出框支持展开/收起/清空，启动失败时可直接看到原因
- **健壮定位**：Finder/资源管理器启动的 GUI 应用没有终端 PATH，内置
  nvm/npm-global/npx/Homebrew/非标准盘符等多级兜底探测（Windows 分支用
  `node + bin.js` 直跑，规避 dsh.cmd shim 与黑窗闪现）
- **国内镜像优先**：skill 内置 rustup/cargo/npm/GitHub/NSIS 全套国内源配置，
  以及"subagent 哨兵"下载时长判定机制（Windows 无管理员环境的完整替代工具链
  方案见 docs/windows-build-notes.md）

## 仓库结构

```
skill/     Claude/DSH 兼容技能包（SKILL.md + resources/ 参考实现 + Windows 实战笔记）
desktop/   Tauri 2 项目源码（macOS + Windows，cfg 双平台分支）
docs/      Windows 实测审计报告与构建笔记
```

## 快速开始

### 直接安装（macOS）

1. 确保已装 dsh：`npm i -g @deepseek-ai/dsh`
2. 从 [Releases](../../releases) 下载 `Deepseek-Harness_*.dmg`，拖入应用程序
3. 双击「Deepseek Harness」；托盘菜单可退出

### 从源码构建

```bash
cd desktop
pnpm install
pnpm tauri build   # macOS 出 .app/.dmg；Windows 出 .msi/.exe
```

构建细节、平台差异与验收清单见 [skill/SKILL.md](skill/SKILL.md)。

### 作为技能使用

```bash
cp -r skill ~/.claude/skills/dsh-desktop-app   # Claude Code / Claude Agent
# DSH：复制到所运行 profile 的 skills 目录后加载 dsh-desktop-app 技能
```

## 平台实测状态

| 平台 | 状态 |
|------|------|
| macOS | ✅ 实测（三条验收路径全绿） |
| Windows | ✅ 实测（Win11 无管理员环境完整构建+打包+验收，见 [docs/windows-audit-report.md](docs/windows-audit-report.md)） |

## 许可

- 代码与文档：**MIT**（见 [LICENSE](LICENSE)）
- 应用图标来源：`/Applications/DeepSeek Harness.app/Contents/Resources/icon.icns`（已安装的桌面客户端原图，复用以保证图标一致）
- 鲸鱼娘素材：CC BY-NC-SA 4.0 非商用素材仍随仓库保留（`skill/resources/whale-girl-LICENSE.txt`），如有启用可作为品牌辅助素材
- 另请注意：DeepSeek 鲸鱼为官方商标，本应用是非官方客户端

## 已知限制

- 任务完成通知仍为 DOM 启发式（`data-state` 运行中标记），分不清成功/失败/被停、
  拿不到标题/token；权威信号 `turn/end` 的语义化升级方案见 docs/next-tasks.md
- 桌宠：macOS 打包（DMG）后透明可能丢失（tauri issue #13415，dev 正常，需真机双验）；
  macOS 置顶仅 Floating 级、盖不过全屏应用；macOS Cmd+Tab 会出现桌宠条目
  （`skipTaskbar` 仅 Windows 生效）；任务通知首次弹出需在系统设置授予通知权限
- 未签名分发：Windows 网络下载的 exe 会触发 SmartScreen 提示（本地构建不触发）；
  macOS 非公证 app 需右键打开
