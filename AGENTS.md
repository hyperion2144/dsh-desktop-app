# AGENTS.md —— DeepSeek Harness Desktop（dsh-desktop-tauriapp）

给 AI 编码代理的工作手册。所有条目均来自代码/构建/日志验证，未验证的不写。

## 项目简介

把 DeepSeek Harness Web GUI（dsh）封装成 Tauri 2 桌面应用（macOS + Windows）：
双击启动 → 探活/拉起本地 dsh web（默认端口 3080，可在设置中改）→ 主窗口加载 Web GUI
→ 托盘常驻 → 退出回收子进程。仓库同时是 dsh 插件包（根 package.json 的 dsh.client 声明
浏览器侧 client），桌面壳把插件经 --patch 注入 dsh web profile（不写 profile bundles）。

## 常用命令

- npm run build:client        （根目录；必先于桌面构建，build.rs 会把根 lib/ 内嵌进应用）
- cd desktop && npm run tauri dev   （开发运行）
- cd desktop && npm run build       （等价 tauri build，产 release .app/.dmg）
- cd desktop/src-tauri && cargo check  （快速编译检查）
- desktop/scripts/acceptance.sh       （macOS 三条路径验收：复用/拉起回收/受限 PATH）
- desktop/scripts/acceptance.ps1      （Windows 对应）
- 发布链：提交 → 三处升版本 → git tag vX.Y.Z && push → CI（.github/workflows/release.yml）
  → CI 出 draft release 后：gh release edit vX.Y.Z --draft=false --latest

## 版本号三处同步

- desktop/src-tauri/Cargo.toml（version）
- desktop/src-tauri/tauri.conf.json（version）
- 根 package.json（version）
提交信息风格：feat(desktop): ... / fix(desktop): ... / chore: 0.x.y。

## 代码风格与约定

- Rust 注释用中文；核心逻辑在单文件 desktop/src-tauri/src/lib.rs（约 2400 行，按功能分区）。
- 异步统一走 tauri::async_runtime::spawn；阻塞操作（如 dsh plugin add）用 spawn_blocking。
- 托盘菜单「刷新」= refresh_tray_mode（现在重建整个菜单，不是只刷标签）。
- 状态机：STATUS_* 常量 + set_status（写 DshState + emit dsh-status 事件）。
- 新 Tauri 命令必须三步：generate_handler! 注册 + permissions/app-commands.toml 加 allow-*
  （标识符连字符、commands.allow 用下划线命令名）+ capabilities（default/pet/remote-desktop
  按需）+ 提交时带上 gen/schemas 变更（构建自动再生成，需一起入库）。
- client 用 esbuild（scripts/build-client.mjs）产 lib/client.js；DOM 注入式 UI 放
  src/client/local-chrome.ts（侧边栏状态条等），槽位注入处用 React 组件。

## 目录结构

- src/client/ —— 浏览器侧插件 client（index / advanced-shell / local-chrome /
  external-links / styles；=外链拦截、局部拖拽 chrome、状态条）
- desktop/src-tauri/ —— Rust 桌面壳主体
  - src/lib.rs 全部逻辑；build.rs 负责在构建期 staging 内嵌插件（embedded/，gitignore）
  - capabilities/ —— default.json（主窗本地）、pet.json（桌宠）、remote-desktop.json（远程页 ACL）
  - permissions/app-commands.toml —— 应用自命令权限清单
- desktop/scripts/ —— 验收脚本与 Windows 无管理员工具链模板
- docs/ —— 设计与审计；docs/desktop-guardian-profile-remote-design.md 为托盘三件套设计稿
- .github/workflows/release.yml —— tag v* 双平台构建 + draft release + 自动 release notes
- SKILL.md / README.md（README 部分描述已过时：实际已改为 --patch 注入 + 局部 chrome，
  不再 plugin add / 接管 root slot；以代码为准）

## 已知注意事项（血泪坑）

1. settings.yaml 键名：持久化用 $DSH_HOME/settings.yaml 顶层键 dsh-desktop-tauriapp:。
   绝不要写 desktop:（历史 bug：save/load 键不一致导致配置失效与互相覆盖；已有
   legacy_desktop_block 迁移 + 保存清理）。当前实现整体 serde_yaml 回写会丢注释，
   若 dsh 配置出现注释需改行级合并。
2. spawn 参数顺序：--patch 必须排在 --no-open / --host / --port 之前（dsh CLI
   passThrough 会把靠后的 --patch 透传给 web-app 报 unknown option）。
3. 单实例约束：同一 profile 的 dsh web 同时只能一个（task-board ledger 全局锁）；
   已有外部实例时应走「复用/兼容」路径，调试勿并行拉第二个。
4. 守护器判活：健康=TCP 连接成功即可（勿改回 HTTP 判死——会因 EOF/慢响应误重启，
   曾引发无限自愈循环）；复用外部/远程只提示不代拉；自愈 3 次封顶。
5. 远程页面 IPC：Tauri 2.11 对 remote origin 强制 ACL，应用自命令也需在
   remote-desktop.json 显式 allow；远程高级模式需远程已装本插件（navigate_remote 有预检提示）。
6. Windows：本地无 windows 编译目标，Windows 编译/产物由 CI 把关；open_external 走
   ShellExecuteW（windows-sys 已启用 Win32_UI_Shell / WindowsAndMessaging）。
7. 本地 dmg 打包时常失败（bundle_dmg.sh，hdiutil 残留挂载），.app 不受影响，dmg 以
   CI 产物为准；失败时 hdiutil detach 清理 bundle/macos/rw.*.dmg 再试。
8. 注入样式慎用 hash 类名：dsh 各 client 包的 css module 类名随版本漂移；优先用稳定标记
   （role/aria、data-*），例：设置弹窗 tab 列滚动修复即用 role=dialog + nav 结构定位。
