# dsh-desktop-tauriapp skill · Windows 实测审计报告

审计对象：`C:\Users\zxy\Desktop\dsh-desktop-tauriapp-skill\dsh-desktop-tauriapp-skill`
审计方式：在本机（Win11，无管理员权限，无 VS Build Tools）逐条实测/复现，
全部结论基于下方引用的实测输出原文。

---

## A. 环境基线（实测原文）

```
OS Name:  Microsoft Windows 11 家庭版 中文版
OS Version: 10.0.26200 N/A Build 26200
System Type: x64-based PC
```
```
PowerShell: 5.1.26100.9168        # Windows PowerShell 5.1（非 pwsh 7）
WT_SESSION=<空>  SESSIONNAME=Console   → 终端为 conhost（非 Windows Terminal）
```
```
node -v = v24.15.0   npm -v = 11.12.1
nvm version → "nvm : The term 'nvm' is not recognized..."（未装 nvm-windows）
where.exe node = D:\node\node.exe      # 官方安装、非标准盘符
```
```
rustc 1.97.1  host: x86_64-pc-windows-msvc
rustup toolchain list → stable-x86_64-pc-windows-msvc (active, default)
rustup target list --installed → x86_64-pc-windows-msvc
```
```
where.exe dsh → C:\Users\zxy\AppData\Roaming\npm\dsh  +  ...\npm\dsh.cmd
Get-Command dsh → Name: dsh.ps1  Source: C:\Users\zxy\AppData\Roaming\npm\dsh.ps1
dsh --version → 0.1.0-rc.6
```
```
vswhere NOT FOUND at C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe
→ 无 VS Build Tools（skill 第二章的安装前提在本机不成立）
```

## B. DSH 安装（skill 第一章 Windows 节）

| skill 写的 | 实测 | 结论 |
| --- | --- | --- |
| 优先 nvm-windows（winget install） | 本机无 nvm；node 为官方固定版装在 `D:\node` | skill 主路径不适用；「或直接用官方 msi 装固定版本」这条才是本机实情 |
| GitHub 安装器慢时走 npmmirror node zip | GitHub 直连实测：raw 早期 ECONNRESET、release CDN 超时；**未用到 npmmirror node zip**（node 已装） | 部分一致 |
| `%APPDATA%\npm` 一般自动加 PATH | 实测 `C:\Users\zxy\AppData\Roaming\npm` **在 PATH 中** ✓ | 一致 |
| 执行策略"禁止运行脚本"（PS5 默认 Restricted） | `Get-ExecutionPolicy -List`：CurrentUser=**RemoteSigned**（其余 Undefined） | 本机已配好；「PS5 默认 Restricted」未能在全新机器验证 |
| 中文乱码：Windows Terminal 默认 UTF-8；conhost 用 chcp 65001 | `chcp.com` → **Active code page: 936**；本机是 conhost+GBK，UTF-8 日志在 PS 5.1 下确实乱码 | 坑成立；**遗漏**：读 UTF-8 日志文件要 `[IO.File]::ReadAllText(path,[Text.Encoding]::UTF8)` |
| 防火墙：127.0.0.1 不弹窗 | dsh web 绑 127.0.0.1 实测 4.0s 监听成功无弹窗；且已有 2 条「Node.js JavaScript Runtime Inbound Allow」规则 | 一致 |
| MAX_PATH 报错 | `LongPathsEnabled=1` 已开启，未遇报错 | 未触发，一致 |
| WSL2 不要混用 | `wsl -l -v` 报「未安装用于 Linux 的 Windows 子系统」（本机无 WSL） | 坑未触发，写法保留 |
| profile 在 `%USERPROFILE%\.dsh\profiles\web\` | 实测存在（profiles/web + profiles/node_modules + sessions/storages/settings.yaml） | 一致 |
| （未写）首次启动耗时/输出格式 | 实测：**4.0s** 到监听，stdout 仅一行 `dsh web: http://127.0.0.1:3085`，stderr 空 | **skill 未覆盖，建议补** |

