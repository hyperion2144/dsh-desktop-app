import type { DesktopClientPlatform } from './environment.ts'

/** 各平台自绘条高度（CSS px）。 */
const STRIP_HEIGHT: Record<DesktopClientPlatform, number> = {
  darwin: 28,
  win32: 32,
  linux: 32,
}

/** macOS 折叠侧栏轨道目标宽度：容纳原生红绿灯（安全区约 80px）。 */
const MACOS_COLLAPSED_SIDEBAR = 90

/** Win/Linux 自绘窗口按钮预留宽度（CSS px）。 */
const CAPTION_CONTROLS_WIDTH = 138

/** ui-layout 原生 frame 的 overlay 层稳定标记（AppFrame 固定渲染 data-shell-overlay）。 */
const FRAME_LAYER_SELECTOR = '[data-shell-overlay]'

function tauriWindowCommand(command: string): void {
  try {
    const internals = (window as unknown as {
      __TAURI_INTERNALS__?: { invoke?: (cmd: string, ...args: unknown[]) => Promise<unknown> }
    }).__TAURI_INTERNALS__
    if (internals?.invoke !== undefined) void internals.invoke(command).catch(() => undefined)
  } catch {
    // 页面不在 Tauri webview 内时静默忽略
  }
}

function makeCaptionButton(aria: string, extraClass: string, svgPath: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `dshDesktopCaptionButton${extraClass ? ` ${extraClass}` : ''}`
  button.setAttribute('aria-label', aria)
  button.innerHTML = `<svg viewBox="0 0 12 12" aria-hidden="true">${svgPath}</svg>`
  return button
}

/** Win/Linux 自绘窗口按钮：最小化 / 最大化 / 关闭。 */
function buildWindowControls(): HTMLElement {
  const box = document.createElement('div')
  box.className = 'dshDesktopWindowControls'
  box.appendChild(makeCaptionButton('最小化', '', '<path d="M1 6h10" stroke="currentColor" strokeWidth="1" fill="none" />'))
  box.appendChild(makeCaptionButton('最大化', '', '<rect x="1.5" y="1.5" width="9" height="9" stroke="currentColor" strokeWidth="1" fill="none" />'))
  box.appendChild(makeCaptionButton('关闭', 'dshDesktopCaptionButton-close', '<path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1" />'))
  box.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest('button')
    const action = button?.getAttribute('aria-label')
    if (action === '最小化') tauriWindowCommand('plugin:window|minimize')
    else if (action === '最大化') tauriWindowCommand('plugin:window|toggle_maximize')
    else if (action === '关闭') tauriWindowCommand('plugin:window|close')
  })
  return box
}

/** 定位标准布局的 AppFrame（overlay 层的父节点）与三列。children 顺序：sidebar / center / details / overlay … */
function locateLayout(): { frame: HTMLElement; sidebar: HTMLElement; center: HTMLElement | null } | null {
  const layer = document.querySelector(FRAME_LAYER_SELECTOR)
  const frame = layer?.parentElement
  if (frame === null || frame === undefined) return null
  const children = Array.from(frame.children).filter((el): el is HTMLElement => el instanceof HTMLElement)
  return { frame, sidebar: children[0] ?? frame, center: children[1] ?? null }
}

/**
 * 高级模式局部窗口 chrome。
 *
 * 不动 ui-layout（不禁用、不接管 root、不提供 layout 服务），只在原生布局的
 * 局部放拖拽区与自绘窗口按钮：
 * - darwin：sidebar 顶部一条拖拽区（透明），并把 sidebar 内容下移对应高度；
 *   折叠时把侧栏网格轨道加宽到 90px，让原生红绿灯始终待在侧栏内部；
 * - win32/linux：中间区域顶部一条自绘条（左侧拖拽区 + 右侧窗口按钮），
 *   中间列内容用 padding 顶下去，防止重叠。
 *
 * 挂点范式照搬 better-sidebar：往 document.body 追加 fixed host，子元素绝对定位；
 * frame / 三列用 ui-layout 的稳定标记定位（不依赖 hash 类名）。
 */
