// dsh client 半区：注册 settings.section「手机访问」行。
// 与 host 半区的通讯走 lane 属主通道（同机 loopback 直连，Host=127.0.0.1:lanePort、
// 无 X-Forwarded-For → isLocalOwner=true，控制端点放行；CORS 仅放行回环源）。
// 轻量 DOM 渲染（无 React 依赖），样式沿用 dsh 主题 token。
export function apply(ctx) {
  const slots = ctx?.slots;
  if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') {
    ctx?.logger?.warn?.('dsh-mobile-access: slots 服务不可用，跳过设置入口');
    return;
  }
  slots.inject('settings.section', () => slots.register({
    name: 'settings.section',
    id: 'dsh-mobile-access',
    order: 20,
  }, MobileAccessPanel));
}

const lanePort = Number(globalThis.__DSH_MOBILE_LANE_PORT__) || 3091;
const LANE = 'http://127.0.0.1:' + lanePort;

async function lane(path, opts = {}) {
  const res = await fetch(LANE + path, {
    method: opts.method ?? 'GET',
    headers: { 'content-type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

function el(tag, text, style) {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  if (style) e.style.cssText = style;
  return e;
}

function MobileAccessPanel() {
  const root = document.createElement('div');
  root.dataset.mobileAccessPanel = '1';
  root.style.cssText = 'display:flex;flex-direction:column;gap:12px;max-width:640px;';

  const cssVar = (name, fallback) => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  };
  const c = {
    text: () => cssVar('--dsw-alias-label-primary', '#e7eaf0'),
    text2: () => cssVar('--dsw-alias-label-secondary', '#9aa4b2'),
    panel: () => cssVar('--dsw-alias-bg-layer-1', '#171a21'),
    line: () => cssVar('--dsw-alias-border-l2', '#2a2f3a'),
    accent: () => cssVar('--dsw-alias-state-accent-primary', '#4d6bfe'),
  };

  const title = el('div', '手机访问', 'font-size:15px;font-weight:600');
  const sub = el('div', '扫码或输入配对地址，在手机上使用本机 dsh web（局域网 · 公网 · 内网穿透）。授权=配对令牌 + 会话 Cookie。', `color:${c.text2()};font-size:13px`);

  const statusCard = el('div', null, `border:1px solid ${c.line()};border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:10px`);
  const statusLine = el('div', '正在连接配对服务…', `color:${c.text2()};font-size:13px`);
  const tokenRow = el('div', null, 'display:flex;align-items:center;gap:10px;flex-wrap:wrap');
  const tokenRef = el('code', '••••••••', `color:${c.text()}`);
  const tokenHint = el('span', '', `color:${c.text2()};font-size:12px`);
  const linkBox = el('code', '', `color:${c.text()};font-size:12px;word-break:break-all;background:${c.panel()};border:1px solid ${c.line()};border-radius:6px;padding:6px`);

  const btn = (text, ghost) => el('button', text, `background:${ghost ? 'transparent' : c.accent()};color:${ghost ? c.text2() : '#fff'};border:1px solid ${ghost ? c.line() : 'transparent'};border-radius:8px;padding:5px 12px;font-size:12px;cursor:pointer`);

  const devicesCard = el('div', null, `border:1px solid ${c.line()};border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px`);
  devicesCard.appendChild(el('div', '已配对设备', 'font-size:13px;font-weight:600'));
  const deviceList = el('div', null, 'display:flex;flex-direction:column;gap:6px');

  const tunnelCard = el('div', null, `border:1px solid ${c.line()};border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px`);
  tunnelCard.appendChild(el('div', '第三方隧道校验（cpolar 等）', 'font-size:13px;font-weight:600'));
  tunnelCard.appendChild(el('div', '隧道需指向改写代理端口 127.0.0.1:' + lanePort + '；把公网地址粘贴到这里校验可达性。', `color:${c.text2()};font-size:12px`));
  const tunnelInput = el('input', null, `background:${c.panel()};border:1px solid ${c.line()};color:${c.text()};border-radius:8px;padding:7px 10px;font-size:13px`);
  tunnelInput.placeholder = 'https://xxxx.cpolar.cn';
  const tunnelResult = el('div', '', `color:${c.text2()};font-size:12px`);
  const tunnelBtn = btn('校验', true);
  tunnelBtn.onclick = async () => {
    tunnelResult.textContent = '校验中…';
    tunnelResult.style.color = c.text2();
    try {
      const r = await lane('/api/pair/probe?url=' + encodeURIComponent(tunnelInput.value.trim()));
      tunnelResult.textContent = r.ok ? '✓ 可达 · 改写反代放行（HTTP ' + (r.status ?? '') + '）' : '✗ 不可达：' + (r.reason ?? '');
      tunnelResult.style.color = r.ok ? '#2fbf71' : '#e5484d';
    } catch (e) {
      tunnelResult.textContent = '校验失败：' + e.message;
      tunnelResult.style.color = '#e5484d';
    }
  };
  tunnelCard.appendChild(tunnelInput);
  tunnelCard.appendChild(tunnelBtn);
  tunnelCard.appendChild(tunnelResult);

  const pairLink = (token) => 'dsh-mobile://pair?token=' + token + '&base=127.0.0.1:' + lanePort;

  const refresh = async () => {
    try {
      const st = await lane('/api/pair/devices');
      statusLine.textContent = '配对服务正常';
      statusLine.style.color = c.text2();
      if (st.tokenRef) {
        tokenRef.textContent = st.tokenRef;
        tokenHint.textContent = '10 分钟有效 · 一次性';
        linkBox.textContent = '令牌已铸造：' + st.tokenRef + '（完整令牌仅铸造时可见一次，刷新即作废旧）';
      } else {
        tokenRef.textContent = '未铸造';
        tokenHint.textContent = '';
        linkBox.textContent = '点击「铸造令牌」生成配对链接';
      }
      deviceList.textContent = '';
      if (!st.devices.length) {
        deviceList.appendChild(el('div', '暂无配对设备', `color:${c.text2()};font-size:12px`));
      } else {
        for (const d of st.devices) {
          const row = el('div', null, 'display:flex;justify-content:space-between;align-items:center');
          row.appendChild(el('span', `${d.name} · ${d.online ? '在线' : '离线'}`, `color:${c.text()};font-size:13px`));
          deviceList.appendChild(row);
        }
      }
    } catch (e) {
      statusLine.textContent = '配对服务不可达：' + e.message;
      statusLine.style.color = '#e5484d';
    }
  };

  const mint = async () => {
    try {
      const r = await lane('/api/pair/mint', { method: 'POST', body: {} });
      const link = pairLink(r.token);
      linkBox.textContent = link;
      linkBox.dataset.link = link;
      tokenHint.textContent = '10 分钟有效 · 一次性 · 完整链接已生成';
      await refresh();
    } catch (e) {
      statusLine.textContent = '铸造失败：' + e.message;
      statusLine.style.color = '#e5484d';
    }
  };

  const stopAll = async () => {
    try {
      await lane('/api/pair/stop', { method: 'POST', body: {} });
      await refresh();
    } catch (e) {
      statusLine.textContent = '停止失败：' + e.message;
      statusLine.style.color = '#e5484d';
    }
  };

  tokenRow.appendChild(el('span', '配对令牌', `color:${c.text2()};font-size:12px`));
  tokenRow.appendChild(tokenRef);
  tokenRow.appendChild(tokenHint);

  const actions = el('div', null, 'display:flex;gap:8px;flex-wrap:wrap');
  const mintBtn = btn('铸造令牌');
  mintBtn.onclick = mint;
  const copyBtn = btn('复制配对链接', true);
  copyBtn.onclick = () => { if (linkBox.dataset.link) navigator.clipboard?.writeText(linkBox.dataset.link).catch(() => {}); };
  const stopBtn = btn('停止访问', true);
  stopBtn.onclick = stopAll;
  actions.appendChild(mintBtn);
  actions.appendChild(copyBtn);
  actions.appendChild(stopBtn);

  statusCard.appendChild(statusLine);
  statusCard.appendChild(tokenRow);
  statusCard.appendChild(linkBox);
  statusCard.appendChild(actions);
  devicesCard.appendChild(deviceList);

  root.appendChild(title);
  root.appendChild(sub);
  root.appendChild(statusCard);
  root.appendChild(tunnelCard);
  root.appendChild(devicesCard);

  void refresh();
  return root;
}