## C. 国内镜像（skill 第二章）

1. **三源测速**（skill 2.0 原探针命令）：rsproxy / npmmirror / 清华全部 `http=200`（小文件 <1s 完成）。**探针缺陷**：三源测速均 <100KB/s（rsproxy 677 B/s、npmmirror 41 B/s、清华 438 B/s），按 skill「<100KB/s 弃用」判据会把三个健康源全部误杀——原因是探针文件只有几 KB。需换大文件探针。
2. **cargo 源**：`~/.cargo/config.toml` 与 skill 2.2 一致（rsproxy-sparse + git-fetch-with-cli，另含本机无管理员方案追加的 `[env]` 与 linker）。**skill 的验证命令不可用**：
   ```
   cargo search serde --limit 3 → error: crates-io is replaced with non-remote-registry
   source registry `rsproxy-sparse`; include `--registry crates-io` to use crates.io
   ```
   正确验证：`cargo search serde --registry crates-io` 或 `cargo fetch`。
3. **npm i -g @deepseek-ai/dsh**：实测 `added 530 packages in 2m`（本机 npm registry 为腾讯云源 `https://mirrors.cloud.tencent.com/npm/`，非 npmmirror；pnpm 为 npmmirror）。表值「2min 上限」**恰好卡线，准确**。
4. **GitHub 图标下载**：三路实测（LICENSE 文件）——直连 raw `http=200 23748 B/s`；ghproxy.cn（skill 写的）`http=200 4767 B/s`；gh-proxy.com `http=200 26144 B/s`。**ghproxy.cn 可用但最慢，gh-proxy.com 快 5 倍**；建议调换推荐顺序。
5. **rustup**：rsproxy 组件实测 `1.45MB/s`（rustup-init.exe 12.8MB/8.8s）；表值 5min 上限**合理**（实测未超）。
6. **VS Build Tools**：本机无管理员 → winget/官网 exe 均未实测；skill 假设「微软 CDN 国内直连 + 勾选 C++ 桌面开发」在本机不可执行。**skill 最大缺口：无管理员替代方案**（本机实测成功方案：xwin 取 CRT/SDK + rust-lld + LLVM 的 clang-cl + NuGet SDK BuildTools 的真 rc.exe，全部用户级）。
7. **NSIS**：tauri 打包自动下载**成功**。二进制（tauri-cli 2.11.4 的 cli.win32-x64-msvc.node）内同时含两个变量名：`TAURI_BUNDLER_TOOLS_GITHUB_MIRROR` 与 `TAURI_BUNDLER_TOOLS_GITHUB_MIRROR_TEMPLATE`。实测生效的是**前缀式 `TAURI_BUNDLER_TOOLS_GITHUB_MIRROR=https://gh-proxy.com/`**（打包输出 `Downloading https://gh-proxy.com/https://github.com/tauri-apps/binary-releases/releases/download/nsis-3.11/nsis-3.11.zip`）。skill 写的 `_TEMPLATE` 变量名存在，但**模板值需含 `{{url}}` 占位符**（skill 未写明格式，用户设前缀会失效）。「手动从 NSIS 官网下载 nsis-3.x.zip」**不完整**：tauri 还需要 `nsis_tauri_utils.dll`（来自 tauri-apps/nsis-tauri-utils），官方 NSIS zip 里没有。
8. **哨兵模式**：本会话未按「subagent」形式执行，用等价的后台 job+轮询。**误判实例 3 次**：① xwin 直连下载 120s 无输出，看似「源慢」，实为 GitHub CDN 被墙（换 gh-proxy 3.8s 完成）；② LLVM 安装器 `Start-Process -Wait` 永久挂起，看似「还在装」，实为卡 UAC；③ `cargo build > log 2>&1` 重定向把输出截断成 33 行，panic 信息丢失，看似「编译慢」。→ skill 的超时判据方向正确，但需补充「卡 UAC」「输出重定向截断」两类误判识别。

