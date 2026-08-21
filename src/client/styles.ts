/**
 * 高级模式局部 chrome 样式（最小自包含）：
 * - body 标记：识别桌面高级模式；
 * - fixed host：覆盖视口、pointer-events 全关，只有条带子元素局部开；
 * - 自绘 caption 条与窗口按钮。
 */
const ADVANCED_STYLES = `
body[data-dsh-desktop-tauriapp-mode="advanced"] { margin: 0; }
.dshDesktopChromeHost { position: fixed; inset: 0; z-index: 45; pointer-events: none; }
.dshDesktopChromeStrip { position: absolute; display: flex; align-items: stretch; pointer-events: auto; }
.dshDesktopChromeDrag { user-select: none; }
.dshDesktopStatusBar { position: absolute; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 11px; line-height: 1; color: var(--dsw-alias-label-secondary, currentColor); border-top: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.25)); pointer-events: auto; user-select: none; }
.dshDesktopStatusDot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
.dshDesktopWindowControls { position: absolute; top: 0; right: 0; height: 100%; display: flex; align-items: stretch; }
.dshDesktopCaptionButton { width: 46px; border: none; margin: 0; padding: 0; background: transparent; color: var(--dsw-alias-label-primary, currentColor); display: grid; place-items: center; cursor: default; }
.dshDesktopCaptionButton:hover { background: rgba(128, 128, 128, 0.18); }
.dshDesktopCaptionButton-close:hover { background: #e81123; color: #fff; }
.dshDesktopCaptionButton svg { width: 12px; height: 12px; display: block; }
`

/** Install and remove the advanced shell's local-window-chrome styles. @returns the style disposer. */
export function installAdvancedStyles(): () => void {
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-desktop-tauriapp'
  style.dataset.pluginCss = 'dsh-desktop-tauriapp/local-chrome'
  style.textContent = ADVANCED_STYLES
  document.head.appendChild(style)
  return () => { style.remove() }
}
