/**
 * 桌面壳外链处理：把 webview 里指向外部网页/协议（http/https/mailto/tel）的链接
 * 统一交给系统默认浏览器/应用打开（不止对话内，设置页等任意位置）。
 * 只有在 Tauri IPC 存在时才接管：
 *  - 点击外部 `<a>`（捕获阶段）；
 *  - `window.open` 外部 URL（覆盖"在新窗口打开链接"、代码里 open）→ 转默认浏览器。
 * 纯浏览器页面（无 Tauri IPC）不做任何拦截，完整保留浏览器原生行为（新标签页等）。
 */

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])

type TauriCore = {
  invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
}

function tauriCore(): TauriCore | undefined {
  const w = window as unknown as { __TAURI__?: { core?: TauriCore } }
  return w.__TAURI__?.core
}

/** 解析外部目标：非外链返回 undefined。同一 host 视为站内路由，交给 dsh 自身处理。 */
function externalUrl(href: string | null | undefined): string | undefined {
  if (!href) return undefined
  let url: URL
  try {
    url = new URL(href, window.location.href)
  } catch {
    return undefined
  }
  if (EXTERNAL_PROTOCOLS.has(url.protocol)) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return url.href
    if (url.host !== window.location.host) return url.href
  }
  return undefined
}

function openInSystem(url: string): void {
  const core = tauriCore()
  if (core?.invoke) {
    core.invoke('open_external', { url }).catch(() => {
      /* 忽略：保持现状 */
    })
  } else {
    try {
      window.open(url, '_blank', 'noopener')
    } catch {
      /* ignore */
    }
  }
}

/** 安装全局外链拦截器（点击 + window.open 覆盖）；返回卸载函数（页面存活期保持）。 */
export function installExternalLinkHandler(): () => void {
  const core = tauriCore()
  const hasTauri = Boolean(core?.invoke)

  const onClick = (event: MouseEvent): void => {
    if (!hasTauri) return // 纯浏览器：不干预，走原生行为（新标签页等）
    if (event.defaultPrevented) return
    if (event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const el = event.target as Element | null
    const anchor = el?.closest?.('a') as HTMLAnchorElement | null
    if (!anchor) return
    const url = externalUrl(anchor.getAttribute('href'))
    if (!url) return
    event.preventDefault()
    event.stopPropagation()
    openInSystem(url)
  }

  const originalOpen = window.open.bind(window)
  const openOverride: typeof window.open = (url, target, features) => {
    const external = externalUrl(typeof url === 'string' ? url : url?.href)
    if (hasTauri && external) {
      openInSystem(external)
      return null
    }
    return originalOpen(typeof url === 'string' ? url : url, target, features)
  }

  document.addEventListener('click', onClick, true)
  window.open = openOverride
  return () => {
    document.removeEventListener('click', onClick, true)
    if (window.open === openOverride) window.open = originalOpen
  }
}