## D. Rust/Tauri 编译（skill 第四章 cfg(windows)）

1. **skill 的 resources/lib.rs 实测编译：`cargo check` exit=0**（1m40s），唯一输出 `warning: unused import: Path`（lib.rs:12）。**结论：skill 第七章「Windows 分支未经验证、首次编译若报错按编译器提示修正」不成立——直接编译通过**。本会话早期遇到的两个编译错误（`DshSpawnError` 缺 Debug E0277、`PathBuf`/`&Path` E0308）是我**另行重写**代码引入的，与 skill 原版无关（skill 用 `Result<Child,String>` 规避了）。
2. `creation_flags(0x0800_0000)`：编译通过；release 对照实验（release app 自身无控制台）运行期间 conhost 18→19（+1，噪声级），全程无黑窗目击。
3. `find_node`/`find_dsh_bin_js` 实测命中层级：正常 PATH 下命中 **② PATH**（`D:\node\node.exe`）；受限 PATH（仅 system32+SystemRoot）下命中 **① DSH_NODE**。**skill 候选清单缺「非标准盘符 node 安装位置」**（本机 D:\node 只能靠 PATH/DSH_NODE 兜底）。
4. **skill 代码逻辑缺陷（编译不报错，运行才会）**：
   - `find_node`/unix `find_dsh_bin` 对版本目录用 `dirs.sort()` **字符串排序**：`v9.11.0` 会排在 `v22.12.0` 之后（'9'>'2'），`.rev()` 取「最新」会取错（应 semver 解析比较；本机无 nvm 未触发）。
   - setup 中 spawn 失败：先 `show_error("not-found")`（把一切错误归为「未找到」），随后 `wait_ready_and_navigate` 看到 `spawn_failed` 又 `show_error("spawn-failed")` —— **错误页被二次导航覆盖，且 not-found/spawn-failed 原因错配**。实测已在本会话修正（区分 NotFound/Other + 拉起失败时跳过轮询导航）。
5. **「dsh.cmd shim 不能直接 CreateProcess（引号转义坑）」实测不成立**：用 rustc 1.97.1 写最小程序 `Command::new(r"C:\...\npm\dsh.cmd").arg("--version").spawn()`，实测输出 `0.1.0-rc.6`、`spawn OK, status=Ok(...)`。**Rust ≥1.77 的 std 对 .bat/.cmd 自动用 `cmd.exe /c` 包装执行**。`node <bin.js>` 直跑方案仍推荐（少一层 cmd 包装、输出转发直接），但 skill 的**理由需改写**。
6. 窗口 label / 托盘 / 通知 / 单实例：编译与运行正常（托盘点击行为无法无头验证，见 G）。

## E. 桌面壳运行验收（skill 第六章）

1. **A 复用**（3080）：exit=0 / 10.5s；日志：
   ```
   [INFO] 已有服务在监听，直接复用 http://127.0.0.1:3080
   [INFO] 已导航到 http://127.0.0.1:3080/
   ```
   3080 owner 前后均为 pid 34544（**未误杀**）✓
2. **B 拉起+回收**（3081）：exit=0 / 10.7s；日志含 spawn → `[dsh] dsh web: http://127.0.0.1:3081` → 导航 → `正在停止 dsh 子进程`；退出后 `Get-NetTCPConnection -LocalPort 3081 -State Listen` **为空**（TerminateProcess 回收干净）✓
3. **C 受限 PATH**（3082，`$env:PATH="$env:SystemRoot\system32;$env:SystemRoot"` + DSH_NODE）：exit=0 / 9.8s，完整 spawn→导航→回收，3082 空闲 ✓
4. `DSH_DESKTOP_AUTO_QUIT` 钩子：三次实测总耗时 9.8~10.7s（8s 钩子 + 1~2.7s 启动/回收开销）✓
5. Web GUI 渲染：`http://127.0.0.1:3080/` 实测 `http=200 size=12076 time=0.003s`，HTML 含 `window.__DSH_BOOT__` 完整插件清单注入 ✓（SSE/交互无法无头验证，页面与插件脚本清单均正常返回）

