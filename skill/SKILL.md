---
name: dsh-desktop-app
description: 把 DeepSeek Harness（DSH）Web GUI 封装成 Tauri 2 桌面应用「小南梁」（macOS + Windows 双平台），含托盘常驻、单实例、子进程生命周期管理、窗口状态记忆、鲸鱼娘透明置顶桌宠、任务完成系统通知。包含 DSH 本身的安装步骤（macOS/Windows 分平台）与国内镜像加速配置。当用户想安装 DSH、把 DSH 或任意本地 Web 应用做成桌面应用、搭 Tauri 项目、或在 Windows 新环境配置 Rust/Node 工具链时使用。
---

# DSH 桌面壳「小南梁」

## 品牌与命名

- **品牌名「小南梁」**：来由——「南」取梁总（DeepSeek 创始人梁文锋，广东湛江人，
  南方人）的南方之义，「梁」取其姓氏；配合鲸鱼娘封面（DeepSeek 官方鲸鱼的娘化
  OC「溟月」，深海女仆工坊 maid-atelier）。
- **技术标识一律 ASCII**：skill 名、目录名、Cargo.toml 的 name、二进制名、bundle
  identifier 使用 `dsh-desktop-app` / `dsh-desktop` / `com.arcreel.dsh-desktop`。
  中文「小南梁」只用于展示层：productName、窗口 title、托盘 tooltip、通知文案、
  前端标题。
- **编码回退规则**：安装/构建过程中任何工具链、CI 脚本、git 路径、Windows 老
  conhost 等场景若因中文/符号出现编码问题（乱码、路径错误、脚本失败），立即把
  该处名称回退为 ASCII 的 `dsh-desktop-app` / `dsh-desktop`，并向用户说明回退原因。

## 沟通人设（执行本 skill 的 agent 须遵守）

与用户沟通时保持**深海女仆工坊的鲸鱼娘女仆**二次元身份：

- 称呼用户为「主人」，自称「小南梁」
- 语气温柔、恭敬、带轻量二次元口癖（句尾可用「呢」「哦」「的说」）
- 人设只作用于**沟通语气**；技术内容（命令、代码、日志、报告、报错原文）必须
  保持严谨准确，不得因为人设而含糊
- 用户要求正经交流或处于严肃技术场景时，立即切换为常规专业语气
- 交付物文案（README、通知文案）可用女仆语气点缀，但功能说明须清晰完整

把 DeepSeek Harness Web GUI 打包成 Tauri 2 桌面应用：双击启动 → 自动拉起本地
`dsh web` 服务 → 窗口加载 Web GUI → 托盘常驻 → 退出回收子进程。一套代码通过
`#[cfg(unix)]` / `#[cfg(windows)]` 双分支支持 macOS 与 Windows。

完整参考实现在本 skill 的 `resources/` 目录（lib.rs、Cargo.toml、tauri.conf.json、
前端壳三件套），**优先直接复制改造，不要从零重写**。

> 实测状态：macOS 与 Windows 流程均已实测（Windows 于 2026-08 在 Win11「无管理员
> 权限 + 无 VS Build Tools + 国内网络」环境完整构建并三条验收全绿，实战细节见
> resources/windows-build-notes.md）。如遇版本差异，按实际报错修正并回写本 skill。

## 一、安装 DeepSeek Harness（分平台）

DSH（DeepSeek Harness）是 npm 包 `@deepseek-ai/dsh`，提供 `dsh` CLI；
`dsh web` 在 127.0.0.1:3080 起 Web GUI。前提：Node.js ≥ 20。

### macOS

```bash
# 1. Node（二选一；nvm 的国内镜像安装见第二章）
brew install node@22
# 或 nvm：curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
#（raw 被墙时走 ghproxy 镜像，见第二章）

# 2. npm 镜像（国内必做）
npm config set registry https://registry.npmmirror.com

# 3. 全局安装 dsh
npm i -g @deepseek-ai/dsh

# 4. 验证
dsh --version      # 应输出版本号
which dsh          # 应指向全局 bin（nvm 场景为 ~/.nvm/versions/node/v*/bin/dsh）

# 5. 首次启动（会准备 profile：~/.dsh/profiles/web/，随后起 Web GUI）
dsh web
```

