# 移动端访问 · 评审入口（单文件汇总）

> 打开下面 4 个文件即可完成全部评审；A/B 打勾 = 通过，随后按 C 开工。
> 无需了解历史轮次，本文件是唯一入口。

## 0. 物料清单
1. docs/mobile-access-design.md —— 设计文档（223 行，§0-§13）
2. docs/prototypes/settings-mobile-tab.html —— 设置「手机访问」Tab 原型（浏览器直接打开）
3. docs/prototypes/mobile-shell.html —— 手机壳配对管理首页原型（浏览器直接打开）
4. docs/review-checklist.md —— 核对清单（本文件 A/B 即其摘要）

## 1. 设计文档看点（按节）
- §1.1 + §10 + §12：cpolar 根因（/api 仅信任 loopback → 外部 Host 403）与改写反代修复
  （HTTP 404 放行 / WS 101 透传，均有本机实测）
- §1.3 / §9 / §11：dsh-web-mobile（MIT，npm 未发布→git vendor）不安装注入方案与许可
- §1.4 / §2.2：配对（一次性限时令牌 + QR + SSE 设备列表 + HttpOnly cookie 会话，无密码；扫码/输入地址两种入口）
- §2：架构（改写反代 lanePort 3091、cloudflared、第三方隧道校验）
- §2.4 / §7：三端壳（Android/iOS 共用 H5；鸿蒙 ArkUI+ArkWeb）与设计令牌
- §4：实施顺序五步；§13：实施前置清单

## 2. 原型看点
- settings-mobile-tab.html：局域网 / 公网(cloudflared) / 内网穿透(cpolar 校验) / 已配对设备 四块
- mobile-shell.html：配对列表（多配对/状态/进入）、添加配对、进入后移动布局（抽屉/底部 sheet）

## 3. A/B 核对（打勾即通过）
- [ ] A1 根因与修复方案认可（§1.1/§10/§12 实测为准）
- [ ] A2 cpolar 用法认可：第三方隧道一律指向 lanePort（3091）
- [ ] A3 注入方式认可：dsh-mobile-nav 走共享池 + --patch；git vendor（npm 404）
- [ ] A4 配对协议认可（令牌/QR/SSE/cookie 会话，无密码）
- [ ] A5 传输与兼容认可（Host 改写 / WS 透传 / polyfill / 压缩）
- [ ] A6 安全认可（配对令牌门禁（无密码）、控制端点仅 loopback）
- [ ] A7 三端壳架构认可（H5 共用 / 鸿蒙 ArkUI+ArkWeb / 令牌一致）
- [ ] A8 许可处理认可（pocket GPL 只参考行为；web-mobile MIT 保留 LICENSE）
- [ ] A9 端口/命名约定认可（lanePort 3091、settings 键内 lane_port）
- [ ] B1 设置 Tab 原型四块齐全
- [ ] B2 手机壳原型（配对管理 + 移动布局示意）齐全
- [ ] B3 原型与文档口径一致

## 4. 开工门禁（A/B 全勾后按 §4 执行）
C1 vendor → C2 dsh-mobile-access 包 → C3 桌面集成/设置 Tab → C4 三端壳 → C5 联调矩阵（局域网/cloudflared/cpolar/压缩/断线/鸿蒙真机）

## 5. 提交说明
以上 5 个 docs 文件均未提交；评审通过后并入「移动端访问实施」提交（或按你的指示单独提交）。