## F. 打包与分发（skill 第六章/第七章）

1. 产物：`msi/DeepSeek Harness Desktop Desktop_0.2.1_x64_zh-CN.msi` **3.35MB**、`nsis/DeepSeek Harness Desktop Desktop_0.2.1_x64-setup.exe` **2.23MB**。release 编译 4m49s（首次）/ 1m19s（增量）。
2. **skill 自己的 tauri.conf.json 缺 `bundle.windows.wix.language = "zh-CN"`** → 按 skill 第六章 `pnpm tauri build`（targets:all）在中文 productName 下 **MSI 步骤必失败**（实测 `light.exe` 退出、复现输出 `error LGHT0311: ... characters that are not available in the specified database code page '1252'`）。加上 `"windows": {"wix": {"language": "zh-CN"}}` 后成功。
3. NSIS 安装器：`/S` 静默安装 **exit 0、免管理员（currentUser）**，装到 `%LOCALAPPDATA%\DeepSeek Harness Desktop Desktop\`（`dsh-desktop-tauriapp.exe` + `uninstall.exe`），开始菜单自动建「DeepSeek Harness Desktop Desktop.lnk」；**桌面快捷方式不会自动建**（实测用 WScript.Shell COM 手动创建成功）。**注意 skill 第六章 C 验收写的 `& "<bundle>\DeepSeek Harness Desktop Desktop.exe"` 与实际不符：产物 exe 名是 `dsh-desktop-tauriapp.exe`**（crate 名），不存在「DeepSeek Harness Desktop Desktop.exe」。
4. SmartScreen：本机本地构建的 exe（无 MOTW 网络标记）直接运行/安装**未触发任何 SmartScreen 提示**。skill「未签名 exe 首跑弹蓝色警告」**不准确**：SmartScreen 只针对「从网络下载带 MOTW 的文件」；本地产物不会触发。
5. 双击场景：安装后的 exe 烟测（AUTO_QUIT）正常复用 3080、exit 0 ✓。

## G. 托盘/窗口行为（skill 第七章）

1. 关闭按钮隐藏/托盘左键右键/溢出区/首次通知：**无头环境无法点击验证**（代码路径存在：CloseRequested prevent+hide、TrayIconBuilder 左键 show）。诚实标注为「未实测」。
2. 单实例：起第二个实例实测 **0.1s 即退出（exit 0）**，第一实例继续运行 ✓。
3. 窗口状态记忆：`%APPDATA%\com.arcreel.dsh-desktop-tauriapp\.window-state.json`（0.2KB）实测存在 ✓。
4. 日志文件：`%LOCALAPPDATA%\com.arcreel.dsh-desktop-tauriapp\logs\dsh-desktop-tauriapp.log` ✓ 与 skill 一致。

---

## H. skill 修订清单（给原作者）

1. **二·2节** · 「配置后先 `cargo search serde` 验证连通」→ 改为「`cargo search serde --registry crates-io` 或直接 `cargo fetch`」→ 实测：rsproxy 替换后裸 `cargo search serde` 直接报错 `crates-io is replaced with non-remote-registry source registry 'rsproxy-sparse'`。
2. **二·0节** · 「速度 <100KB/s 的源直接弃用」→ 探针文件换成大文件（≥10MB，如 rustup-init.exe），或删除绝对阈值 → 实测三健康源小文件测速全部 <100KB/s（677/41/438 B/s），按原判据会把健康源全误杀。
3. **二·0节 时长表** · `npm i -g @deepseek-ai/dsh ~100MB 2min` → 改「~530 包 2min」→ 实测 `added 530 packages in 2m` 恰好卡线；rustup 5min、图标 30s 实测合理（rsproxy 1.45MB/s）；`cargo fetch 5min` 无法精确验证（实测下载非瓶颈，首次 release 编译 4m49s 才是大头），建议标注「编译另计」。
4. **二·5节** · VS Build Tools「winget install ... --override --add ...VCTools」→ 补充「**无管理员时不可用**，走替代方案：xwin splat（CRT/SDK）+ cargo config `linker=rust-lld` + LLVM 解压的 clang-cl + NuGet `Microsoft.Windows.SDK.BuildTools` 的真 rc.exe」→ 实测本机无管理员、无 VS，替代方案完整跑通构建与打包。
5. **二·5节** · `TAURI_BUNDLER_TOOLS_GITHUB_MIRROR_TEMPLATE` → 改为推荐 `TAURI_BUNDLER_TOOLS_GITHUB_MIRROR=https://gh-proxy.com/`（前缀拼接，实测打包日志 `Downloading https://gh-proxy.com/https://github.com/...nsis-3.11.zip` 成功）；`_TEMPLATE` 若保留需注明值必须含 `{{url}}` 占位符 → 实测两个变量名都存在于 tauri-cli 2.11.4 二进制，生效的是前缀式。
6. **二·5节** · 「手动从 NSIS 官网下载 nsis-3.x.zip」→ 改为「手动需同时取 tauri-apps/binary-releases 的 nsis 构建 + tauri-apps/nsis-tauri-utils 的 nsis_tauri_utils.dll」→ 实测官方 NSIS zip 不含 tauri 需要的 utils DLL（二进制内下载清单：wix314-binaries.zip / nsis-3.11.zip / nsis_tauri_utils.dll）。
7. **二·4节** · 首选 ghproxy.cn → 调换为 gh-proxy.com 优先 → 实测同文件：ghproxy.cn 4.7KB/s vs gh-proxy.com 26.1KB/s（5.5 倍），且直连 raw 当前 200 OK（23.7KB/s）。
8. **四章（lib.rs）** · `dirs.sort()` 字符串排序版本目录 → 改为 semver 解析比较 → 实测逻辑审查：字符串排序下 `v9.11.0` 排在 `v22.12.0` 之后，`.rev()` 取「最新版本」会取错（本机无 nvm 未触发，属潜伏 bug）。
9. **四章（lib.rs）** · setup 的 spawn 失败处理「`show_error("not-found")` + 轮询任务再 `show_error("spawn-failed")`」→ 改为区分 NotFound/Other 两种原因、spawn 失败后跳过轮询导航 → 实测逻辑审查：错误页会先跳 not-found 再被 spawn-failed 覆盖，且「拉起失败」被误报为「未找到」。
10. **四章** · 「dsh.cmd shim 不能直接 CreateProcess（引号转义坑）」→ 改为「Rust ≥1.77 的 `Command` 对 .cmd 自动以 `cmd.exe /c` 包装，实测可直接 spawn；仍推荐 `node <bin.js>` 直跑——少一层 cmd 包装、输出转发更直接」→ 实测 rustc 1.97.1 最小程序 `Command::new("dsh.cmd")` spawn 成功输出 `0.1.0-rc.6`。
11. **四章（tauri.conf.json）** · 补 `"bundle": {"windows": {"wix": {"language": "zh-CN"}}}` → 实测缺省 en-US（codepage 1252）在中文 productName 下 `light.exe` 报 LGHT0311，MSI 必失败。
12. **七章** · 「Windows 分支未经 macOS 交叉验证：Windows 上首次编译若报错按编译器提示修正」→ 改为「已实测：x86_64-pc-windows-msvc 下 `cargo check` 通过（仅 unused import `Path` 一条警告）」→ 实测 exit=0，1m40s。
13. **七章** · 「未签名 exe 首跑弹蓝色警告」→ 改为「仅**网络下载带 MOTW** 的未签名 exe 才触发 SmartScreen；本地构建/本机安装不触发」→ 实测本地 exe 与 setup.exe 运行安装均无提示。
14. **六章** · win 验收 C 命令 `& "<bundle>\DeepSeek Harness Desktop Desktop.exe"` → 改为 `& "$env:LOCALAPPDATA\DeepSeek Harness Desktop Desktop\dsh-desktop-tauriapp.exe"`（安装产物）或 `<release>\dsh-desktop-tauriapp.exe` → 实测产物 exe 名是 crate 名 `dsh-desktop-tauriapp.exe`，不存在「DeepSeek Harness Desktop Desktop.exe」。
15. **一章 Windows 节** · 补「首次 `dsh web`：约 4s 就绪，stdout 单行 `dsh web: http://127.0.0.1:<port>`，stderr 空」；补「PowerShell 5.1 读 UTF-8 日志：`[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8)`（默认 GBK 显示乱码）」→ 实测 4.0s / 单行输出 / chcp=936 下 Get-Content 乱码。
16. **一章 Windows 节** · nvm-windows 主路径 → 增加「官方安装器装任意盘符（如 D:\node）+ 确认 node.exe 在 PATH」作为等价第一路径 → 实测本机即此形态，且 find_node 的 PATH 探测可命中。
17. **五章** · 「复制 icons/256x256.png 为 src/icon.png」→ 改为「tauri icon 不生成 256x256.png（实测生成 128x128@2x.png 即 256 像素 + 512 的 icon.png）；用 128x128@2x.png 或 Pillow 直接生成 256x256」→ 实测 tauri icon 2.11.4 输出清单无 256x256.png。
18. **九章** · 桌面端与会话关系 → 实测一致（会话存储 `%USERPROFILE%\.dsh\sessions\--E-deepseek--\session-*.jsonl.zstd` 存在且持续写入；3080 复用 pid 稳定），无需改。
19. **三章** · `npm create tauri-app@latest` 命令 → 未实测（本机按等价结构手工搭建）；建议补一条手工搭建说明 → 实测手工方案（package.json + src + src-tauri）构建通过。
20. **二·0节 哨兵** · 补两类误判识别：①`Start-Process -Wait` 挂起 = 安装器卡 UAC（非网络）；②`cargo build >log 2>&1` 会截断输出（实测日志仅 33 行、panic 丢失），哨兵应以 stdout 直接采集或 panic-hook 兜底 → 实测两种误判均发生。

