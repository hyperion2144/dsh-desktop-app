# dsh-mobile-expo（Android/iOS 壳）

DeepSeek Harness Desktop 手机访问的 **Expo / React Native** 原生壳（技术栈经用户确认，
替代原手记预设的 Capacitor 方案）。

- 配对管理页（列表/添加/删除/深链）→ RN 原生界面（设计令牌见 `src/theme.ts`，对齐
  `docs/mobile-access-design.md` §7，与 H5 壳 / 鸿蒙壳共用基线）
- dsh 页面 → `react-native-webview` 加载（移动布局由页面内注入插件 dsh-mobile-nav 生效）
- 配对输入：粘贴 `dsh-mobile://pair?token=..&base=..` 深链、http(s) 配对链接、或
  `host:端口` + 独立令牌（解析逻辑在 `src/lib/pair.ts`，自 `mobile/shell-web/lib.mjs` 移植）
- 配对列表独立存储（AsyncStorage），一次一用令牌，换设备需桌面重新生成

## 结构

- `src/lib/pair.ts` —— 纯逻辑（解析/进入地址/列表存储），平台无关，vitest 可测
- `src/lib/pair.test.ts` —— 纯逻辑单测（7 例）
- `src/theme.ts` —— 三端设计令牌 + RN StyleSheet 基线
- `src/store.ts` —— AsyncStorage 适配的配对存储
- `src/screens/HomeScreen.tsx` —— 配对管理首页（加入口 + 列表 + 深链接入）
- `src/screens/WebScreen.tsx` —— dsh WebView（外链交系统浏览器的守卫）
- `App.tsx` —— 首页 / WebView 两态导航（无 react-navigation，保持轻量）

## 命令

```sh
npm install            # 首次
npm test               # vitest 纯逻辑单测
npm run typecheck      # tsc --noEmit --noUnusedLocals
npx expo start         # 开发（Expo Go / 模拟器）
npx expo run:android   # 本机构建 Android（需 Android SDK）
npx expo run:ios       # 本机构建 iOS（需 macOS + Xcode）
```

## 已知限制 / 待办

- Android/iOS 原生构建产物需在装有 SDK/Xcode 的机器上生成（本仓库 CI 未接移动构建）。
- iOS ATS 已开 `NSAllowsArbitraryLoads`（局域网 HTTP 配对需要）；发布上架前应收窄。
- 扫码入口：桌面 QR 由系统相机扫描后走 `dsh-mobile://` 深链进壳（Android/iOS 均支持）；
  壳内不内置扫码器。
- 恢复会话：WebView 重启后需重新配对进入（桌面端 token 一次性）。
- 与 `mobile/shell-web`（浏览器 H5 壳）关系：H5 壳保留供浏览器直达场景；原生壳为
  Android/iOS 主入口，二者共用同一 `src/lib/pair.ts` 逻辑源（H5 版在 shell-web/lib.mjs）。