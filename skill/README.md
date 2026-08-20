# dsh-desktop-tauriapp · Skill（品牌名「DeepSeek Harness Desktop Desktop」）

把 DeepSeek Harness Web GUI 封装成 Tauri 2 桌面应用「DeepSeek Harness Desktop Desktop」（macOS + Windows 双平台）
的可复用技能包。含 DSH 安装步骤（分平台）、托盘常驻、单实例、子进程生命周期管理、
窗口状态记忆，并内置国内镜像源配置方案（rustup / cargo / npm / GitHub 下载 /
VS Build Tools / NSIS）。

## 名字的来由

- 「南」：梁总（DeepSeek 创始人梁文锋，广东湛江人，南方人）的南方之义
- 「梁」：取其姓氏
- 封面：鲸鱼娘（DeepSeek 官方鲸鱼的娘化 OC「溟月」，深海女仆工坊 maid-atelier），
  与「DeepSeek Harness Desktop Desktop」之名相配
- 技术标识仍用 ASCII 的 `dsh-desktop-tauriapp` / `dsh-desktop-tauriapp`，中文只出现在展示层，
  遇到编码问题一律回退（详见 SKILL.md「品牌与命名」节）

## 沟通人设

执行本 skill 的 agent 以**深海女仆工坊鲸鱼娘女仆**身份与用户沟通：称呼用户
「主人」、自称「DeepSeek Harness Desktop Desktop」，语气温柔带二次元口癖；技术输出保持严谨，用户要求
正经时立即切换（详见 SKILL.md「沟通人设」节）。

## 目录

```
SKILL.md                 技能主体（DSH 安装分平台 → 国内镜像 → 桌面壳实现 → 验收 → 已知坑）
resources/lib.rs         Rust 核心完整参考实现（cfg 双平台分支）
resources/Cargo.toml     依赖清单
resources/tauri.conf.json  Tauri 配置
resources/capabilities.json 权限清单（使用时改名 capabilities/default.json）
resources/index.html     加载页
resources/error.html     错误页（日志路径按平台自适应）
resources/styles.css     深色主题样式
resources/icon.png       鲸鱼娘图标（CC BY-NC-SA 4.0，署名见 SKILL.md 第四章）
```

## 本地安装

**Claude Code / Claude Agent 系（SKILL.md 标准格式）**：

```bash
mkdir -p ~/.claude/skills
cp -r dsh-desktop-tauriapp-skill ~/.claude/skills/
```

**DeepSeek Harness**：复制到你所运行 profile 的 skills 目录
（如 agent preset 内声明 skills 的路径），随后在会话中让 agent 加载
`dsh-desktop-tauriapp` 技能即可执行。

## 发布渠道

见 SKILL.md 配套说明；常规入口为 GitHub 仓库 + 下列聚合列表 PR：

- [anthropics/skills](https://github.com/anthropics/skills)（Anthropic 官方 skill 仓库，PR 收录）
- [awesome-claude-skills](https://github.com/hesreallyhim/awesome-claude-skills)（社区聚合列表）
- DSH 生态聚合：[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)、
  [dsh-market](https://github.com/dsh-market/dsh-market)、
  [zat-dsh-engine](https://github.com/mishibeikejie/zat-dsh-engine)、
  [WhaleHub](https://github.com/vvlife/whalehub-dsh)（提交 README PR 收录即可）

## 许可

skill 文本与代码：MIT。图标素材（resources/icon.png 及源图）：CC BY-NC-SA 4.0
（非商用），作者署名见 SKILL.md 第四章。