坑：
- nvm 装完必须**开新终端**（PATH 才更新）；brew 无此问题
- `which dsh` 若指向 `~/.npm/_npx/...`（npx 缓存），说明全局安装未生效：
  检查 `npm prefix -g` 是否在 PATH；npx 缓存路径会漂移，不可作为依赖
- 首次 `dsh web` 需要写 `~/.dsh`，HOME 正常即可；桌面壳 spawn dsh 时同样依赖 HOME
- 模型凭证（API key）按 dsh 官方 README 配置：环境变量或 Web GUI 设置页

### Windows

```powershell
# 1. Node：优先 nvm-windows（版本可切换）
winget install CoreyButler.NVMforWindows
# GitHub 安装器下载慢时：node 二进制 zip 走 https://npmmirror.com/mirrors/node/
#（选 win-x64 zip，解压后用 nvm 指向，或直接用官方 msi 装固定版本）
# 实测等价形态：官方安装器装到任意盘符（如 D:\node）也可以，只要 node.exe 与 npm
# 在 PATH 中（find_node 的 PATH 探测会命中；受限 PATH 场景用 DSH_NODE 兜底）
# 安装后重开终端：
nvm install 22
nvm use 22
node -v && npm -v

# 2. PowerShell 执行策略（拦 .ps1 shim 的经典坑）
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

# 3. npm 镜像 + 全局安装 dsh
npm config set registry https://registry.npmmirror.com
npm i -g @deepseek-ai/dsh

# 4. 验证
dsh --version
Get-Command dsh     # 应指向 %APPDATA%\npm\dsh.ps1（另有 dsh.cmd 供 cmd 使用）

# 5. 首次启动（profile 在 %USERPROFILE%\.dsh\profiles\web\，Web GUI 127.0.0.1:3080）
dsh web
```

坑（Windows 专属经验）：
- **npm 全局 bin 不在 PATH**：nvm-windows 安装器一般会自动加 `%APPDATA%\npm`，
  若 `dsh` 命令找不到，手动把该目录加进用户 PATH 后重开终端
- **执行策略报错**（"禁止运行脚本"）：上面第 2 步，PowerShell 5 默认 Restricted
- **中文乱码**：用 Windows Terminal（默认 UTF-8）；旧 conhost 里 `chcp 65001` 临时解决
- **防火墙**：`dsh web` 默认只绑 127.0.0.1，不会触发弹窗；若 `--host 0.0.0.0`
  局域网共享会触发防火墙放行确认
- **长路径**：项目放浅目录；agent 操作深目录遇 MAX_PATH 报错时需系统开启
  LongPathsEnabled=1
- **WSL2 不要混用**：桌面壳的探测逻辑只找 Windows 原生 node/dsh，WSL 里的 dsh
  不会被探测到；直接用 Windows 版 dsh 最稳，不要在桌面壳上接 WSL 包装脚本
- **首次启动基线**（实测）：`dsh web` 约 4s 就绪，stdout 仅一行
  `dsh web: http://127.0.0.1:<port>`，stderr 为空——桌面壳日志里看到单行输出是正常的
- **读 UTF-8 日志**（实测坑）：PowerShell 5.1 默认 GBK（chcp 936），`Get-Content`
  看 dsh/桌面壳日志会乱码；正确姿势 `[IO.File]::ReadAllText($path,[Text.Encoding]::UTF8)`

## 二、先配国内镜像（Windows 新环境必做，否则所有下载卡死）

顺序执行，一条都不能省。macOS 同样适用（跳过 Windows 专属项）。

### 0. 执行模式：subagent 哨兵（源是否生效用"时长"判定，禁止干等）

源配置不是"配完就算"，必须用下载时长验证。本章所有重量级下载/安装都按此模式执行：