export function installLocalChrome(platform: DesktopClientPlatform): () => void {
  const height = STRIP_HEIGHT[platform]

  const host = document.createElement('div')
  host.className = 'dshDesktopChromeHost'
  const strip = document.createElement('div')
  strip.className = 'dshDesktopChromeStrip'
  const drag = document.createElement('div')
  drag.className = 'dshDesktopChromeDrag'
  drag.setAttribute('data-tauri-drag-region', '')
  strip.appendChild(drag)
  if (platform !== 'darwin') strip.appendChild(buildWindowControls())
  host.appendChild(strip)
  document.body.appendChild(host)

  let raf = 0
  let attempts = 0
  let mountTimer = 0
  let resizeObserver: ResizeObserver | null = null
  let mutationObserver: MutationObserver | null = null

  const schedule = () => {
    if (raf !== 0) return
    raf = requestAnimationFrame(() => {
      raf = 0
      sync()
    })
  }

  const sync = () => {
    const layout = locateLayout()
    if (layout === null) {
      // ui-layout 尚未挂载：重试有限次数，避免空转
      if (attempts++ < 1200) schedule()
      return
    }
    attempts = 0
    const { frame, sidebar, center } = layout
    const sidebarWidth = sidebar.offsetWidth

    if (platform === 'darwin') {
      strip.style.cssText = `left:0;top:0;width:${sidebarWidth}px;height:${height}px;`
      drag.style.cssText = 'position:absolute;inset:0;'
      sidebar.style.paddingTop = `${height}px`
      widenCollapsedRail(frame)
    } else {
      strip.style.cssText = `left:${sidebarWidth}px;right:0;top:0;height:${height}px;`
      drag.style.cssText = `position:absolute;top:0;bottom:0;left:0;right:${CAPTION_CONTROLS_WIDTH}px;`
      if (center !== null) center.style.paddingTop = `${height}px`
    }
  }

  /**
   * macOS：折叠时把 frame 首条网格轨道加宽到容纳红绿灯。AppFrame 每次重渲染
   * 都会以非 important 覆写内联 grid-template-columns，这里用 important 叠加，
   * 并在模板变化（折叠切换/侧栏拖宽）时经 observer 即时对齐；凭 computed 对比
   * 避免写回死循环。
   */
  const widenCollapsedRail = (frame: HTMLElement) => {
    const collapsed = frame.hasAttribute('data-sidebar-collapsed')
    const current = getComputedStyle(frame).gridTemplateColumns.split(' ').filter(Boolean)
    if (current.length === 0) return
    const desired = current.slice()
    if (collapsed && parseInt(desired[0], 10) !== MACOS_COLLAPSED_SIDEBAR) {
      desired[0] = `${MACOS_COLLAPSED_SIDEBAR}px`
    }
    const joined = desired.join(' ')
    if (joined !== current.join(' ')) {
      frame.style.setProperty('grid-template-columns', joined, 'important')
    }
  }

  try {
    resizeObserver = new ResizeObserver(schedule)
    mutationObserver = new MutationObserver(schedule)
  } catch {
    resizeObserver = null
    mutationObserver = null
  }

  /** frame 出现后挂上观察器（幂等），返回是否已就位。 */
  const attachObservers = (): boolean => {
    const layout = locateLayout()
    if (layout === null) return false
    if (resizeObserver !== null) {
      resizeObserver.observe(layout.frame)
      resizeObserver.observe(layout.sidebar)
      if (layout.center !== null) resizeObserver.observe(layout.center)
    }
    if (mutationObserver !== null) {
      mutationObserver.observe(layout.frame, {
        attributes: true,
        attributeFilter: ['data-sidebar-collapsed', 'data-details-collapsed', 'style'],
      })
    }
    return true
  }

  if (!attachObservers()) {
    // frame 挂在 React 布局里，可能晚于本插件 client；轮询直到出现
    mountTimer = window.setInterval(() => {
      if (attachObservers()) {
        window.clearInterval(mountTimer)
        sync()
      }
    }, 250)
  }
  sync()

  return () => {
    if (raf !== 0) cancelAnimationFrame(raf)
    if (mountTimer !== 0) window.clearInterval(mountTimer)
    resizeObserver?.disconnect()
    mutationObserver?.disconnect()
    const found = locateLayout()
    if (found !== null) {
      found.sidebar.style.paddingTop = ''
      if (found.center !== null) found.center.style.paddingTop = ''
    }
    host.remove()
  }
}
