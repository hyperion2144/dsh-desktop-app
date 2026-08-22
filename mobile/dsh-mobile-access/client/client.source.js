// dsh-mobile-access client 半区：注册 settings.section「手机访问」行。
// 与 host 的 lane 走直 fetch（同机 loopback 直连，Host=127.0.0.1:lanePort；CORS 按 Origin 反射放行）。
// 早期尝试过 ctx.connection.rpc.call('/dsh-mobile-access', ...)，carrier 已把 result 解包后客户端再 .result/.value 易错位，
// 故采用直 fetch，与 HEAD 已验证版本一致。
import React from 'react'
import qrcodeFactory from 'qrcode-generator'

/** 硬依赖：slots（注册 settings.section 槽位）。Cordis Guard 拒绝未声明 ctx.slots 访问。 */
export const inject = ['slots']

export function apply(ctx) {
  const slots = ctx?.slots
  if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') {
    ctx?.logger?.warn?.('dsh-mobile-access: slots 服务不可用，跳过设置入口')
    return
  }
  slots.inject('settings.section', () => slots.register({
    name: 'settings.section',
    id: 'dsh-mobile-access',
    order: 20,
    label: () => '远程访问',
  }, MobileAccessPanel))
}

const lanePort = Number(globalThis.__DSH_MOBILE_LANE_PORT__) || 3091
const LANE = 'http://127.0.0.1:' + lanePort