1. **测速探针先行**（15 秒内确定该用哪个源，不花冤枉时间）：

   ```bash
   # 探针必须用 ≥10MB 大文件：小文件测速会失真——实测三个健康源对几 KB 探针
   # 只给出 677/41/438 B/s，按"<100KB/s 弃用"阈值会把健康源全部误杀
   curl -L -o /dev/null -s -w '%{speed_download} B/s\n' -r 0-10485759 --max-time 15 \
     https://rsproxy.cn/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe
   curl -L -o /dev/null -s -w '%{speed_download} B/s\n' -r 0-10485759 --max-time 15 \
     https://mirrors.tuna.tsinghua.edu.cn/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe
   curl -L -o /dev/null -s -w '%{speed_download} B/s\n' -r 0-10485759 --max-time 15 \
     https://registry.npmmirror.com/-/binary/node/v22.12.0/node-v22.12.0-win-x64.zip
   ```

   速度 < 100KB/s 的源直接弃用，选最快者配置。

2. **派 subagent 执行重量级任务**：主 agent 把单一下载/安装任务（含完整命令与
   预期输出）交给一个 subagent，不阻塞主会话。

3. **主 agent 定时轮询该任务**（每 30~60s 查一次 subagent 的最新输出），按
   **预期时长表**判定：

   | 任务 | 体量 | 镜像正常时长上限（超出 = 源未配好） |
   |------|------|----------------------------------------|
   | 单文件下载（图标 ~1MB） | ~1MB | 30s |
   | `npm i -g @deepseek-ai/dsh` | ~530 包 | 2min（实测 `added 530 packages in 2m` 恰好卡线） |
   | rustup 安装 toolchain | ~150MB | 5min（实测 rsproxy 1.45MB/s，合理） |
   | `cargo fetch` 预拉 Tauri 依赖（600+ crates） | 数百MB | 5min（**编译另计**：首次 release 编译实测 4m49s，勿把编译慢误判为源慢） |

4. **超时处置**：超过上限 → 中断 subagent → 复核配置实际生效位置
   （`cat ~/.cargo/config.toml` 确认存在且内容正确；`npm config get registry`
   确认输出镜像地址；Windows 确认 setx 后重启了终端；nvm 后开的是新终端）→
   换备选源（rsproxy ↔ 清华 ↔ 直连）→ 重新派发。

5. 同一任务**连续 3 次超时** → 停止重试，把各源测速结果与最后一次报错原样报告
   给用户，不再自动尝试。

6. **脚本级保险**（防 subagent 或管道干等，弥补轮询粒度盲区）：curl 一律带
   `--max-time 300 --speed-limit 1024 --speed-time 10`（低于 1KB/s 持续 10s 自动
   中断）；长命令包 `timeout`（macOS 无 timeout 时 `brew install coreutils` 后用
   `gtimeout`）；`cargo fetch` 完成即等于 cargo 源验证通过，之后才开始编译。

7. **两类已实测的误判，哨兵必须能识别**：
   - `Start-Process -Wait` 永久挂起 = 安装器卡 UAC 弹窗（不是网络慢）——等用户
     处理 UAC，或换免安装方案（如 7-Zip 解压 LLVM 安装器）
   - `cargo build > log 2>&1` 会截断输出（实测日志仅 33 行、panic 信息丢失），
     看起来像"编译慢"实为编译失败——采集输出勿落盘重定向，或 build.rs 加
     panic hook 打到 stdout

### 1. rustup / Rust 工具链

```bash
# macOS/Linux（bash/zsh，Windows PowerShell 用 $env: 写法）
export RUSTUP_DIST_SERVER=https://rsproxy.cn
export RUSTUP_UPDATE_ROOT=https://rsproxy.cn/rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
```

Windows 已装 rustup 的：把 `RUSTUP_DIST_SERVER`、`RUSTUP_UPDATE_ROOT` 设为系统
环境变量（setx，设完重启终端）；或用 `winget install Rustlang.Rustup`。
之后 `rustup default stable-msvc`（Windows）/ `stable`（mac）。

### 2. cargo 源（~/.cargo/config.toml，两平台通用）

```toml
[source.crates-io]
replace-with = 'rsproxy-sparse'

[source.rsproxy-sparse]
registry = "sparse+https://rsproxy.cn/index/"

[registries.rsproxy]
index = "sparse+https://rsproxy.cn/index/"

[net]
git-fetch-with-cli = true
```

