// 手机访问服务装配（host 半区）：改写反代 + 配对路由(JS 回调) + SSE + 隧道启动。
// 纯 Node 可测；桌面壳集成时在 dsh 进程内作为 bundle 插件装载。
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRewriteProxy, POLYFILL, desktopEnvPatchScript } from './proxy.mjs';
import { PairingStore, deviceNameFromUA } from './pairing.mjs';
import { selectLanIPv4, buildPairLink, buildHttpPairLink, normalizeRemote } from './links.mjs';

export function createMobileAccessService(opts = {}) {
  const {
    upstreamHost = '127.0.0.1',
    upstreamPort = 3080,
    platform = 'linux',
    pairing = null,
    warn = null,
    fetchImpl = null,
  } = opts;
  const store = pairing ?? new PairingStore();
  const proxy = createRewriteProxy({
    upstreamHost,
    upstreamPort,
    inject: [POLYFILL, desktopEnvPatchScript(platform)],
    auth: (req) => {
      // 配对门禁：所有到达反代本体的路径都必须是已配对设备（携带会话 cookie）。
      // 不做任何 /api/pair/* 前缀豁免——配对/控制路由全部由 routePairing 先行处理，
      // 打到这里的不属于路由表，一律要求 cookie，杜绝「前缀豁免 + 上游路径归一化」绕过。
      const cookie = parseCookie(req.headers.cookie, 'dsh_mobile_session');
      return { ok: store.isDevice(cookie) };
    },
    onInjectSkip: opts.warn
      ? (p) => opts.warn('[dsh-mobile-access] 上游压缩 HTML，跳过注入（该页无 polyfill/桌面补丁）: ' + p)
      : undefined,
  });

  // 本地属主判定：桌面壳（同一台机器）经 loopback 直连 lane 端口，且无隧道加插的
  // X-Forwarded-For —— 视为属主控制台。公网/局域网设备一律经隧道（非 loopback Host
  // 或带 XFF），只能凭设备 cookie 访问控制端点。
  function isLocalOwner(req) {
    const host = String(req.headers.host ?? '').split(':')[0];
    const loopback = host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '';
    return loopback && !req.headers['x-forwarded-for'];
  }

  // 配对/授权路由（先于上游转发）：
  function routePairing(req, res) {
    const path = req.url.split('?')[0];
    const authed = store.isDevice(parseCookie(req.headers.cookie, 'dsh_mobile_session'));
    const owner = isLocalOwner(req);
    const canManage = owner || authed;
    const unpaired401 = () => {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unpaired' }));
    };
    // 属主控制台（同机 loopback 设置页）跨域读取配对状态：CORS 仅放行回环源
    const cors = {
      'access-control-allow-origin': allowCorsOrigin(req.headers.origin, req.headers.host) ?? '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'vary': 'Origin',
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return true;
    }
    const json = (status, body, extra = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...cors, ...extra });
      res.end(JSON.stringify(body));
    };
    if (path === '/pair') {
      const token = new URL(req.url, 'http://x').searchParams.get('token') ?? '';
      json(200, { ok: true, mode: store.token ? 'await-token' : 'no-token', tokenLen: token.length });
      return true;
    }
    if (path === '/api/pair/mint' && req.method === 'POST') {
      // 仅属主：铸造新令牌（旧令牌自动作废）
      if (!owner) { unpaired401(); return true; }
      const token = store.mint();
      json(200, { ok: true, token, expiresAt: store.tokenExpiresAt });
      return true;
    }
    if (path === '/api/pair/probe' && req.method === 'GET') {
      // 仅属主：校验第三方隧道地址（cpolar 等）。要求 http(s) URL，探测其 /pair
      // 路由可达（改写反代放行）；loopback 与 tauri.localhost 拒绝。
      if (!owner) { unpaired401(); return true; }
      const raw = new URL(req.url, 'http://x').searchParams.get('url') ?? '';
      void runProbe(raw, json);
      return true;
    }
    if (path === '/api/pair/accept' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try {
          const { token, name } = JSON.parse(body || '{}');
          const session = store.accept(token, { name: name || deviceNameFromUA(req.headers['user-agent'] ?? '') });
          if (!session) {
            json(403, { error: 'invalid-token' });
            return;
          }
          json(200, { ok: true, deviceId: session.deviceId }, {
            'set-cookie': 'dsh_mobile_session=' + session.cookie + '; HttpOnly; Path=/; SameSite=Lax',
          });
        } catch (e) {
          json(400, { error: 'bad-request' });
        }
      });
      return true;
    }
    if (path === '/api/pair/devices' && req.method === 'GET') {
      if (!canManage) { unpaired401(); return true; }
      json(200, { devices: store.snapshotDevices(), tokenRef: store.ref() });
      return true;
    }
    if (path === '/api/pair/stop' && req.method === 'POST') {
      if (!canManage) { unpaired401(); return true; }
      store.stopAll();
      json(200, { ok: true });
      return true;
    }
    if (path === '/api/pair/events') {
      if (!canManage) { unpaired401(); return true; }
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'connection': 'keep-alive',
        ...cors,
      });
      res.write(':ok\n\n');
      const off = store.on((event, data) => res.write(store.sse(event, data)));
      req.on('close', off);
      return true;
    }
    return false;
  }

  // 第三方隧道地址探测（异步；结果经 json 回调写出）。
  async function runProbe(raw, json) {
    const verdict = { ok: false, reason: 'invalid-url' };
    const m = String(raw).match(/^(https?):\/\/([^/]+)(\/.*)?$/);
    if (m) {
      const scheme = m[1];
      const host = m[2];
      const isLoopback = /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) || /^\[::1\]/.test(host);
      const isTuna = /tauri\.localhost$/i.test(host);
      if (!isLoopback && !isTuna) {
        try {
          const doFetch = fetchImpl ?? ((u, o) => fetch(u, o));
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 5000);
          const r = await doFetch(scheme + '://' + host + '/pair', { signal: ctrl.signal, headers: { Connection: 'close' } });
          clearTimeout(timer);
          verdict.ok = r.ok || r.status === 404;
          verdict.status = r.status;
          verdict.reason = verdict.ok ? 'reachable' : 'http-' + r.status;
        } catch {
          verdict.reason = 'unreachable';
        }
      } else {
        verdict.reason = 'loopback-or-tuna-not-allowed';
      }
    }
    json(200, verdict);
  }

  // 包裹 server 的 request 处理：优先路由，其次反代。
  const originalHandler = proxy.server.listeners('request')[0];
  proxy.server.removeAllListeners('request');
  proxy.server.on('request', (req, res) => {
    if (routePairing(req, res)) return;
    originalHandler(req, res);
  });

  function startTunnel(cloudflaredBin, lanePort) {
    if (!cloudflaredBin) return { child: null, urlPromise: Promise.resolve(null) };
    const child = spawn(cloudflaredBin, ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:' + lanePort], { stdio: ['ignore', 'pipe', 'pipe'] });
    const urlPromise = new Promise((resolve) => {
      let out = '';
      child.stdout.on('data', (c) => { out += c; const m = out.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/); if (m) resolve(m[0]); });
      child.stderr.on('data', () => {});
      setTimeout(() => resolve(null), 30000);
    });
    return { child, urlPromise };
  }

  return {
    store,
    proxy,
    routePairing,
    selectLanIPv4,
    buildPairLink,
    buildHttpPairLink,
    normalizeRemote,
    startTunnel,
    listen: (port = 0) => new Promise((res) => { proxy.server.listen(port, '127.0.0.1', () => res(proxy.server.address().port)); }),
    close: () => new Promise((res) => proxy.server.close(() => res())),
  };
}

