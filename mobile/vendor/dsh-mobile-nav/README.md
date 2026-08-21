![dsh-web-mobile — 手机上也能好好用 DSH](assets/banner.png)

<p align="center">
  <strong>移动端适配插件 dsh-web-mobile</strong> — 窄屏好用，宽屏不动
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT" /></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/topic-dsh--plugin-amber?style=flat-square" alt="dsh-plugin" /></a>
  <a href="https://awesome-dsh-plugin.com/p/mexiaosqwq/dsh-web-mobile/"><img src="https://awesome-dsh-plugin.com/badge.svg" alt="awesome · DSH plugin" /></a>
</p>

---

**dsh-web-mobile** 是 DeepSeek Harness Web UI 的移动端适配插件——让 DSH 在手机竖屏下也能好好用：

- **侧栏变抽屉**：手机竖屏下侧栏收进 overlay 抽屉，会话区全宽，点会话行自动收起
- **弹窗变浮层**：设置、文件树、预览改成底部 sheet，触屏好点
- **状态栏避让**：刘海安全区、深/浅主题、双击缩放都处理
- **输入区不打架**：权限胶囊、模型名、切换菜单在窄屏下不重叠
- **平板也管**：768–1023px 限宽居中；桌面 ≥1024px 完全 no-op
- **诊断方便**：`?mobile-nav-debug=1` 显示悬浮诊断条（视口 / 浮层状态 / JS 错误）

---

## 效果

| 会话主页 | 目录抽屉 | 设置界面 |
| --- | --- | --- |
| ![移动端会话主页](assets/hero.png) | ![目录抽屉](assets/drawer.png) | ![移动端设置界面](assets/settings.png) |

## 安装

从 GitHub 一行装：

```sh
dsh plugin --profile web add github:mexiaosqwq/dsh-web-mobile
```

仓库自带构建产物，无 `allowBuilds` 拦截。装完重启 `dsh web`。

本地开发：

```sh
dsh plugin --profile web add link:/path/to/dsh-web-mobile
```

## 更新内容

### v2.0.0

**修复**

- iOS Safari 输入 `ask_user_question` 时不再自动放大
- 移动端会话头部稳定：文件按钮不跑出头部，模式徽标/按钮布局不乱
- 输入区在窄屏下一行排列，权限/模型下拉不被裁剪、不互相遮挡
- 点文件行打开预览不再被误判为关闭，预览能正常弹出
- `?mobile-nav-debug=1` 不再因自身写入触发页面冻结
- dshmarket 搜索框、已安装插件列表在移动端布局正常

**移除**

- 移除触觉反馈（HapticRow / haptic 设置项）

**兼容**

- 放宽 `@deepseek-ai/*` peer 依赖范围，支持 0.1.1 rc 版本

### v1.5.0

- 修复抽屉关闭回归：背板点击、Escape、导航点击收起、悬浮按钮恢复
- preview/explorer 互斥对称，预览浮层不再误开或残留
- dispose 还原完整，退出移动端布局后桌面无残留
- reconciler 重构：统一全树观察，减少无效刷新
- 新增 CDP 回归门禁 `smoke:cdp`

## 兼容插件

- [dsh-web-ui 全家桶](https://www.npmjs.com/package/@linxin666/dsh-web-ui-all)——**0.1.14**
- [dshmarket](https://www.npmjs.com/package/dshmarket)——**1.2.2**
- [dsh-usage-stats](https://github.com/Ychris12138/dsh-usage-stats)——**0.1.2**
- [dsh-genui](https://github.com/omdsh-dev/dsh-genui)——**0.8.3**

## 构建

```sh
pnpm install
pnpm build
```

`lib/` 与源码同步入库，改动源码后重新构建再提交。

## License

[MIT](LICENSE)