备选（清华 TUNA）：`registry = "sparse+https://mirrors.tuna.tsinghua.edu.cn/crates.io-index/"`。
配置后先 `cargo search serde --registry crates-io` 或直接 `cargo fetch` 验证连通
（实测：rsproxy 替换后裸 `cargo search serde` 报 `crates-io is replaced with
non-remote-registry source registry 'rsproxy-sparse'`）。Tauri 全家桶首次编译要拉
600+ crates，**这一步没配好后面必然超时**。

### 3. npm / pnpm

```bash
npm config set registry https://registry.npmmirror.com
pnpm config set registry https://registry.npmmirror.com   # 没 pnpm 先 npm i -g pnpm --registry=https://registry.npmmirror.com
```

（第一章的 dsh 安装即依赖此镜像；Windows 的 node 二进制同样从 npmmirror 下载。）

### 4. GitHub 文件下载（图标素材、nvm 安装脚本等 raw 文件被墙）

```bash
curl -sL -o whale-girl-v1.png \
  "https://gh-proxy.com/https://raw.githubusercontent.com/fornarwhal/deepseek-whale-girl-icon/main/improved-1.png"
```

实测速度排序（同文件）：gh-proxy.com 26.1KB/s ≈ 直连 raw 23.7KB/s（直连当前可达
但会间歇 ECONNRESET）> ghproxy.cn 4.7KB/s（可用但最慢）——**首选 gh-proxy.com**。
镜像站变动快，失效时换 `mirror.ghproxy.com`、`gh.llkk.cc` 等；git clone 慢：
`git config --global url."https://gh-proxy.com/https://github.com/".insteadOf "https://github.com/"`（临时）。

### 5. Windows 专属

- **VS Build Tools**（Tauri 编译必需 link.exe）：微软 CDN 国内直连，
  https://aka.ms/vs/17/release/vs_BuildTools.exe 安装时勾选"使用 C++ 的桌面开发"；
  或 `winget install Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools"`。
  **无管理员权限时以上皆不可用**（实测环境即此形态），完整替代方案（全部用户级、
  实测构建+打包通过）见 resources/windows-build-notes.md §2，配置模板直接取
  `desktop/scripts/cargo-config-no-admin.toml.example`，环境变量由
  `desktop/scripts/build-env.ps1` 加载：xwin 取 CRT/SDK 头库
  （splat 无符号链接特权报 os error 1314 可忽略）+ rustup 自带 rust-lld 作链接器 +
  LLVM 安装器用 7-Zip 解压出 clang-cl（免 UAC）+ NuGet Microsoft.Windows.SDK.BuildTools
  取**真 rc.exe**（llvm-rc 编不了 `#pragma code_page(65001)` 中文资源，必失败），
  cargo config 固化 INCLUDE/LIB/CC/CXX/RC/linker。
- **WebView2 Runtime**：Win11 自带；老系统从微软官网直连下载（国内可达）。
- **NSIS**（打包 exe 安装器时 tauri 自动下载，GitHub 源可能失败）：设置
  `TAURI_BUNDLER_TOOLS_GITHUB_MIRROR=https://gh-proxy.com/`（**前缀式**，实测打包
  日志 `Downloading https://gh-proxy.com/https://github.com/...nsis-3.11.zip` 成功）。
  `TAURI_BUNDLER_TOOLS_GITHUB_MIRROR_TEMPLATE` 变量也存在，但值必须含 `{{url}}`
  占位符。手动兜底注意：官方 NSIS zip **不含** tauri 需要的
  `nsis_tauri_utils.dll`，需同时取 tauri-apps/binary-releases 的 nsis 构建与
  tauri-apps/nsis-tauri-utils，放到 tauri 报错日志提示的 bundler 工具目录。

## 三、创建项目（<工作目录>/desktop/）

```bash
npm create tauri-app@latest desktop -- --name dsh-desktop \
  --identifier com.arcreel.dsh-desktop --template vanilla --manager pnpm --yes
cd desktop && pnpm install
```

