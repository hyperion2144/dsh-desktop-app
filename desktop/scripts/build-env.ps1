# DeepSeek Harness Desktop · Windows 构建环境脚本（实测：Win11 无管理员 + 国内网络）
# 用法：. .\scripts\build-env.ps1    （注意用点号加载，让环境变量进当前会话）
# 来源：docs/windows-build-notes.md §7 备忘清单

$ErrorActionPreference = "Stop"

Write-Host "[DeepSeek Harness Desktop] 配置构建环境..."

# 1. GitHub 下载镜像（tauri 打包 NSIS/WiX、cargo git 依赖等）
$env:TAURI_BUNDLER_TOOLS_GITHUB_MIRROR = "https://gh-proxy.com/"

# 2. 常见工具目录（按实际安装位置修改）
$NodeDir   = if (Test-Path "D:\node") { "D:\node" } elseif (Test-Path "$env:ProgramFiles\nodejs") { "$env:ProgramFiles\nodejs" } else { "" }
$CargoBin  = "$env:USERPROFILE\.cargo\bin"
$XwinRoot  = "$env:USERPROFILE\.xwin"
$LlvmBin   = "$env:USERPROFILE\.llvm-x\bin"
$ToolsDir  = "$env:USERPROFILE\tools"   # 真 rc.exe + rcdll.dll 所在目录

# 3. 组装 PATH（把无管理员工具链目录提到最前）
$prepend = @($NodeDir, $CargoBin, $LlvmBin, $ToolsDir) | Where-Object { $_ -and (Test-Path $_) }
$env:PATH = ($prepend -join ";") + ";" + $env:PATH

# 4. 无管理员工具链的 cargo 固化（若 ~/.cargo/config.toml 未配置则提示）
$configToml = "$env:USERPROFILE\.cargo\config.toml"
if (-not (Test-Path $configToml) -or -not (Select-String -Path $configToml -Pattern "rust-lld" -Quiet)) {
    Write-Host "[DeepSeek Harness Desktop] 提示：~/.cargo/config.toml 尚未固化无管理员工具链，"
    Write-Host "        请参照 scripts/cargo-config-no-admin.toml.example 合并配置。"
}

Write-Host "[DeepSeek Harness Desktop] 环境就绪："
Write-Host "  TAURI_BUNDLER_TOOLS_GITHUB_MIRROR = $env:TAURI_BUNDLER_TOOLS_GITHUB_MIRROR"
Write-Host "  node = $(Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)"
Write-Host "  rustc = $(Get-Command rustc -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)"
