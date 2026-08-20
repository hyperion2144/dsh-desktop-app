/** Desktop renderer modes accepted from the desktop-owned page URL. */
export type DesktopClientMode = 'compatibility' | 'advanced'

/** Host platforms whose native chrome has a desktop presentation. */
export type DesktopClientPlatform = 'darwin' | 'win32' | 'linux'

/** Validated renderer environment supplied by the desktop Host (Tauri shell). */
export interface DesktopClientEnvironment {
  /** Active shell mode for this window lifetime. */
  mode: DesktopClientMode
  /** Host platform used for native spacing and drag regions. */
  platform: DesktopClientPlatform
}

const MODES = new Set<DesktopClientMode>(['compatibility', 'advanced'])
const PLATFORMS = new Set<DesktopClientPlatform>(['darwin', 'win32', 'linux'])

/**
 * Validate the desktop-owned query marker before any desktop client effects run.
 * @param search - URL search string, including or omitting the leading question mark.
 * @returns the validated desktop renderer environment, or undefined outside the desktop shell.
 */
export function parseDesktopClientEnvironment(search: string): DesktopClientEnvironment | undefined {
  const params = new URLSearchParams(search)
  const mode = params.get('dsh-desktop-tauriapp-mode')
  const platform = params.get('dsh-desktop-tauriapp-platform')
  if (mode === null && platform === null) return undefined
  if (!MODES.has(mode as DesktopClientMode)) {
    throw new Error(`dsh-desktop-tauriapp: invalid or missing dsh-desktop-tauriapp-mode ${JSON.stringify(mode)}`)
  }
  if (!PLATFORMS.has(platform as DesktopClientPlatform)) {
    throw new Error(`dsh-desktop-tauriapp: invalid or missing dsh-desktop-tauriapp-platform ${JSON.stringify(platform)}`)
  }
  return { mode: mode as DesktopClientMode, platform: platform as DesktopClientPlatform }
}
