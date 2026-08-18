# Deepseek Harness · Windows 验收脚本（三条路径，源自实测验收清单）
# 用法：.\scripts\acceptance.ps1 [-Bin target\debug\dsh-desktop.exe] [-Port 3080]
param(
    [string]$Bin = "target\debug\dsh-desktop.exe",
    [int]$Port = 3080
)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

function Run-Case {
    param([string]$Name, [string]$LogName, [scriptblock]$Setup, [string]$TargetBin, [int]$TargetPort)
    Write-Host "=== [$Name] ==="
    & $Setup
    $log = Join-Path $env:TEMP "xnl-accept-$LogName.log"
    $proc = Start-Process -FilePath $TargetBin -PassThru -Wait -NoNewWindow
    # 输出重定向由 Setup 内 env 化处理，日志经 stdout；release 为 GUI 子系统无 stdout
    Write-Host "exit=$($proc.ExitCode)"
}

# A 复用路径
$listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listening) {
    $env:DSH_DESKTOP_AUTO_QUIT = "1"
    Write-Host "=== [A-复用] ==="
    $p = Start-Process -FilePath $Bin -PassThru -NoNewWindow -RedirectStandardOutput "$env:TEMP\xnl-a.log" -RedirectStandardError "$env:TEMP\xnl-a.err"
    $p.WaitForExit()
    Write-Host "exit=$($p.ExitCode)"
    Get-Content "$env:TEMP\xnl-a.log" | Select-String -Pattern "复用|导航" | Select-Object -First 4
    Remove-Item Env:\DSH_DESKTOP_AUTO_QUIT
} else {
    Write-Host "=== [A-复用] 跳过：$Port 无现有服务 ==="
}

# B 拉起 + 回收
$next = $Port + 1
$env:DSH_DESKTOP_PORT = "$next"
$env:DSH_DESKTOP_AUTO_QUIT = "1"
Write-Host "=== [B-拉起回收] ==="
$p = Start-Process -FilePath $Bin -PassThru -NoNewWindow -RedirectStandardOutput "$env:TEMP\xnl-b.log" -RedirectStandardError "$env:TEMP\xnl-b.err"
$p.WaitForExit()
Write-Host "exit=$($p.ExitCode)"
Get-Content "$env:TEMP\xnl-b.log" | Select-String -Pattern "dsh web|导航|停止" | Select-Object -First 4
Start-Sleep -Seconds 1
$left = Get-NetTCPConnection -LocalPort $next -State Listen -ErrorAction SilentlyContinue
if ($left) { Write-Host "FAIL: 端口 $next 未回收"; exit 1 }
Write-Host "端口 $next 已回收 ✓"
Remove-Item Env:\DSH_DESKTOP_PORT, Env:\DSH_DESKTOP_AUTO_QUIT

# C GUI 启动场景（受限 PATH；release 为 GUI 子系统，用 dsh-desktop.exe 本体）
$releaseExe = "src-tauri\target\release\dsh-desktop.exe"
if (Test-Path $releaseExe) {
    $next2 = $Port + 2
    $env:PATH = "$env:SystemRoot\system32;$env:SystemRoot"
    $env:DSH_DESKTOP_PORT = "$next2"
    $env:DSH_DESKTOP_AUTO_QUIT = "1"
    Write-Host "=== [C-受限PATH] ==="
    $p = Start-Process -FilePath (Resolve-Path $releaseExe) -PassThru
    $p.WaitForExit()
    Write-Host "exit=$($p.ExitCode)"
    Start-Sleep -Seconds 1
    $left = Get-NetTCPConnection -LocalPort $next2 -State Listen -ErrorAction SilentlyContinue
    if ($left) { Write-Host "FAIL: 端口 $next2 未回收"; exit 1 }
    Write-Host "端口 $next2 已回收 ✓"
} else {
    Write-Host "=== [C-受限PATH] 跳过：未找到 release 产物（先 pnpm tauri build）==="
}

Write-Host "验收完成 ✓"
