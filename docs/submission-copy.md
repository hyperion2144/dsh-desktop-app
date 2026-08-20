# 收录申请文案（提交到各聚合列表时复制使用）

## 项目

- 名称：DeepSeek Harness Desktop Desktop（dsh-desktop-tauriapp）
- 一句话：把 DeepSeek Harness 封装成 Tauri 2 桌面应用的技能包与源码（macOS + Windows 双平台）
- 仓库：https://github.com/<你的账号>/dsh-desktop-tauriapp

## 简介（中文）

「DeepSeek Harness Desktop Desktop」是 DeepSeek Harness（DSH）的桌面壳：Tauri 2 实现，11MB 体积，
双击即拉起本地 `dsh web` 服务并托盘常驻，浏览器与桌面端共用同一份会话存储，
上下文无缝衔接。仓库同时提供 Claude/DSH 兼容的 SKILL.md 技能包，内含
macOS/Windows 双平台安装经验、国内镜像加速配置、subagent 哨兵下载判定机制，
以及 Windows 无管理员环境（无 VS Build Tools）的完整替代工具链方案。

## 简介（English）

XiaoNanLiang (dsh-desktop-tauriapp) wraps the DeepSeek Harness web GUI in a Tauri 2
desktop shell (macOS & Windows, ~11MB): double-click to boot the local `dsh web`
service with tray-resident lifecycle management, sharing the same session store
as the browser. Ships as a Claude/DSH-compatible SKILL.md skill with dual-platform
install playbooks, China mirror bootstrap, a subagent sentinel for download
timeouts, and an admin-free Windows toolchain recipe (no VS Build Tools needed).

## 分类建议

- DeepSeek Harness 生态：桌面端 / 技能（skill）
- 关键词：deepseek-harness, dsh, tauri, desktop, skill, china-mirror, windows
