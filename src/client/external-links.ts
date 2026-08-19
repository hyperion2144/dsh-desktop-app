/**
 * 桌面壳外链处理：把 webview 里指向外部网页/协议（http/https/mailto/tel）的点击
 * 转发给系统默认浏览器/应用，而不是让 WKWebView/WebView2 吃掉后"无反应"。
 * 仅在桌面壳 webview（URL 带 dsh-desktop-* 标记）里安装，普通浏览器不受影响。
 */

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])

type TauriCore = {
  invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
}

function tauriCore(): TauriCore | undefined {
  const w = window as unknown as { __TAURI__?: { core?: TauriCore } }
  return w.__TAURI__?.core
}

/** 解析锚点：命中需转交系统的外链时返回完整 URL，否则返回 undefined。 */
function externalUrl(anchor: HTMLAnchorElement): string | undefined {
  const href = anchor.getAttribute('href')
  if (!href) return undefined
  let url: URL
  try {
    url = new URL(href, window.location.href)
  } catch {
    return undefined
  }
  if (EXTERNAL_PROTOCOLS.has(url.protocol)) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return url.href
    // 同 host 视为站内路由，交给 dsh 自身处理；不同 host 才是要开默认浏览器的外链
    if (url.host !== window.location.host) return url.href
  }
  return undefined
}

function openInSystem(url: string): void {
  const core = tauriCore()
  if (core?.invoke) {
    core.invoke('open_external', { url }).catch(() => {
      window.open(url, '_blank', 'noopener')
    })
  } else {
    window.open(url, '_blank', 'noopener')
  }
}

/** 安装全局外链拦截器；返回卸载函数（页面存活期内保持）。 */
export function installExternalLinkHandler(): () => void {
  const onClick = (event: MouseEvent): void => {
    if (event.defaultPrevented) return
    if (event.button !== 0) return // 只拦普通左键单击
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const el = event.target as Element | null
    const anchor = el?.closest?.('a') as HTMLAnchorElement | null
    if (!anchor) return
    const url = externalUrl(anchor)
    if (!url) return
    event.preventDefault()
    event.stopPropagation()
    openInSystem(url)
  }
  document.addEventListener('click', onClick, true)
  return () => document.removeEventListener('click', onClick, true)
}
