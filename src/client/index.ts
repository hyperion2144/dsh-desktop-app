import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { applyAdvancedShell } from './advanced-shell.ts'
import { installExternalLinkHandler } from './external-links.ts'
import { parseDesktopClientEnvironment } from './environment.ts'

export { applyAdvancedShell } from './advanced-shell.ts'
export { parseDesktopClientEnvironment } from './environment.ts'
export type { DesktopClientEnvironment, DesktopClientMode, DesktopClientPlatform } from './environment.ts'

/** Services required by advanced presentation. */
export const inject = [
  'slots',
  'sessions',
  'theme',
  'workspaces',
]

/**
 * 桌面壳 client 入口：仅在桌面 shell 的 webview URL 携带
 * `dsh-desktop-tauriapp-mode=advanced&dsh-desktop-tauriapp-platform=<platform>` 时激活高级布局。
 * 普通浏览器访问（无 query 标记）时不做任何改动。
 * @param ctx - browser Cordis context.
 */
export function apply(ctx: ClientContext): void {
  // 桌面 webview（含复用降级/无标记场景）都接管外链打开；纯浏览器无 Tauri IPC 时 no-op
  installExternalLinkHandler()
  const environment = parseDesktopClientEnvironment(window.location.search)
  if (!environment) return
  if (environment.mode === 'advanced') applyAdvancedShell(ctx, environment)
}
