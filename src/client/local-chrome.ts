import type { DesktopClientPlatform } from './environment.ts'

/** 各平台自绘条高度（CSS px）。 */
const STRIP_HEIGHT: Record<DesktopClientPlatform, number> = {
  darwin: 28,
  win32: 32,
  linux: 32,
}

/** macOS 折叠侧栏轨道目标宽度：容纳原生红绿灯（安全区约 80px）。 */
const MACOS_COLLAPSED_SIDEBAR = 90

/** stock ui-layout 折叠侧栏的内容轨道宽度（computeColumns 里 sidebar 折叠=56px）。 */
const COLLAPSED_RAIL = 56

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
 *   折叠时把侧栏网格轨道加宽到 90px（红绿灯始终在侧栏内），内部 56px 窄栏水平居中，
 *   并禁用 frame 的慢速网格过渡（避免我们的覆盖与过渡互相重启导致折叠卡慢）；
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

  /** 底部状态条高度（sidebar 内容用 padding-bottom 让出一整行）。 */
  const STATUS_BAR_HEIGHT = 24

  const STATUS_TEXT: Record<number, string> = {
    0: '初始化', 1: '启动中', 2: '运行中', 3: '复用外部实例', 4: '重启中',
    5: '服务异常', 6: '服务下线', 7: '远程',
  }
  const STATUS_COLOR: Record<number, string> = {
    0: '#9ca3af', 1: '#f59e0b', 2: '#22c55e', 3: '#22c55e',
    4: '#f59e0b', 5: '#ef4444', 6: '#ef4444', 7: '#3b82f6',
  }

  function tauriInvoke(): ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | undefined {
    const w = window as unknown as {
      __TAURI__?: { core?: { invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> } }
      __TAURI_INTERNALS__?: { invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }
    }
    if (w.__TAURI__?.core?.invoke) return w.__TAURI__.core.invoke
    if (w.__TAURI_INTERNALS__?.invoke) return w.__TAURI_INTERNALS__.invoke
    return undefined
  }

  let raf = 0
  let attempts = 0
  let mountTimer = 0
  let statusTimer = 0
  let resizeObserver: ResizeObserver | null = null
  let mutationObserver: MutationObserver | null = null

  // 底部状态条：sidebar 独占一整行（仅展示状态，不做点击重启——重启走托盘）
  const bar = document.createElement('div')
  bar.className = 'dshDesktopStatusBar'
  bar.innerHTML = '<span class="dshDesktopStatusDot" aria-hidden="true"></span><span class="dshDesktopStatusText"></span>'
  host.appendChild(bar)

  const refreshStatus = () => {
    const invoke = tauriInvoke()
    if (!invoke) return
    void invoke('get_dsh_status', {})
      .then((value) => {
        const s = (value as { status?: number }).status
        if (typeof s !== 'number') return
        const dot = bar.querySelector('.dshDesktopStatusDot') as HTMLElement | null
        const text = bar.querySelector('.dshDesktopStatusText') as HTMLElement | null
        const label = STATUS_TEXT[s] ?? `状态 ${s}`
        if (dot !== null) dot.style.background = STATUS_COLOR[s] ?? '#9ca3af'
        if (text !== null) text.textContent = label
        bar.title = `dsh：${label}`
      })
      .catch(() => {})
  }
  refreshStatus()
  statusTimer = window.setInterval(refreshStatus, 5000)

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
    // 底部状态条：内容行让出一整行（所有平台），状态条覆盖其上
    sidebar.style.paddingBottom = `${STATUS_BAR_HEIGHT}px`
    bar.style.cssText = `left:0;bottom:0;width:${sidebarWidth}px;height:${STATUS_BAR_HEIGHT}px;`

    if (platform === 'darwin') {
      const collapsed = frame.hasAttribute('data-sidebar-collapsed')
      // 高级模式禁掉 stock 的慢速网格过渡：我们的 important 覆盖若与过渡并行，
      // 每帧读「动画中间值」写回都会让 CSS 过渡重新开始，折叠会形同卡帧、非常慢。
      // 直接禁用让宽度即时到位（对应 stock 拖拽时本来就 transition:none 的行为）。
      frame.style.setProperty('transition', 'none', 'important')
      strip.style.cssText = `left:0;top:0;width:${sidebarWidth}px;height:${height}px;`
      drag.style.cssText = 'position:absolute;inset:0;'
      sidebar.style.paddingTop = `${height}px`
      // 折叠：把内部 56px 窄栏水平居中在加宽到 90px 的轨道里（红绿灯所在列仍是侧栏）
      const sidePad = collapsed ? (MACOS_COLLAPSED_SIDEBAR - COLLAPSED_RAIL) / 2 : 0
      sidebar.style.paddingLeft = sidePad ? `${sidePad}px` : ''
      sidebar.style.paddingRight = sidePad ? `${sidePad}px` : ''
      if (collapsed) widenCollapsedRail(frame)
    } else {
      strip.style.cssText = `left:${sidebarWidth}px;right:0;top:0;height:${height}px;`
      drag.style.cssText = `position:absolute;top:0;bottom:0;left:0;right:${CAPTION_CONTROLS_WIDTH}px;`
      if (center !== null) center.style.paddingTop = `${height}px`
    }
  }

  /**
   * macOS：折叠时把 frame 首条网格轨道加宽到容纳红绿灯，其余轨道沿用当前值。
   * AppFrame 每次重渲染都会以非 important 覆写内联 grid-template-columns，这里用
   * important 叠加；darwin 分支已禁用 frame 网格过渡，因此写入是即时且稳定的，
   * 不会与过渡互相重启。凭 computed 对比避免写回死循环。
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
    if (statusTimer !== 0) window.clearInterval(statusTimer)
    resizeObserver?.disconnect()
    mutationObserver?.disconnect()
    const found = locateLayout()
    if (found !== null) {
      found.sidebar.style.paddingTop = ''
      found.sidebar.style.paddingBottom = ''
      if (found.center !== null) found.center.style.paddingTop = ''
    }
    host.remove()
  }
}