删除脚手架残留（src/main.js、src/assets/）。`src/` 直接作为 frontendDist（无 vite）：
用 `resources/` 里的 `index.html`（加载页）、`error.html`（错误页，日志路径按
`navigator.platform` 自适应 mac/win）、`styles.css`、`icon.png` 直接覆盖。
error.html 里 mac 日志路径 ~/Library/Logs/com.arcreel.dsh-desktop/、win 为
%LOCALAPPDATA%\com.arcreel.dsh-desktop\logs\。

脚手架命令失败时也可手工搭建（实测等价结构构建通过）：手建 package.json
（scripts.tauri="tauri"，devDependencies @tauri-apps/cli ^2）、src/ 三件套、
src-tauri/（Cargo.toml + build.rs + tauri.conf.json + capabilities/default.json +
icons/ + src/main.rs + src/lib.rs），`pnpm install` 后即可 `pnpm tauri build`。

## 四、Rust 核心（src-tauri/）

直接用 `resources/` 里的 `Cargo.toml`、`tauri.conf.json`、`capabilities.json`（改名
capabilities/default.json）、`capabilities-pet.json`（改名 capabilities/pet.json）
覆盖脚手架文件，lib.rs 用 `resources/lib.rs` 全文覆盖。
注意：中文 productName（小南梁）下 tauri.conf.json **必须**含
`"bundle": {"windows": {"wix": {"language": "zh-CN"}}}`，否则 Windows MSI 打包
light.exe 报 LGHT0311（codepage 1252 编不了中文）必失败；resources/tauri.conf.json
已含该项。

`resources/lib.rs` 已实现（按此结构，勿重新设计）：

- **状态**：`DshState` = `child: Mutex<Option<Child>>` + `spawned_this_run` /
  `spawn_failed` / `quitting` / `tray_tip_shown`（AtomicBool）
- **启动**（setup）：`TcpStream::connect_timeout`（300ms）探测 127.0.0.1:port
  （默认 3080，env `DSH_DESKTOP_PORT` 覆盖；spawn 带 `--no-open` 关闭默认打开浏览器）——
  已监听则复用外实例，启动页弹「兼容/高级」模式选择（兼容=标准布局+系统原生标题栏、不启用
  桌面 chrome；高级=按端口停用外部实例后，用桌面 overlay 实例重启并启用桌面 chrome）；
  空闲则 spawn 桌面 overlay 实例直接进高级；spawn 失败按 SpawnError 区分 NotFound（错误页 not-found）/
  Other（错误页 spawn-failed），失败后轮询任务直接 return、不二次导航覆盖错误页；
  async 任务每 500ms 轮询、60s 超时，就绪后
  `eval("window.location.replace('http://127.0.0.1:<port>/')")` 跳转，失败跳错误页
  + 系统通知
- **版本目录排序必须 semver 比较**：nvm 目录名（v22.12.0）不能字符串 sort
  （'9' > '2'，v9.11.0 会排在 v22.12.0 之后取错"最新"），resources/lib.rs 的
  version_key() 已处理（潜伏 bug，实测审计发现并已修）
- **子进程输出**：stdout/stderr 必须 `Stdio::piped` + 线程逐行转 log（不读管道会
  缓冲满阻塞子进程；ChildStdout/ChildStderr 类型不同，分开 take）
- **平台分支**：
  - `#[cfg(unix)]`：find_dsh_bin（DSH_BIN → PATH → Homebrew/npm-global → nvm glob →
    npx glob 最新）+ spawn `dsh web ...` 且**子进程 PATH 补充**（GUI 应用 PATH 只有
    /usr/bin:/bin，dsh shebang 依赖 node）
  - `#[cfg(windows)]`：find_node + find_dsh_bin_js + `node <bin.js>` 直跑
    （Rust ≥1.77 的 Command 对 .cmd 会自动以 cmd.exe /c 包装，实测可直接 spawn；
    直跑 node 仍推荐——少一层 cmd 包装、输出转发直接）；nvm-windows 在
    %NVM_HOME%\v*\、%NVM_SYMLINK%\、%APPDATA%\nvm；`.creation_flags(0x0800_0000)`
    防闪黑窗
