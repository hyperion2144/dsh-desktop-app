// cloudflared 解析与下载：复用 pocket 项目的多镜像 + 持久缓存策略，但省略 TUNA bottle
// 与多线程分块下载（保持代码简洁，单线程足以国内镜像速度）。被 host 的 startTunnel
// 在 bin 为空时调用；产物是可直接 spawn 的 cloudflared 路径，startTunnel 自行 spawn 子进程。
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, rm, rename, access, open, chmod, stat } from 'node:fs/promises'
import { createWriteStream, createReadStream } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

/** 平台 → GitHub release 资产名。Linux/Windows 是裸二进制；macOS 是 .tgz 压缩包。 */
function platformAsset() {
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'
  if (process.platform === 'darwin') return { file: `cloudflared-darwin-${arch}.tgz`, os: 'darwin', arch, ext: '', extract: true }
  if (process.platform === 'win32') return { file: `cloudflared-windows-${arch}.exe`, os: 'win32', arch, ext: '.exe', extract: false }
  return { file: `cloudflared-linux-${arch}`, os: 'linux', arch, ext: '', extract: false }
}

/** 镜像 fallback 列表：GitHub 官方 + 国内加速。失败时依次尝试下一条。 */
const MIRRORS = [
  (asset) => `https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`,
  (asset) => `https://ghproxy.net/https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`,
  (asset) => `https://gh.ddlc.top/https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`,
  (asset) => `https://gh-proxy.com/https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`,
]

/** PATH 里是否有 cloudflared。 */
function cloudflaredOnPath() {
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which'
    execFileSync(cmd, ['cloudflared'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** 持久缓存目录：$DSH_HOME/bin/cloudflared[.exe]。 */
function cachePath() {
  const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
  const { ext } = platformAsset()
  return join(dshHome, 'bin', `cloudflared${ext}`)
}

/** 检查缓存是否存在且是真实可执行（Linux bottle 的 @@HOMEBREW_PREFIX@@ 占位符 ELF 不可用，需丢弃）。 */
async function probeCache(bin) {
  try {
    await access(bin)
    if (process.platform === 'linux') {
      const fd = await open(bin, 'r')
      try {
        const head = Buffer.alloc(8192)
        await fd.read(head, 0, 8192, 0)
        if (head.includes(Buffer.from('@@HOMEBREW_PREFIX@@'))) return false
      } finally {
        await fd.close()
      }
    }
    await stat(bin)
    return true
  } catch {
    return false
  }
}

/** 解压 .tgz 到目标目录，产物里有 cloudflared 这个二进制。 */
async function extractTgz(tgzPath, destDir) {
  await mkdir(destDir, { recursive: true })
  await new Promise((resolve, reject) => {
    const tar = spawn('tar', ['-xzf', tgzPath, '-C', destDir])
    tar.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`tar exit ${code}`)))
    tar.once('error', reject)
  })
}

/** 单镜像下载：写到 dest 文件，失败抛错。 */
async function downloadOnce(mirror, asset, dest) {
  const url = mirror(asset)
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
}

/**
 * 解析可用的 cloudflared 路径。PATH 优先；否则查缓存；否则下载到缓存。
 * @param {{ onPhase?: (phase: string, detail?: string) => void, signal?: AbortSignal }} [opts]
 * @returns {Promise<{ path: string, source: 'PATH'|'cache'|'download', tried: string[] }>}
 */
export async function resolveCloudflared(opts = {}) {
  const onPhase = opts.onPhase || (() => {})
  const signal = opts.signal

  if (cloudflaredOnPath()) {
    onPhase('ready', 'PATH 已有 cloudflared')
    return { path: 'cloudflared', source: 'PATH', tried: [] }
  }

  const cp = cachePath()
  if (await probeCache(cp)) {
    onPhase('ready', `使用缓存：${cp}`)
    return { path: cp, source: 'cache', tried: [] }
  }

  // 下载路径
  const { file, os: ost, arch, extract } = platformAsset()
  onPhase('downloading', `首次下载 cloudflared (${ost}/${arch})…`)
  const dest = cachePath()
  const tmpDir = join(dirname(dest), '.cloudflared.download')
  const tmpFile = join(tmpDir, file)
  await mkdir(tmpDir, { recursive: true })

  const tried = []
  let lastErr
  for (const mirror of MIRRORS) {
    const host = (() => { try { return new URL(mirror(file)).host } catch { return '?' } })()
    tried.push(host)
    try {
      if (signal?.aborted) throw new Error('aborted')
      onPhase('downloading', `下载中：${host}`)
      await downloadOnce(mirror, file, tmpFile)
      if (extract) {
        onPhase('downloading', `解压中（${ost}）…`)
        await extractTgz(tmpFile, tmpDir)
        // tgz 解压到 cloudflared（无后缀），移到最终位置
        const inner = join(tmpDir, 'cloudflared')
        await rename(inner, dest)
        await rm(tmpFile, { force: true })
      } else {
        await rename(tmpFile, dest)
      }
      await chmod(dest, 0o755)
      await rm(tmpDir, { recursive: true, force: true })
      onPhase('ready', `已下载到：${dest}`)
      return { path: dest, source: 'download', tried }
    } catch (e) {
      lastErr = e
      try { await rm(tmpFile, { force: true }) } catch { /* 忽略 */ }
    }
  }
  await rm(tmpDir, { recursive: true, force: true })
  throw new Error(
    `cloudflared 下载失败（所有源都不通，最后错误：${lastErr?.message ?? lastErr}）。` +
    ` 可手动安装：npm i -g cloudflared，或 brew install cloudflared`,
  )
}
