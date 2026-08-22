# 移动端访问设计评审清单（Review Checklist）

> 用途：评审 docs/mobile-access-design.md 与 docs/prototypes/ 两个原型；全部达成后按 §4 实施。

## A. 设计文档核对（§ 指 mobile-access-design.md）
- [ ] A1 根因（cpolar 直连失败）结论认可：/api 信任栅栏仅 loopback；改写反代修复（§1.1/§10 实测 403→404）
- [ ] A2 cpolar 使用方式认可：第三方隧道一律指向 lanePort（3091）而不是 dsh 端口（§2.1/§8）
- [ ] A3 注入方式认可：dsh-mobile-nav 走共享模块池 + --patch 包名行（§1.3）；来源 git vendor（§11 npm 404）
- [ ] A4 配对协议认可：一次性限时令牌 + QR（dsh-mobile://pair?token=..&base=..）+ SSE 设备列表 + HttpOnly cookie 会话；扫码/输入地址两种入口（§1.4/§8）
- [ ] A5 传输与兼容认可：Host/Origin 改写 + WS 全透传 + randomUUID polyfill + 压缩（§1.2/§2.3/§11）
- [ ] A6 安全认可：配对令牌门禁（无密码，对齐 remote-web-ui）、令牌一次性、控制端点仅 loopback（§1.4/§3）
- [ ] A7 三端壳架构认可：Android/iOS 共用 H5 壳；鸿蒙 ArkUI+ArkWeb 独立实现、同一令牌（§2.4/§7）
- [ ] A8 许可处理认可：pocket(GPL) 只作行为参考、自行重实现；web-mobile(MIT) 保留 LICENSE vendor（§9）
- [ ] A9 端口/命名约定认可：lanePort 默认 3091、settings 键 dsh-desktop-tauriapp: 内加 lane_port（§8）

## B. 原型核对
- [ ] B1 settings-mobile-tab.html：局域网/公网（cloudflared）/内网穿透（cpolar 校验）/已配对设备 四块交互齐全
- [ ] B2 mobile-shell.html：配对管理首页（多配对/状态/进入/添加）；添加页含「扫码 / 输入地址」双入口；进入后 webview 内移动布局示意（抽屉/底部 sheet）
- [ ] B3 原型与设计文档口径一致（二维码内容、令牌/cookie 表述无出入）

## C. 开工门禁（全部 A+B 打勾后启动实施；实施顺序见 §4）
- [ ] C1 vendor：获取 dsh-web-mobile（git archive，保留 LICENSE）→ 内嵌资源 → 共享池挂载 → --patch 行
- [ ] C2 内部包 dsh-mobile-access（host：改写反代/配对令牌/设备会话 SSE/隧道；client：手机访问 Tab）
- [ ] C3 桌面壳集成：生命周期托管（随 dsh 重启恢复隧道）、第三方隧道地址校验、设置 Tab 注入
- [ ] C4 三端壳：Android/iOS H5 壳工程 + 鸿蒙 ArkUI 壳工程（令牌一致）
- [ ] C5 联调矩阵：局域网 / cloudflared 公网 / cpolar(lanePort) / 大会话压缩 / 断线重连 / 鸿蒙真机
