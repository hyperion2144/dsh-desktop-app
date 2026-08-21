import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createMobileAccessService, parseCookie } from '../lib/index.mjs';

function startStub() { const s = http.createServer((_q, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('upstream'); }); return s; }

const HQ = { Connection: 'close' };
async function textGet(u, opt = {}) {
  const res = await fetch(u, { method: opt.method ?? 'GET', headers: { ...HQ, ...(opt.headers ?? {}) }, body: opt.body });
  return { status: res.status, text: await res.text() };
}

async function jget(u, opt = {}) {
  const res = await fetch(u, { method: opt.method ?? 'GET', headers: { 'content-type': 'application/json', ...HQ, ...(opt.headers ?? {}) }, body: opt.body });
  const body = await res.text();
  return { status: res.status, setCookie: String(res.headers.get('set-cookie') ?? ''), body: body ? JSON.parse(body) : null };
}

test('服务装配：配对路由全链路', async () => {
  const stub = startStub();
  await new Promise((r) => stub.listen(0, '127.0.0.1', r));
  const svc = createMobileAccessService({ upstreamPort: stub.address().port, platform: 'darwin' });
  const lp = await svc.listen();
  try {
    const pairPre = await jget('http://127.0.0.1:' + lp + '/pair');
    assert.equal(pairPre.body.ok, true);
    const bad = await jget('http://127.0.0.1:' + lp + '/api/pair/accept', { method: 'POST', body: JSON.stringify({ token: 'nope' }) });
    assert.equal(bad.status, 403);
    const token = svc.store.mint();
    const acc = await jget('http://127.0.0.1:' + lp + '/api/pair/accept', { method: 'POST', body: JSON.stringify({ token, name: 'Pixel 9' }) });
    assert.equal(acc.status, 200);
    const cookie = acc.setCookie;
    assert.ok(cookie.includes('dsh_mobile_session='));
    const dev = await jget('http://127.0.0.1:' + lp + '/api/pair/devices');
    assert.equal(dev.body.devices.length, 1);
    assert.equal(dev.body.devices[0].name, 'Pixel 9');
    assert.equal(dev.body.tokenRef, '');
    const up = await textGet('http://127.0.0.1:' + lp + '/x', { headers: { cookie: cookie.split(';')[0] } });
    assert.equal(up.text, 'upstream');
    const stop = await jget('http://127.0.0.1:' + lp + '/api/pair/stop', { method: 'POST', body: '{}' });
    assert.equal(stop.body.ok, true);
    const dev2 = await jget('http://127.0.0.1:' + lp + '/api/pair/devices');
    assert.equal(dev2.body.devices.length, 0);
  } finally {
    svc.proxy.server.closeAllConnections?.(); stub.closeAllConnections?.();
    await svc.close();
    stub.close();
  }
});

test('SSE 事件路由返回 text/event-stream', async () => {
  const stub = startStub();
  await new Promise((r) => stub.listen(0, '127.0.0.1', r));
  const svc = createMobileAccessService({ upstreamPort: stub.address().port });
  const lp = await svc.listen();
  try {
    const res = await fetch('http://127.0.0.1:' + lp + '/api/pair/events', { headers: HQ });
    assert.ok(String(res.headers.get('content-type')).includes('text/event-stream'));
    await res.body?.cancel();
  } finally {
    svc.proxy.server.closeAllConnections?.(); stub.closeAllConnections?.();
    await svc.close();
    stub.close();
  }
});

test('parseCookie', () => {
  assert.equal(parseCookie('a=1; dsh_mobile_session=abc; b=2', 'dsh_mobile_session'), 'abc');
  assert.equal(parseCookie('', 'x'), '');
});

