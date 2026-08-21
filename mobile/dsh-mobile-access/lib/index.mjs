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
  } = opts;
  const store = pairing ?? new PairingStore();
  const proxy = createRewriteProxy({
    upstreamHost,
    upstreamPort,
    inject: [POLYFILL, desktopEnvPatchScript(platform)],
    auth: (req) => {
      // 已配对设备放行；未配对仅允许 /pair /api/pair/* 路由（由路由层处理）。
      const path = req.url.split('?')[0];
      if (path === '/pair' || path === '/api/pair/events') return { ok: true };
      if (path.startsWith('/api/pair/')) return { ok: true };
      const cookie = parseCookie(req.headers.cookie, 'dsh_mobile_session');
      return { ok: store.isDevice(cookie) };
    },
  });

  // 配对/授权路由（先于上游转发）：
  function routePairing(req, res) {
    const path = req.url.split('?')[0];
    if (path === '/pair') {
      const token = new URL(req.url, 'http://x').searchParams.get('token') ?? '';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, mode: store.token ? 'await-token' : 'no-token', tokenLen: token.length }));
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
            res.writeHead(403, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'invalid-token' }));
            return;
          }
          res.writeHead(200, {
            'content-type': 'application/json',
            'set-cookie': 'dsh_mobile_session=' + session.cookie + '; HttpOnly; Path=/; SameSite=Lax',
          });
          res.end(JSON.stringify({ ok: true, deviceId: session.deviceId }));
        } catch (e) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'bad-request' }));
        }
      });
      return true;
    }
    if (path === '/api/pair/devices' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ devices: store.snapshotDevices(), tokenRef: store.ref() }));
      return true;
    }
    if (path === '/api/pair/stop' && req.method === 'POST') {
      store.stopAll();
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return true;
    }
    if (path === '/api/pair/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'connection': 'keep-alive',
      });
      res.write(':ok\n\n');
      const off = store.on((event, data) => res.write(store.sse(event, data)));
      req.on('close', off);
      return true;
    }
    return false;
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