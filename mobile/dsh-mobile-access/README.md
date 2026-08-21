# dsh-mobile-access（内部包）

手机访问服务的 host+client 双半区实现，随 DeepSeek Harness Desktop 内置（共享模块池 + --patch 注入，不写 profile bundles）。

能力：Host/Origin 改写反代（HTTP+WS）、配对令牌、设备会话、SSE 状态、cloudflared 隧道、H5 手机壳接入（扫码/输入地址双入口）。

授权模型：一次性限时令牌 + HttpOnly 会话 cookie（无密码，对齐 dsh-remote-web-ui 配对机制）。

## 结构

- lib/index.mjs —— 插件入口（host 半区：装配反代/配对/SSE/隧道）
- lib/proxy.mjs —— 改写反代（HTTP + WebSocket upgrade 透传 + 页面注入）
- lib/pairing.mjs —— 配对令牌生命周期、设备会话、SSE 事件
- lib/links.mjs —— 二维码文本、局域网 IP 挑选、地址归一化
- client/client.js —— settings.section「手机访问」Tab（dsh client 半区）
- test/*.test.mjs —— node:test 单元测试

## 测试

```sh
node --test mobile/dsh-mobile-access/test
```