**一致（无需改）**：第一章 `Get-Command dsh → dsh.ps1` 的断言；防火墙 127.0.0.1 不弹窗；MAX_PATH 处理；WSL2 建议；第二章 rsproxy cargo 配置、RUSTUP_DIST_SERVER 用法与 rustup 5min 上限；第四章托盘/插件顺序/退出回收设计（编译运行均正常）；第六章 A/B/C 验收的期望日志与端口检查命令（实测全部命中）；第七章托盘溢出区提示；第八章 README 必写项清单；capabilities 的 `notification:default` 实测有效。

## 总评

**可用度：7 / 10。**

- 骨架可靠：lib.rs 实测编译通过、六章三条验收路径在本机全绿、镜像清单与坑列表大部分准确。
- 扣 3 分：①**无管理员场景零覆盖**（VS Build Tools 假设在本机直接失效，是本环境唯一可行的路径却没写，占 1.5 分）；②skill 自带的 tauri.conf.json 缺 zh-CN 配置，导致第六章命令在中文 productName 下必失败（占 1 分）；③若干过时/不准的细节（dsh.cmd 理由、SmartScreen 触发条件、cargo search 验证命令、测速阈值、256x256.png、DeepSeek Harness Desktop Desktop.exe 路径）累加占 0.5 分。
