# Windows 安装经验与坑（实战记录）

> 本次在一台「无管理员权限 + 无 VS Build Tools + 国内网络」的 Windows 11 机器上，
> 从零把「DeepSeek Harness Desktop Desktop」Tauri 2 应用构建出来并安装到桌面。以下是踩过的坑与最终方案。

## 0. 结论速览

- 目标产物全部达成：`DeepSeek Harness Desktop Desktop_0.2.1_x64_zh-CN.msi` + `DeepSeek Harness Desktop Desktop_0.2.1_x64-setup.exe`，
  验收 A（复用）/B（拉起+回收）/C（受限 PATH）全绿。
- 关键判断：**Windows 上不装 Visual Studio Build Tools 也能完整构建 Tauri 2**
  （Rust MSVC 目标 + xwin 的 CRT/SDK + rust-lld + clang-cl + 真 rc.exe），
  全部用户级安装，无需管理员。
- 网络是最大变量：GitHub 直连基本不可用，全部走国内镜像后稳定。

## 1. 网络与国内源（消耗时间最多）

| 现象 | 结论/方案 |
| --- | --- |
| `curl.exe`/`Invoke-WebRequest` 报 `SEC_E_NO_CREDENTIALS`，PowerShell 的 `Invoke-WebRequest` 报「基础连接已经关闭」 | 受限 token 下 Windows Schannel 拿不到凭据；`node` 用自带 OpenSSL 不受影响。切到 full-access 策略后 Schannel 恢复 |
| `raw.githubusercontent.com` ECONNRESET、`github.com/releases/download/...` 卡死 | GitHub 直连不可用；`api.github.com`（查 release 元数据）可用 |
| 需要下 GitHub release 资产 | 镜像前缀 `https://gh-proxy.com/` + 原 URL（试过 ghfast.top / ghproxy.net / mirror.ghproxy.com / gh.llkk.cc，只有 gh-proxy.com 能满速） |
| cargo 拉 crate 慢 | `~/.cargo/config.toml` 里 `[source.crates-io] replace-with = "rsproxy-sparse"` → `sparse+https://rsproxy.cn/index/` |
| rustup 下载工具链慢 | `RUSTUP_DIST_SERVER=https://rsproxy.cn`、`RUSTUP_UPDATE_ROOT=https://rsproxy.cn/rustup` |
| nuget.org | 302 自动跳到 `nuget.azure.cn`（国内镜像），直接可用 |
| tauri 打包时下载 NSIS/WiX | env `TAURI_BUNDLER_TOOLS_GITHUB_MIRROR=https://gh-proxy.com/` |

排查技巧：DNS 正常但 TLS 报凭据错误 → 是 Schannel/权限问题不是断网；
`curl.exe -v 2> err.txt` 把 stderr 落盘看真实错误。

## 2. 无管理员工具链搭建（核心）

约束：无管理员 → VS Build Tools（需 UAC）装不了；但 Tauri 依赖树里唯一的
C++ 是 `vswhom-sys`（tauri-build → tauri-winres → embed-resource 链），只需一个
MSVC 兼容编译器，不需要完整 VS。

最终组合（全部用户目录，无需管理员）：

| 组件 | 工具 | 来源 | 坑 |
| --- | --- | --- | --- |
| 工具链 | `rustup stable-msvc`（`--no-modify-path`，手动管 PATH） | rsproxy | 无 |
| MSVC CRT + SDK 头/库 | `xwin --accept-license splat --output %HOME%\.xwin --disable-symlinks` | 预编译二进制（gh-proxy） | 见下 |
| 链接器 | `rust-lld`（rustup 自带，113MB） | 工具链内 | 作为 MSVC linker 直接可用 |
| C++ 编译器 | `clang-cl`（LLVM 22） | 官方 NSIS 安装器用 7-Zip **解压免安装** | 见下 |
| 资源编译器 | 微软真 `rc.exe` + `rcdll.dll` | NuGet `Microsoft.Windows.SDK.BuildTools`（nupkg 即 zip） | llvm-rc 不行，见 §3 |