/** lane 属主通道直 fetch。CORS 由 lane 端按 Origin 反射放行（仅放行回环源）。 */
async function lane(path, opts = {}) {
  const res = await fetch(LANE + path, {
    method: opts.method ?? 'GET',
    headers: { 'content-type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.json())?.error || '' } catch { /* ignore */ }
    throw new Error('HTTP ' + res.status + (detail ? ' ' + detail : ''))
  }
  if (res.status === 204) return null
  return res.json()
}

function el(tag, text, style) {
  const e = document.createElement(tag)
  if (text != null) e.textContent = text
  if (style) e.style.cssText = style
  return e
}

/** settings.section 的 React 组件契约：渲染一个容器，useEffect 内挂载 DOM 面板。 */
function MobileAccessPanel() {
  const ref = React.useRef(null)
  React.useEffect(() => {
    const host = ref.current
    if (!host || host.childNodes.length) return
    const panel = buildPanelDom()
    host.appendChild(panel)
    return () => {
      try { panel._cfClose?.() } catch { /* noop */ }
      panel.remove()
    }
  }, [])
  return React.createElement('div', { ref })
}

function buildPanelDom() {
  const root = document.createElement('div')
  root.dataset.mobileAccessPanel = '1'
  root.style.cssText = 'display:flex;flex-direction:column;gap:12px;max-width:640px;'

  const cssVar = (name, fallback) => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return v || fallback
  }
  const c = {
    text: () => cssVar('--dsw-alias-label-primary', '#e7eaf0'),
    text2: () => cssVar('--dsw-alias-label-secondary', '#9aa4b2'),
    panel: () => cssVar('--dsw-alias-bg-layer-1', '#171a21'),
    line: () => cssVar('--dsw-alias-border-l2', '#2a2f3a'),
    accent: () => cssVar('--dsw-alias-state-accent-primary', '#4d6bfe'),
  }
  const btn = (text, ghost) => {
    const b = el('button', text,
      `background:${ghost ? 'transparent' : c.accent()};color:${ghost ? c.text2() : '#fff'};border:1px solid ${ghost ? c.line() : 'transparent'};border-radius:8px;padding:5px 12px;font-size:12px;cursor:pointer`)
    b.dataset.mobileAccessBtn = '1'
    return b
  }

  // 按钮交互样式：hover 加亮 / active 按下 / busy 半透（仅作用于本面板的按钮，靠 data 属性隔离）。
  // 内联样式不能写 :hover/:active，所以注入一个 <style>。面板卸载时随 root 一起被 React 清掉，
  // 但 <style> 是全局副作用：泄漏一次无害（data-mobile-access-btn 选择器不会再匹配新元素）。
  const btnCss = document.createElement('style')
  btnCss.textContent = `
    [data-mobile-access-btn] {
      transition: transform .08s ease, filter .15s ease, background .15s ease, border-color .15s ease, color .15s ease;
      user-select: none;
    }
    [data-mobile-access-btn]:hover { filter: brightness(1.18); }
    [data-mobile-access-btn]:active {
      transform: translateY(1px) scale(0.97);
      filter: brightness(0.92);
    }
    [data-mobile-access-btn][data-busy="1"] {
      opacity: 0.55;
      cursor: progress;
    }
    [data-mobile-access-btn][data-flash="ok"] {
      background: #2fbf71 !important;
      border-color: #2fbf71 !important;
      color: #fff !important;
    }
    [data-mobile-access-btn][data-flash="err"] {
      background: #e5484d !important;
      border-color: #e5484d !important;
      color: #fff !important;
    }
  `
  document.head.appendChild(btnCss)

  /** 复制按钮反馈：先复制链接 → 改文字 + 闪绿 1.5s → 复原 */
  const flashCopy = (btnEl, link) => {
    if (!link) link = btnEl.dataset.link
    if (!link) return
    navigator.clipboard?.writeText(link).catch(() => {})
    const orig = btnEl.dataset.origText || btnEl.textContent
    btnEl.dataset.origText = orig
    btnEl.textContent = '已复制 ✓'
    btnEl.dataset.flash = 'ok'
    setTimeout(() => {
      btnEl.textContent = orig
      btnEl.dataset.flash = ''
    }, 1500)
  }
  /** 通用瞬时反馈：busy/ok/err 三态短闪后复原 */
  const flash = (btnEl, kind, text, ms = 1500) => {
    const orig = btnEl.dataset.origText || btnEl.textContent
    btnEl.dataset.origText = orig
    if (text) btnEl.textContent = text
    btnEl.dataset.flash = kind
    setTimeout(() => {
      btnEl.textContent = orig
      btnEl.dataset.flash = ''
    }, ms)
  }
  /** 异步进行中：按钮半透 + cursor:progress（CSS 在 [data-busy] 选择器里） */
  const withBusy = async (btnEl, fn) => {
    btnEl.dataset.busy = '1'
    try { return await fn() } finally { delete btnEl.dataset.busy }
  }

  const title = el('div', '远程访问', 'font-size:15px;font-weight:600')
  const sub = el('div', '三个通道独立维护配对二维码：扫码/打开链接即可配对（一次性令牌 + 会话 Cookie）。',
    `color:${c.text2()};font-size:13px`)

  // ---------- 一个通道卡片（自己的二维码/链接/铸造按钮） ----------
  function makeChannelCard(label, desc) {
    const card = el('div', null,
      `border:1px solid ${c.line()};border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px`)
    card.appendChild(el('div', label, 'font-size:13px;font-weight:600'))
    if (desc) card.appendChild(el('div', desc, `color:${c.text2()};font-size:12px`))
    const linkBox = el('code', '',
      `color:${c.text()};font-size:12px;word-break:break-all;background:${c.panel()};border:1px solid ${c.line()};border-radius:6px;padding:6px;display:none`)
    const qrImg = document.createElement('img')
    qrImg.alt = label + ' 配对二维码'
    qrImg.style.cssText = `width:180px;height:180px;image-rendering:pixelated;border-radius:8px;border:1px solid ${c.line()};display:none`
    const hint = el('div', '', `color:${c.text2()};font-size:12px`)
    const row = el('div', null, 'display:flex;gap:8px;flex-wrap:wrap')
    card.appendChild(linkBox)
    card.appendChild(qrImg)
    card.appendChild(hint)
    card.appendChild(row)
    const showQr = (link) => {
      linkBox.textContent = link
      linkBox.style.display = 'block'
      linkBox.dataset.link = link
      try {
        const qr = qrcodeFactory(0, 'M')
        qr.addData(link)
        qr.make()
        qrImg.src = qr.createDataURL(4, 8)
        qrImg.style.display = 'block'
      } catch {
        qrImg.style.display = 'none'
      }
    }
    return { card, linkBox, qrImg, hint, row, showQr }
  }

  // ---------- 1. 局域网 ----------
  const lan = makeChannelCard('局域网', '手机连同一 WiFi，扫此码直连（仅局域网可达）。')
  let lanBase = null // { base, scheme }
  const lanMintBtn = btn('铸造局域网令牌')
  const lanCopy = btn('复制链接', true)
  lanCopy.onclick = () => flashCopy(lanCopy, lan.linkBox.dataset.link)
  lan.row.appendChild(lanMintBtn)
  lan.row.appendChild(lanCopy)

  // ---------- 2. 第三方隧道（cpolar 等） ----------
  const tun = makeChannelCard('第三方隧道（cpolar 等）',
    '隧道需指向改写代理端口 127.0.0.1:' + lanePort + '；粘贴地址校验可达后，用此地址生成自己的配对二维码。')
  const tunInput = el('input', null,
    `background:${c.panel()};border:1px solid ${c.line()};color:${c.text()};border-radius:8px;padding:7px 10px;font-size:13px`)
  tunInput.placeholder = 'https://xxxx.cpolar.cn'
  const tunResult = el('div', '', `color:${c.text2()};font-size:12px`)
  const tunProbeBtn = btn('校验并保存', true)
  let tunSavedUrl = ''
  tunProbeBtn.onclick = () => withBusy(tunProbeBtn, async () => {
    tunResult.textContent = '校验中…'
    tunResult.style.color = c.text2()
    const url = tunInput.value.trim()
    if (!url) { tunResult.textContent = '请输入隧道地址'; tunResult.style.color = '#e5484d'; return }
    try {
      const r = await lane('/api/pair/probe?url=' + encodeURIComponent(url))
      if (r.ok) {
        await lane('/api/pair/tunnel', { method: 'POST', body: { url } })
        tunSavedUrl = url
        tunResult.textContent = '✓ 可达已保存（HTTP ' + (r.status ?? '') + '）'
        tunResult.style.color = '#2fbf71'
        await refreshLanBase()
      } else {
        tunResult.textContent = '✗ 不可达：' + (r.reason ?? '')
        tunResult.style.color = '#e5484d'
      }
    } catch (e) {
      tunResult.textContent = '校验失败：' + e.message
      tunResult.style.color = '#e5484d'
    }
  })
  const tunMintBtn = btn('铸造隧道令牌')
  tun.card.insertBefore(tunInput, tun.linkBox)
  tun.card.insertBefore(tunResult, tun.linkBox)
  tun.row.insertBefore(tunProbeBtn, tun.row.firstChild)
  tun.row.appendChild(tunMintBtn)
  const tunCopy = btn('复制链接', true)
  tunCopy.onclick = () => flashCopy(tunCopy, tun.linkBox.dataset.link)
  tun.row.appendChild(tunCopy)

  // ---------- 3. cloudflared 公网隧道 ----------
  const cf = makeChannelCard('cloudflared 公网隧道',
    'PATH 有 cloudflared 就直接用；否则 ~/.dsh/bin 缓存命中复用；都没有就一键从 GitHub/ghproxy 等多镜像下载到缓存。')
  const cfInput = el('input', null,
    `background:${c.panel()};border:1px solid ${c.line()};color:${c.text()};border-radius:8px;padding:7px 10px;font-size:13px`)
  cfInput.placeholder = 'cloudflared 完整路径（留空 = 一键启动）'
  const cfStatus = el('div', '读取中…', `color:${c.text2()};font-size:12px`)
  const cfAutoBtn = btn('一键启动（无依赖）')
  const cfApply = btn('应用并启动')
  const cfStop = btn('停止', true)
  let cfState = { bin: '', url: null, running: false, reason: null, phase: 'idle', detail: '', message: '' }
  const renderCf = () => {
    const st = cfState
    cfInput.value = st.bin || ''
    const phase = st.phase ?? 'idle'
    // 阶段化显示：resolving → downloading → starting → registering → ready；error 单色
    if (st.running || st.url) {
      cfStatus.textContent = st.url ? '运行中 · ' + st.url : (st.detail || '运行中 · 等待隧道地址…')
      cfStatus.style.color = '#2fbf71'
    } else if (phase === 'error') {
      cfStatus.textContent = '启动失败：' + (st.message || st.detail || 'cloudflared 无法启动')
      cfStatus.style.color = '#e5484d'
    } else if (phase === 'resolving' || phase === 'downloading') {
      cfStatus.textContent = (phase === 'downloading' ? '下载中 · ' : '解析中 · ') + (st.detail || '…')
      cfStatus.style.color = '#4d6bfe'
    } else if (phase === 'starting' || phase === 'registering') {
      cfStatus.textContent = st.detail || '启动中…'
      cfStatus.style.color = '#4d6bfe'
    } else if (st.bin) {
      cfStatus.textContent = '已配置 · 未运行'
      cfStatus.style.color = c.text2()
    } else {
      cfStatus.textContent = '未配置 · 未运行'
      cfStatus.style.color = c.text2()
    }
  }
  const cfMintBtn = btn('铸造隧道令牌')
  const cfCopy = btn('复制链接', true)
  cfCopy.onclick = () => flashCopy(cfCopy, cf.linkBox.dataset.link)

  cf.card.insertBefore(cfInput, cf.linkBox)
  cf.card.insertBefore(cfStatus, cf.linkBox)
  cf.row.insertBefore(cfApply, cf.row.firstChild)
  // 一键启动：bin 留空 → host 自动 PATH → ~/.dsh/bin 缓存 → 多镜像下载，phase 字段实时同步
  cf.row.insertBefore(cfAutoBtn, cf.row.firstChild)
  cf.row.insertBefore(cfStop, cfAutoBtn.nextSibling)
  cf.row.appendChild(cfMintBtn)
  cf.row.appendChild(cfCopy)

  cfAutoBtn.onclick = () => withBusy(cfAutoBtn, async () => {
    // 不读 input.value —— 一键模式固定 auto
    cfStatus.textContent = '解析中 · 检查 PATH 与本地缓存…'
    cfStatus.style.color = '#4d6bfe'
    try {
      const r = await lane('/api/pair/cloudflared', { method: 'POST', body: { bin: '', action: 'apply' } })
      cfState = {
        bin: r.bin ?? '',
        url: r.url ?? null,
        running: !!r.running,
        reason: r.running ? null : (r.reason ?? null),
        message: r.message,
        phase: r.phase ?? 'resolving',
        detail: '',
      }
      renderCf()
    } catch (e) {
      cfStatus.textContent = '一键启动失败：' + e.message
      cfStatus.style.color = '#e5484d'
    }
  })

  cfApply.onclick = () => withBusy(cfApply, async () => {
    cfStatus.textContent = '应用中…'
    cfStatus.style.color = c.text2()
    try {
      const r = await lane('/api/pair/cloudflared', { method: 'POST', body: { bin: cfInput.value.trim(), action: 'apply' } })
      cfState = {
        bin: r.bin ?? '',
        url: r.url ?? null,
        running: !!r.running,
        reason: r.running ? null : (r.reason ?? null),
        message: r.message,
        phase: r.phase ?? 'resolving',
        detail: '',
      }
      renderCf()
    } catch (e) {
      cfStatus.textContent = '应用失败：' + e.message
      cfStatus.style.color = '#e5484d'
    }
  })
  cfStop.onclick = () => withBusy(cfStop, async () => {
    try {
      await lane('/api/pair/cloudflared', { method: 'POST', body: { action: 'stop' } })
      // 立即清空所有"运行中"相关字段，避免下一次 2s 轮询前 UI 还显示旧 url/phase
      cfState = { bin: cfState.bin, url: null, running: false, reason: null, phase: 'idle', detail: '已停止', message: '' }
      renderCf()
    } catch (e) {
      cfStatus.textContent = '停止失败：' + e.message
      cfStatus.style.color = '#e5484d'
    }
  })

  // ---------- 4. 已配对设备卡片（带移除按钮） ----------
  const devicesCard = el('div', null,
    `border:1px solid ${c.line()};border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px`)
  devicesCard.appendChild(el('div', '已配对设备', 'font-size:13px;font-weight:600'))
  const deviceList = el('div', null, 'display:flex;flex-direction:column;gap:6px')

  // ---------- 状态巡检（2s 轮询替代原 SSE） ----------
  const refreshCf = async () => {
    try {
      const st = await lane('/api/pair/cloudflared')
      cfState = {
        bin: st.bin ?? '',
        url: st.url ?? null,
        running: !!st.running,
        reason: st.reason ?? null,
        message: st.message,
        phase: st.phase ?? 'idle',
        detail: st.detail ?? '',
      }
      renderCf()
    } catch (e) {
      cfStatus.textContent = '查询失败：' + e.message
      cfStatus.style.color = '#e5484d'
    }
  }
  const refreshLanBase = async () => {
    try {
      const info = await lane('/api/pair/info')
      if (info.lanIp) lanBase = { base: info.lanIp + ':' + (info.lanePort ?? lanePort), scheme: 'http' }
      else lanBase = { base: '127.0.0.1:' + (info.lanePort ?? lanePort), scheme: 'http' }
      if (!tunSavedUrl && info.customTunnelUrl) {
        tunSavedUrl = info.customTunnelUrl
        tunInput.value = info.customTunnelUrl
      }
    } catch { /* noop */ }
  }
  const refresh = async () => {
    try {
      const st = await lane('/api/pair/devices')
      deviceList.textContent = ''
      if (!st.devices.length) {
        deviceList.appendChild(el('div', '暂无配对设备', `color:${c.text2()};font-size:12px`))
      } else {
        for (const d of st.devices) {
          const row = el('div', null, 'display:flex;justify-content:space-between;align-items:center;gap:8px')
          row.appendChild(el('span', `${d.name} · ${d.online ? '在线' : '离线'}`, `color:${c.text()};font-size:13px`))
          const rm = btn('移除', true)
          rm.onclick = () => withBusy(rm, async () => {
            try {
              await lane('/api/pair/remove', { method: 'POST', body: { deviceId: d.deviceId } })
              await refresh()
            } catch (e) {
              row.appendChild(el('span', '移除失败：' + e.message, `color:#e5484d;font-size:12px`))
            }
          })
          row.appendChild(rm)
          deviceList.appendChild(row)
        }
      }
    } catch (e) {
      deviceList.textContent = ''
      deviceList.appendChild(el('div', '配对服务不可达：' + e.message, `color:#e5484d;font-size:12px`))
    }
  }

  // ---------- 铸造（每个通道独立，各自用自己地址） ----------
  const pairLink = (base, scheme, token) => scheme + '://' + base + '/pair?token=' + encodeURIComponent(token)
  const mintFor = async (base, scheme, chan) => {
    try {
      const r = await lane('/api/pair/mint', { method: 'POST', body: {} })
      const link = pairLink(base, scheme, r.token)
      chan.showQr(link)
      chan.hint.textContent = '10 分钟有效 · 一次性 · 扫码/打开即配对'
      chan.hint.style.color = '#2fbf71'
    } catch (e) {
      chan.hint.textContent = '铸造失败：' + e.message
      chan.hint.style.color = '#e5484d'
    }
  }
  lanMintBtn.onclick = () => withBusy(lanMintBtn, async () => {
    if (!lanBase) await refreshLanBase()
    if (lanBase) await mintFor(lanBase.base, lanBase.scheme, lan)
    else lan.hint.textContent = '无法确定局域网地址'
  })
  tunMintBtn.onclick = () => withBusy(tunMintBtn, async () => {
    if (!tunSavedUrl) await refreshLanBase()
    if (tunSavedUrl) {
      const u = new URL(tunSavedUrl)
      await mintFor(u.host, u.protocol === 'https:' ? 'https' : 'http', tun)
    } else {
      tun.hint.textContent = '请先校验并保存隧道地址'
      tun.hint.style.color = '#e5484d'
    }
  })
  cfMintBtn.onclick = () => withBusy(cfMintBtn, async () => {
    if (!cfState.url) {
      cf.hint.textContent = '隧道未运行或无地址，请先启动 cloudflared'
      cf.hint.style.color = '#e5484d'
      return
    }
    await mintFor(cfState.url.replace(/^https?:\/\//, ''),
      cfState.url.startsWith('https') ? 'https' : 'http', cf)
  })

  const pollTimer = setInterval(() => {
    void refresh()
    void refreshCf()
  }, 2000)
  const _cfClose = () => { try { clearInterval(pollTimer) } catch { /* noop */ } }

  root.appendChild(title)
  root.appendChild(sub)
  root.appendChild(lan.card)
  root.appendChild(tun.card)
  root.appendChild(cf.card)
  root.appendChild(devicesCard)
  devicesCard.appendChild(deviceList)

  void refresh()
  void refreshCf()
  void refreshLanBase()
  root._cfClose = _cfClose
  return root
}