- **托盘**：TrayIconBuilder，tooltip「小南梁」，菜单「显示主窗口/显示或隐藏桌宠/
  退出小南梁」，左键显示；**关闭即隐藏**（CloseRequested prevent + hide，首次通知提示），
  ExitRequested 非 quitting 拦截 Cmd+Q；**退出回收**：托盘退出置 quitting →
  app.exit(0) → RunEvent::Exit 里仅当 spawned_this_run 时 kill + wait
- **插件顺序**：log（Stdout + LogDir "dsh-desktop"）、notification、window-state
  （`with_denylist(["pet"])` 排除桌宠，否则插件会接管桌宠位置）、
  single-instance（回调 show + focus）
- **任务完成通知**：本地 HTTP 桥（127.0.0.1 随机端口 + Bearer token）接收注入脚本
  POST /notify；桥必须回 OPTIONS + Access-Control-Allow-* 头（跨源 preflight 被拦是
  0.3.0 通知失效的根因）；注入脚本在**导航完成后**注入（勿在 setup 提前注入，冷启动
  会随加载页销毁），busy 检测用 `[data-state="ongoing"]`（编译产物实测标记，勿扫
  "停止"文案——那是运行时 i18n，bundle 里 0 次）
- **桌宠**：tauri.conf.json 第二窗口 pet（transparent + decorations:false +
  alwaysOnTop + skipTaskbar + focusable:false + visible:false + acceptFirstMouse +
  visibleOnAllWorkspaces）；macOS 透明需 `macOSPrivateApi:true` + Cargo.toml
  `macos-private-api` feature（缺了 build 报错）；位置存 app_config_dir/pet.json
  （多屏钳位 + WindowEvent::Moved 400ms 防抖）；自定义命令 pet_show_main / pet_hide /
  pet_quit / pet_toggle_passthrough 经 invoke_handler 注册（应用命令免 ACL）；桌宠
  前端 pet.html/css/js 用 `window.__TAURI__`（需 `withGlobalTauri:true`），拖拽走
  JS 手动 `startDragging`（4px 阈值区分点击，需 `core:window:allow-start-dragging`）
- **测试钩子**：env `DSH_DESKTOP_AUTO_QUIT=1` 时 setup 后 8 秒自动走退出流程（验收用）

应用名/文案按需替换「小南梁」（tauri.conf.json 的 productName、窗口 title、lib.rs
托盘与通知文案、前端标题）；**技术层名称保持 ASCII 不回退**（Cargo.toml 的
package.name、二进制名、identifier 一律 dsh-desktop 系，见「品牌与命名」节）。
换 identifier 时注意 capabilities 的 windows 列表、日志目录都会跟着变。

## 五、图标（鲸鱼娘，CC BY-NC-SA 4.0 非商用）

按第二章第 4 节用国内镜像下载（v1 为透明底 RGBA 984x984）：

```bash
curl -sL -o whale-girl-v1.png "<镜像前缀>/https://raw.githubusercontent.com/fornarwhal/deepseek-whale-girl-icon/main/improved-1.png"
curl -sL -o whale-girl-LICENSE.txt "<镜像前缀>/https://raw.githubusercontent.com/fornarwhal/deepseek-whale-girl-icon/main/LICENSE"
```

Pillow 把 v1 LANCZOS 缩放 1024x1024 存 `src-tauri/icons/source.png` →
`pnpm tauri icon src-tauri/icons/source.png` 生成全套（含 .icns/.ico）→ 加载页图标
用 `src-tauri/icons/128x128@2x.png`（即 256 像素；**tauri icon 不生成
256x256.png**，实测输出清单只有 128x128@2x 与 512 的 icon.png）复制为
`src/icon.png`，或用 Pillow 直接生成 256x256。README 必须写署名（角色 OC「溟月」
by 上善无形、二创 ZipZipPipe、修复 QYQCAMIAO）与许可，保留 LICENSE 文件。
公开分发前评估 CC 非商用 + DeepSeek 商标问题。

## 六、构建与验收（两条路径必须绿）

仓库 `desktop/scripts/` 已提供现成脚本：`acceptance.sh`（macOS）/
`acceptance.ps1`（Windows）自动跑 A/B/C 三路径；`build-env.ps1` +
`cargo-config-no-admin.toml.example` 固化 Windows 无管理员构建环境。
**运行验收前必须退出所有 dsh-desktop 实例**：单实例锁会把验收进程静默转交
并立即退出（exit 0 但零输出，造成假通过），脚本开头已内置该检测。