cargo 侧在 `~/.cargo/config.toml` 固化：

```toml
[env]
INCLUDE = "<.xwin>/crt/include;<.xwin>/sdk/include/ucrt;<.xwin>/sdk/include/um;<.xwin>/sdk/include/shared;..."
LIB     = "<.xwin>/crt/lib/x86_64;<.xwin>/sdk/lib/ucrt/x86_64;<.xwin>/sdk/lib/um/x86_64"
CC      = "<llvm>/bin/clang-cl.exe"
CXX     = "<llvm>/bin/clang-cl.exe"
RC      = "<tools>/rc.exe"            # 必须真 rc.exe

[target.x86_64-pc-windows-msvc]
linker  = "<rustup>/toolchains/stable-x86_64-pc-windows-msvc/lib/rustlib/x86_64-pc-windows-msvc/bin/rust-lld.exe"
```

### xwin 的三个坑

1. **鸡生蛋**：`cargo install xwin` 连编译 build script 都要链接器，没链接器装不了 →
   直接下载 GitHub 预编译二进制（3MB，走 gh-proxy）。
2. **跨盘 move**：xwin 缓存默认落在当前工作目录所在盘，`splat` 输出到另一盘时
   `move` 报 os error 17 → 用 `--copy`（复用缓存跨盘拷贝）或同盘输出；
   `--cache-dir` 是**全局选项**，必须放在 `splat` 之前。
3. **符号链接特权**：splat 最后建 `sdk\include\10.0.26100 → .` 符号链接失败
   （os error 1314，无管理员）→ 退出码 1 但 CRT/SDK 文件已齐全，Rust 不需要
   该 symlink，**忽略即可**。
4. xwin 只给头+库，**不含 cl.exe/rc.exe**。

### LLVM 与 7-Zip 的坑

- LLVM 官方安装器是 NSIS，静默安装卡在 UAC（`Start-Process -Wait` 永久挂起）→
  用 7-Zip 解压安装器拿 `clang-cl.exe`（100MB，静态链接可直接跑）。
- 独立版 `7za.exe` **不支持解 NSIS**；完整版 `7z.exe` 的获取：官方 **MSI** 用
  `msiexec /a xxx.msi /qn TARGETDIR=...`（管理型解包）免管理员抽取 7z.exe + 7z.dll。
- 同理，Python 可用 `winget install Python.Python.3.12 --scope user`（免管理员）。

## 3. 编译期坑

1. **vswhom-sys 要 C++ 编译器**：「纯 Rust 无需 cl.exe」的假设错了——
   tauri-build 的 Windows 资源嵌入链里有 C++ 代码，必须给 `CC`/`CXX=clang-cl`。
2. **llvm-rc 编不了中文**：`#pragma code_page(65001)`（UTF-8）的 .rc 它报
   「Non-ASCII 8-bit codepoint can't be interpreted in the current codepage」→
   **必须微软真 rc.exe**（能正确处理 65001）。rc.exe 还依赖同目录 `rcdll.dll`，
   两个文件要放一起。embed-resource 通过 `RC`/`RC_$TARGET` 环境变量定位它
   （不设才去注册表找 SDK）。
3. **build script 的 panic 信息会丢**：`cargo build > log 2>&1` 重定向后
   stderr 段神秘消失（日志只有 33 行，panic 原因完全看不到）。定位手段：给
   `build.rs` 加自定义 `panic::set_hook` 把 panic 打到 **stdout**，cargo 必然
   显示；拿到根因后还原。
4. **中文产品名进 .rc 是 UTF-8**：控制台按 GBK 显示成「灏忓崡姊」是显示问题，
   文件本身正确；不要被乱码带偏。
5. 链接期刷屏的 `rust-lld: Cannot use debug info for 'libcmt.lib(...)' LNK4099`
   是无害警告（xwin 的 lib 缺 PDB），可忽略。

