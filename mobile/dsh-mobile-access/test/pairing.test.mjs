import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PairingStore, deviceNameFromUA, fingerprint } from '../lib/pairing.mjs';

test('令牌生命周期：mint/validate/过期/revoke', async () => {
  const s = new PairingStore({ tokenTtlMs: 40 });
  const t = s.mint();
  assert.equal(s.validate(t), true);
  assert.equal(s.validate('bad'), false);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(s.validate(t), false);
  const t2 = s.mint();
  s.revoke();
  assert.equal(s.validate(t2), false);
});

test('接受配对：一次性、设备会话与 cookie、取消、停止', () => {
  const s = new PairingStore();
  const t = s.mint();
  const first = s.accept(t, { name: 'iPhone 15 Pro' });
  assert.ok(first);
  assert.equal(s.accept(t, {}), null); // 令牌已作废
  assert.equal(s.isDevice(first.cookie), true);
  assert.equal(s.isDevice('nope'), false);
  assert.equal(s.snapshotDevices().length, 1);
  assert.equal(s.snapshotDevices()[0].name, 'iPhone 15 Pro');
  // 再铸新令牌可配对第二台
  const t2 = s.mint();
  const second = s.accept(t2, { name: 'Xiaomi 14' });
  assert.ok(second);
  assert.equal(s.snapshotDevices().length, 2);
  s.removeDevice(first.deviceId);
  assert.equal(s.snapshotDevices().length, 1);
  assert.equal(s.isDevice(first.cookie), false);
  s.stopAll();
  assert.equal(s.snapshotDevices().length, 0);
});

test('SSE 帧与工具函数', () => {
  const s = new PairingStore();
  const frame = s.sse('devices', [{ deviceId: 'a' }]);
  assert.ok(frame.startsWith('event: devices\ndata: '));
  assert.ok(frame.endsWith('\n\n'));
  assert.equal(deviceNameFromUA('Mozilla ... iPhone; CPU iPhone OS 17'), 'iPhone');
  assert.equal(deviceNameFromUA('HarmonyOS NEXT'), 'HarmonyOS');
  assert.equal(deviceNameFromUA(''), '未知设备');
  assert.match(fingerprint('abc'), /^[0-9a-f]{12}$/);
});