```bash
cd desktop && pnpm tauri build   # mac 出 .app/.dmg，win 出 .msi/-setup.exe
```

**A 复用路径**（3080 已有 dsh web）：
- mac：`DSH_DESKTOP_AUTO_QUIT=1 ./target/debug/dsh-desktop`
- win：`$env:DSH_DESKTOP_AUTO_QUIT="1"; .\target\debug\dsh-desktop.exe`
- 期望日志：「已有服务在监听，直接复用」→「已导航到 http://127.0.0.1:3080/」→
  正常退出且不杀已有 dsh

**B 拉起+回收**（3081 端口）：
- mac：`DSH_DESKTOP_PORT=3081 DSH_DESKTOP_AUTO_QUIT=1 ./target/debug/dsh-desktop`
- win：`$env:DSH_DESKTOP_PORT="3081"; $env:DSH_DESKTOP_AUTO_QUIT="1"; .\target\debug\dsh-desktop.exe`
- 期望日志：spawn → `[dsh] dsh web: http://127.0.0.1:3081` → 导航 → 退出时
  「正在停止 dsh 子进程」；跑完端口空闲（mac：`lsof -nP -iTCP:3081`；
  win：`Get-NetTCPConnection -LocalPort 3081 -State Listen`）

**C GUI 启动场景**（受限 PATH 模拟双击，验证兜底探测）：
- mac：`env -i HOME="$HOME" PATH="/usr/bin:/bin:/usr/sbin:/sbin" DSH_DESKTOP_PORT=3082 DSH_DESKTOP_AUTO_QUIT=1 "<bundle>/小南梁.app/Contents/MacOS/dsh-desktop"`
- win：`$env:PATH="$env:SystemRoot\system32;$env:SystemRoot"; $env:DSH_DESKTOP_PORT="3082"; $env:DSH_DESKTOP_AUTO_QUIT="1"; & "<release>\dsh-desktop.exe"`（产物 exe 是 crate 名 `dsh-desktop.exe`，不存在「小南梁.exe」；安装产物在 `$env:LOCALAPPDATA\小南梁\dsh-desktop.exe`）

验收前确认没有同 identifier 旧实例在跑（单实例锁会拦截新实例）。

## 七、已知坑

- **dmg 残留挂载**（mac）：bundle_dmg.sh 失败会留挂载中的 rw 映像，后续重试必失败。
  `hdiutil info` 找 /Volumes 挂载点 → `hdiutil detach <挂载点>` → 删
  bundle/macos/rw.*.dmg → 重新全量 build。注意 `tauri build --bundles dmg`
  会清掉已打好的 .app。
- **SmartScreen**（win）：仅**网络下载带 MOTW 标记**的未签名 exe 才触发蓝色警告
  （更多信息 → 仍要运行）；本地构建/本机安装不触发（实测）。正式网络分发需代码
  签名证书（OV 级约 200~400 美元/年）。
- **Windows 分支已实测**：x86_64-pc-windows-msvc 下 `cargo check` exit=0（1m40s，
  仅一条 unused import 警告，已修）；cfg(windows) 代码在 mac 构建时被排除属正常。
- **托盘位置**（win 11）：可能收进通知区域溢出区，README 提示用户。
- **GUI 应用环境变量**：不读 shell rc，win 用 `setx`，mac 用 `launchctl setenv`。

## 八、收尾（README 必写项）

工作原理与平台差异、dsh/node 定位顺序、日志位置（分平台）、环境变量
（DSH_BIN / DSH_NODE / DSH_DESKTOP_PORT）、图标署名与许可、已知限制（Web GUI
通知未接入、SmartScreen/签名状态）、版本升级路径（dsh 升级只需 npm 重装，壳不用重建）。

## 九、桌面端与会话的关系（用户高频疑问，README 也应写一节）

桌面端打开的是**同一个 dsh 服务的壳**，不是新会话、不是复制品：