## 4. 打包坑

1. **MSI 中文 codepage**：默认 en-US 的 MSI 数据库 codepage 1252 编不了中文，
   `light.exe` 报 `LGHT0311` → `tauri.conf.json` 设
   `bundle.windows.wix.language = "zh-CN"`（codepage 936），产物变成
   `DeepSeek Harness Desktop Desktop_0.2.1_x64_zh-CN.msi`。
2. **NSIS/WiX 工具下载**走 GitHub → 用 `TAURI_BUNDLER_TOOLS_GITHUB_MIRROR`
   镜像前缀（见 §1）。
3. **产物自包含**：Rust MSVC 默认静态链 CRT（libcmt/libvcruntime），release exe
   只依赖系统 DLL + UCRT api-set（Win10+ 自带），**无 vcruntime140.dll 依赖**；
   WebView2 loader 也静态链入（运行时仍需系统 WebView2 Runtime）。

## 5. 运行与验收坑

1. **错误分支的早 return**：spawn 失败分支如果提前 `return`，会跳过托盘构建与
   测试钩子 → 错误页下用户关窗后应用不可达、AUTO_QUIT 不生效（进程挂住）。
   改成标志位后统一走到托盘+钩子。
2. **验收 C 的非标准 node 位置**：本机 node 在 `D:\node`（不在 spec 的兜底目录
   nvm-windows / Program Files\nodejs）→ 受限 PATH 下用 `DSH_NODE` 环境变量指定；
   dsh 的 bin.js 则靠 `%APPDATA%\npm` 固定目录兜底（不依赖 PATH）。
3. **release 是 GUI subsystem**：PowerShell 里 `& exe` 不等待即返回，
   自动化验收要用 `Start-Process -PassThru; .WaitForExit()`。
4. **日志是 UTF-8**：`Get-Content` 按系统 ANSI（GBK）显示中文乱码 →
   `[IO.File]::ReadAllText($path, [Text.Encoding]::UTF8)`。
5. **无害噪音**：退出时 WebView2 打 `Failed to unregister class Chrome_WidgetWin_0
   (1412)`，可忽略；单实例锁会导致第二个实例直接退出，跑验收前先确认无旧实例
   （`Get-Process dsh-desktop-tauriapp`）。
6. **桌面快捷方式**：无管理员也能用 WScript.Shell COM 创建 `.lnk`（图标取
   `exe,0` 内嵌图标），桌面路径用 `[Environment]::GetFolderPath('Desktop')`
   兼容 OneDrive 重定向。

## 6. 安装行为（NSIS，用户级）

- `DeepSeek Harness Desktop Desktop_0.2.1_x64-setup.exe /S` 静默安装，**默认按当前用户、免管理员**；
  位置 `%LOCALAPPDATA%\DeepSeek Harness Desktop Desktop\`，exe 名保持 `dsh-desktop-tauriapp.exe`，附带
  `uninstall.exe` 卸载器，开始菜单自动建「DeepSeek Harness Desktop Desktop」快捷方式；桌面快捷方式需
  手动创建（见 §5.6）。

## 7. 备忘清单（新机器快速复现）

1. rustup（rsproxy）+ 全局 `npm i -g @deepseek-ai/dsh`
2. xwin 预编译二进制 → splat 到 `~/.xwin`
3. LLVM 安装器 7z 解压 → `~/.llvm-x`；NuGet SDK BuildTools → 真 rc.exe + rcdll.dll → `~/tools`
4. `~/.cargo/config.toml` 固化 INCLUDE/LIB/CC/CXX/RC/linker（见 §2）
5. `desktop\scripts\build-env.ps1`（PATH + GitHub 镜像）→ `pnpm install` → `pnpm tauri build`
6. 打包镜像：`TAURI_BUNDLER_TOOLS_GITHUB_MIRROR=https://gh-proxy.com/`
