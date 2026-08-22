# dsh-mobile-harmony（鸿蒙壳）

HarmonyOS NEXT 手机访问壳（ArkTS + ArkWeb），与 H5 壳 / Expo RN 壳共用设计令牌
（`common/Theme.ets` = `docs/mobile-access-design.md` §7 同值）。

- 配对管理页（列表/添加/删除）→ ArkUI 原生实现（`pages/Index.ets`）
- dsh 页面 → ArkWeb 组件（`pages/WebPage.ets`）；移动布局由页面内注入的 dsh-mobile-nav
  生效，ArkWeb 不做 DOM 注入
- 配对输入：`dsh-mobile://pair?token=..&base=..` 深链（EntryAbility 透传）或
  `host:端口` + 独立令牌；解析逻辑 `common/PairLogic.ets`（自 shell-web/lib.mjs 移植）
- 权限：`ohos.permission.INTERNET`；明文 HTTP 经 `networkSecurityConfig` 放行
  （局域网配对需 HTTP；发布前应收窄）

## 结构

```
AppScope/app.json5                    应用名/包名 app.dsh.mobile
entry/src/main/module.json5           module 配置 + INTERNET 权限 + networkSecurityConfig
entry/src/main/ets/entryability/     EntryAbility（深链透传）
entry/src/main/ets/common/           Theme.ets（设计令牌）、PairLogic.ets（配对逻辑）
entry/src/main/ets/pages/            Index.ets（配对管理）、WebPage.ets（ArkWeb）
entry/src/main/resources/             media 图标（占位）、string/color、profile（pages/网络配置）
```

## 构建

需 DevEco Studio（本仓库无鸿蒙构建链；源码骨架以 DevEco 编译验证为准）：

1. DevEco Studio 打开 `mobile/harmony/`
2. 真机/模拟器运行 `entry` module

## 待办

- media 图标为 4x4 占位 PNG，上线前替换正式图标；
- `networkSecurityConfig` 的字段名以当前 DevEco SDK 版本为准（骨架按通行走法）；
- 深链注册（module.json5 skills/actions 的 uri 匹配）待 DevEco 下按实际 SDK 补全；
- ArkWeb 对 WS 长连接与大 DOM 性能需真机验证（design §5 开放问题）。