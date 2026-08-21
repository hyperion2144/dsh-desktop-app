import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRewriteProxy, POLYFILL, desktopEnvPatchScript } from '../lib/proxy.mjs';

function startUpstream() {
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    const html = req.url === '/' ? '<html><body>hello</body></html>' : JSON.stringify({ url: req.url, host: req.headers['host'], origin: req.headers['origin'] ?? null });
    res.writeHead(200, { 'content-type': req.url === '/' ? 'text/html' : 'application/json' });
    res.end(html);
  });
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  server.on('upgrade', (req, socket) => {
    sockets.add(socket);
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: test\r\n\r\n');
    socket.on('data', (d) => socket.write(d));
    socket.on('close', () => sockets.delete(socket));
  });
  return { server, closeAll: () => { for (const s of sockets) s.destroy(); server.closeAllConnections?.(); server.close(); } };
}

async function listen(s) { await new Promise((r) => s.listen(0, '127.0.0.1', r)); return s.address().port; }

function getRaw(u, headers) {
  return new Promise((resolve, reject) => {
    http.get(u, { headers: { Connection: 'close', ...headers } }, (res) => { let b = ''; res.setEncoding('utf8'); res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, body: b })); }).on('error', reject);
  });
}

test('改写反代：外部 Host 归一为 loopback + HTML 注入', async () => {
  const up = startUpstream();
  const upPort = await listen(up.server);
  const proxy = createRewriteProxy({ upstreamHost: '127.0.0.1', upstreamPort: upPort, inject: ['<tag-mobile-inject/>'] });
  const lp = await listen(proxy.server);
  try {
    const json = JSON.parse((await getRaw('http://127.0.0.1:' + lp + '/status', { Host: 'ext.cpolar.cn', Origin: 'https://ext.cpolar.cn' })).body);
    assert.equal(json.host, '127.0.0.1:' + upPort);
    assert.equal(json.origin, 'http://127.0.0.1:' + upPort);
    const html = (await getRaw('http://127.0.0.1:' + lp + '/', { Host: 'ext.cpolar.cn' })).body;
    assert.ok(html.includes('<tag-mobile-inject/>'));
  } finally { proxy.server.closeAllConnections?.(); proxy.server.close(); up.closeAll(); }
});

test('auth 钩子：未配对 401', async () => {
  const up = startUpstream();
  const upPort = await listen(up.server);
  const proxy = createRewriteProxy({ upstreamHost: '127.0.0.1', upstreamPort: upPort, inject: [], auth: () => ({ ok: false }) });
  const lp = await listen(proxy.server);
  try {
    const r = await getRaw('http://127.0.0.1:' + lp + '/', { Host: 'x.cn' });
    assert.equal(r.status, 401);
    assert.ok(r.body.includes('unpaired'));
  } finally { proxy.server.closeAllConnections?.(); proxy.server.close(); up.closeAll(); }
});

test('WebSocket upgrade 透传：101 + 字节回声', async () => {
  const up = startUpstream();
  const upPort = await listen(up.server);
  const proxy = createRewriteProxy({ upstreamHost: '127.0.0.1', upstreamPort: upPort, inject: [] });
  const lp = await listen(proxy.server);
  try {
    const echo = await upgradeEcho('http://127.0.0.1:' + lp + '/ws', { Origin: 'https://ext.cpolar.cn' });
    assert.equal(echo.status, 101);
    assert.equal(echo.echo, 'ping-payload');
  } finally { proxy.server.closeAllConnections?.(); proxy.server.close(); up.closeAll(); }
});

function upgradeEcho(u, headers) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('upgrade timeout')), 5000);
    const req = http.request(u, { headers: { ...headers, Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'AQIDBAUGBwgJCgsMDQ4P' } });
    req.on('upgrade', (res, socket) => {
      socket.write(Buffer.from('ping-payload'));
      socket.once('data', (d) => { clearTimeout(timer); resolve({ status: res.statusCode, echo: d.toString() }); socket.destroy(); });
    });
    req.on('error', (e) => { clearTimeout(timer); reject(e); });
    req.end();
  });
}

test('注入脚本产物', () => {
  assert.ok(POLYFILL.includes('data-dsh-mobile-polyfill'));
  assert.ok(POLYFILL.includes('randomUUID'));
  const p = desktopEnvPatchScript('darwin');
  assert.ok(p.includes('dsh-desktop-mode'));
  assert.ok(p.includes('darwin'));
});