1. **复用而非复制**：启动时先探测 127.0.0.1:port——已有 dsh 在监听就直接复用
   （验收 A 路径），所以桌面窗口和浏览器看到的是同一个后端、同一份会话列表。
   只有端口空闲时才 spawn 新 dsh（验收 B 路径）。
2. **会话在磁盘**：会话历史持续写入 dsh 的会话存储目录
   （mac `~/.dsh/sessions/`，win `%USERPROFILE%\.dsh\sessions\`，
   文件形如 session-<id>.jsonl.zstd）。桌面端复用同一份文件，历史对话、工作目录、
   工具上下文完整保留。
3. **冷启动也恢复**：全部关掉后双击桌面端，spawn 的还是同一个 `dsh web`、
   读同一个 sessions 目录，历史会话照常恢复。
4. **注意双开并发**：桌面端与浏览器可以同时开着，但**不要在两边同时操作同一个
   会话**（并发写入同一份 session 文件可能互相覆盖）；聊一个会话时固定用一边。
5. **退出生命周期**：桌面端退出只回收**它自己 spawn** 的 dsh；复用的已有实例
   不受影响（浏览器里继续可用，数据在磁盘不丢，下次启动恢复）。
6. 这条机制正是桌面壳的核心价值：应用形态换了，上下文不断。

## 十、省 token 使用习惯（按量计费，输入基数是最大隐性成本）

按量计费下，**成本 = 输入基数 × 单价**。即便缓存命中率 99%（输入价降到 1/10），
基数太大仍贵。省钱的根子是**控制输入基数**，不是少干活：

1. **拆分会话，别马拉松**：每完成一个阶段（搭骨架/修 bug/发布）就开新会话。
   超长会话每轮重传全部历史，输入量滚雪球；拆成 5-6 个短会话，总输入可降一半以上。
2. **独立任务拆给 subagent**：调研、代码审查、并行实现这类自包含任务交给
   subagent（独立上下文，不污染主会话历史），天然省输入。
3. **闲时跑长任务**：打包、批量生成、长构建这类耗时任务挪到闲时（8/17 调价后
   闲时价格是高峰的一半）。
4. **限制无人值守自动运行**：goal 设 max_goal_rounds 上限，防止离开后一轮接一轮
   空转烧钱。
5. **读文件用 offset/limit 精准读**：不要全文重读大文件，只读需要的段落。
6. **长命令后台跑**：构建/打包用后台 job，不阻塞主会话；用 job_output 轮询结果
   而非重复执行。
7. **阶段内连贯、阶段间拆分**：缓存命中（99%）是输入价 1/10 的关键，同一会话内
   连贯续作比冷启动省；与第 1 条平衡——一个阶段内别乱开会话，阶段完成就换新。

一句话：省的是「重复读历史」，不是「少干活」。

## 十一、计费决策参考（订阅 vs 按量，2026-08 调研）

纠结"订阅封顶 vs 按量计费"时，先分清使用形态：

- **单人交互式编码**（用量落在 fair-use 窗口内）→ 订阅划算（Codex Pro $100/月）
- **token 密集批处理**（长会话、批量生成、反复构建）→ 按量划算，且 DeepSeek 按量
  比 Codex API 便宜 4~10 倍

实测对比（月输入 100M、99% 缓存命中、输出 5M）：

| 方案 | 月成本 | 说明 |
|------|--------|------|
| DeepSeek 按量（调价前） | ¥62.7 | 输入¥3/M、输出¥6/M，缓存命中¥0.3/M |
| DeepSeek 按量（8/17 调价后） | ¥100~168 | 峰/闲时段占比决定 |
| Codex Pro 订阅 | $100~200 | fair-use 限速（5h 窗口消息数）撑不起此负载 |
| Codex API 按量（GPT-5.3-Codex） | ≈¥641 | 输出 $14/M 是 DeepSeek 的 2 倍多 |

关键认知：**订阅不是"无限"，是"限速 + fair use"**，超限停用需买 credits 或等待。
结论：按量计费对"有高峰有低谷"的项目开发更划算；真正的省钱点在控制输入基数
（见第十章），而非换计费模式。数据来源：OpenAI Codex 官方定价页与 rate card，
调研于 2026-08。
