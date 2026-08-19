import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './contracts.ts'
import type { DesktopClientPlatform } from './environment.ts'
import {
  computeDesktopColumns, DesktopLayoutState, MACOS_SIDEBAR_COLLAPSED,
  SIDEBAR_AUTO_COLLAPSE, SIDEBAR_COLLAPSED, SIDEBAR_DEFAULT,
} from './layout-state.ts'

/** Private values assembled by the advanced-shell registration. */
export interface AdvancedFrameInjected {
  /** Desktop-owned panel state exposed through the standard layout service. */
  layout: DesktopLayoutState
  /** Host platform controlling native title-bar spacing. */
  platform: DesktopClientPlatform
}

/** Full advanced root slot props. */
export type AdvancedFrameProps = PropsRuntime<'root'>
  & PropsRenderSlots<'sidebar' | 'conversation' | 'details' | 'shell.overlay'>
  & AdvancedFrameInjected

/**
 * 通过 Tauri 核心窗口插件调用窗口控制命令（自绘标题栏按钮用）。
 * 与框架 drag.js 相同的 IPC 面：`plugin:window|<command>`。
 */
function tauriWindowCommand(command: string): void {
  try {
    const internals = (window as unknown as {
      __TAURI_INTERNALS__?: { invoke?: (cmd: string, ...args: unknown[]) => Promise<unknown> }
    }).__TAURI_INTERNALS__
    if (internals?.invoke !== undefined) {
      void internals.invoke(command).catch(() => undefined)
    }
  } catch {
    // 页面不在 Tauri webview 内时静默忽略
  }
}

/** 自绘窗口控制按钮（win32/linux 无原生标题栏时的最小化/最大化/关闭）。 */
function DesktopWindowControls() {
  const onMinimize = useCallback(() => tauriWindowCommand('plugin:window|minimize'), [])
  const onToggleMaximize = useCallback(() => tauriWindowCommand('plugin:window|toggle_maximize'), [])
  const onClose = useCallback(() => tauriWindowCommand('plugin:window|close'), [])
  return (
    <div className="dshDesktopWindowControls">
      <button type="button" className="dshDesktopCaptionButton" aria-label="最小化" onClick={onMinimize}>
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 6h10" stroke="currentColor" strokeWidth="1" fill="none" /></svg>
      </button>
      <button type="button" className="dshDesktopCaptionButton" aria-label="最大化" onClick={onToggleMaximize}>
        <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="1.5" y="1.5" width="9" height="9" stroke="currentColor" strokeWidth="1" fill="none" /></svg>
      </button>
      <button type="button" className="dshDesktopCaptionButton dshDesktopCaptionButton-close" aria-label="关闭" onClick={onClose}>
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1" /></svg>
      </button>
    </div>
  )
}

/**
 * 桌面透明框架：接管根 slot，三栏网格 + 平台自绘 caption 行 + 拖拽区。
 * 照搬参考项目 AdvancedFrame，差异：拖拽区为真实元素（挂 Tauri data-tauri-drag-region）。
 */
export function AdvancedFrame({ layout, platform, renderSlot, useSessions }: AdvancedFrameProps) {
  const subscribeLayout = useCallback((listener: () => void) => layout.subscribe(listener), [layout])
  const readLayout = useCallback(() => layout.getSnapshot(), [layout])
  const panels = useSyncExternalStore(subscribeLayout, readLayout)
  const frameRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState(() => window.innerWidth)
  const detailsSession = useSessions((state) => {
    const current = state.current
    return current !== undefined && state.byId[current]?.blank === false ? current : undefined
  })

  useEffect(() => {
    const element = frameRef.current
    if (element === null) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined && entry.contentRect.width > 0) setViewport(entry.contentRect.width)
    })
    observer.observe(element)
    return () => { observer.disconnect() }
  }, [])

  const narrow = viewport < SIDEBAR_AUTO_COLLAPSE
  useEffect(() => { layout.setNarrow(narrow) }, [layout, narrow])

  const previousSession = useRef(detailsSession)
  useEffect(() => {
    if (detailsSession !== undefined && previousSession.current !== undefined && previousSession.current !== detailsSession) {
      layout.closeDetails()
    }
    previousSession.current = detailsSession
  }, [detailsSession, layout])

  const collapsed = panels.narrow ? !panels.narrowExpanded : panels.sidebar === 0
  const sidebarPreference = collapsed ? 0 : panels.sidebar === 0 ? SIDEBAR_DEFAULT : panels.sidebar
  const columns = computeDesktopColumns(
    viewport,
    sidebarPreference,
    detailsSession === undefined ? 0 : panels.details,
    platform === 'darwin' ? MACOS_SIDEBAR_COLLAPSED : SIDEBAR_COLLAPSED,
  )
  const hasCaption = platform !== 'darwin'

  return (
    <div
      ref={frameRef}
      className="dshDesktopFrame"
      data-desktop-platform={platform}
      data-sidebar-collapsed={collapsed || undefined}
      style={{ gridTemplateColumns: `${columns.sidebar}px minmax(0, 1fr) ${columns.details}px` }}
    >
      {platform === 'darwin' && (
        <div className="dshDesktopMacCaptionRow" aria-hidden="true">
          <div className="dshDesktopMacCaptionDrag" data-tauri-drag-region aria-hidden="true" />
        </div>
      )}
      {platform === 'win32' && (
        <div className="dshDesktopWindowsCaptionRow" aria-hidden="true">
          <div className="dshDesktopCaptionDrag" data-tauri-drag-region aria-hidden="true" />
          <DesktopWindowControls />
        </div>
      )}
      {platform === 'linux' && (
        <div className="dshDesktopLinuxCaptionRow" aria-hidden="true">
          <div className="dshDesktopCaptionDrag" data-tauri-drag-region aria-hidden="true" />
          <DesktopWindowControls />
        </div>
      )}
      <aside className="dshDesktopSidebarSurface">
        <div className="dshDesktopSidebarDrag" data-tauri-drag-region aria-hidden="true" />
        <div className="dshDesktopUpstreamSidebar">
          {renderSlot('sidebar', { collapsed, width: columns.sidebar })}
        </div>
      </aside>
      <main className="dshDesktopConversationSurface">{renderSlot('conversation', {})}</main>
      <aside className="dshDesktopDetailsSurface">{renderSlot('details', {})}</aside>
      <div className="dshDesktopOverlay" data-shell-overlay>
        {renderSlot('shell.overlay', {})}
      </div>
      {!collapsed && (
        <ResizeHandle
          side="sidebar"
          left={columns.sidebar}
          size={columns.sidebar}
          onResize={(width) => { layout.setSidebar(width) }}
        />
      )}
      {columns.details > 0 && (
        <ResizeHandle
          side="details"
          left={viewport - columns.details}
          size={columns.details}
          onResize={(width) => { layout.setDetails(width) }}
        />
      )}
    </div>
  )
}

function ResizeHandle(props: { side: 'sidebar' | 'details'; left: number; size: number; onResize: (width: number) => void }) {
  const origin = useRef(0)
  const base = useRef(0)
  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    origin.current = event.clientX
    base.current = props.size
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [props.size])
  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const delta = event.clientX - origin.current
    props.onResize(base.current + (props.side === 'sidebar' ? delta : -delta))
  }, [props])
  return (
    <div
      className="dshDesktopResizeHandle"
      data-side={props.side}
      style={{ left: props.left }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
    />
  )
}