export function parseCookie(header, name) {
  if (!header) return '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

// CORS 源白名单：仅放行来自回环（本机 dsh 设置页）的跨域读取；其它 Origin 一律不回显。
export function allowCorsOrigin(origin, hostHeader) {
  if (!origin) return null;
  const o = String(origin);
  if (/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(o)) return o;
  return null;
}

/**
 * dsh bundle 插件 host 半区入口：随 dsh web 进程装载时启动 lane 改写反代与配对服务。
 * 配置走环境变量（桌面壳 spawn 时注入）：
 *   DSH_MOBILE_ENABLED        = '0' 关闭（默认开）
 *   DSH_MOBILE_LANE_PORT      = lane 端口（默认 3091）
 *   DSH_DESKTOP_PORT          = 上游 dsh web 端口（默认 3080）
 *   DSH_CLOUDFLARED_BIN       = cloudflared 可执行文件路径（设置后自动起隧道）
 * 生命周期：ctx dispose 时关闭 lane 并回收 cloudflared 子进程。
 * 注：桌面壳插件的 host 半区若无需启动服务（如 dsh-desktop-tauriapp 仅技能）可留空 apply。
 */
export function apply(ctx) {
  const platform = typeof process !== 'undefined' ? process.platform : '';
  if (!platform || !ctx || typeof ctx.on !== 'function') return;
  if (process.env.DSH_MOBILE_ENABLED === '0') return;
  const lanePort = Number(process.env.DSH_MOBILE_LANE_PORT || 3091);
  const upstreamPort = Number(process.env.DSH_DESKTOP_PORT || 3080);
  const svc = createMobileAccessService({
    upstreamHost: '127.0.0.1',
    upstreamPort,
    platform,
    warn: (m) => { try { ctx?.logger?.warn?.(m); } catch { /* noop */ } },
  });
  let tunnelChild = null;
  let closed = false;
  const boot = async () => {
    try {
      await svc.listen(lanePort);
    } catch (e) {
      try { ctx?.logger?.error?.(`dsh-mobile-access: lane ${lanePort} 启动失败: ${e}`); } catch { /* noop */ }
      return;
    }
    try { ctx?.logger?.info?.(`dsh-mobile-access: lane 改写反代已监听 127.0.0.1:${lanePort} → ${svc.proxy.upstream}`); } catch { /* noop */ }
    const bin = process.env.DSH_CLOUDFLARED_BIN || '';
    if (bin) {
      const t = svc.startTunnel(bin, lanePort);
      tunnelChild = t.child;
      const url = await t.urlPromise;
      if (url && !closed) {
        svc.store.emit('tunnel', { url });
        try { ctx?.logger?.info?.(`dsh-mobile-access: cloudflared 隧道 ${url}`); } catch { /* noop */ }
      } else if (!url) {
        try { ctx?.logger?.warn?.('dsh-mobile-access: cloudflared 30s 未上报隧道地址'); } catch { /* noop */ }
      }
    }
  };
  void boot();
  ctx.on('dispose', () => {
    closed = true;
    if (tunnelChild) { try { tunnelChild.kill(); } catch { /* noop */ } }
    void svc.close();
  });
}