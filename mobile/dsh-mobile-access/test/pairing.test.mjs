import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PairingStore, deviceNameFromUA, fingerprint, createMemoryStorage, createFileStorage } from '../lib/pairing.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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



test('持久化：内存存储适配器恢复设备会话与令牌', () => {
  const storage = createMemoryStorage();
  const s1 = new PairingStore({ storage });
  const t = s1.mint();
  const acc = s1.accept(t, { name: 'Pixel 9' });
  assert.ok(acc);
  // 模拟重启：同一存储新建 store
  const s2 = new PairingStore({ storage });
  assert.equal(s2.isDevice(acc.cookie), true, '重启后设备 cookie 应恢复');
  assert.equal(s2.snapshotDevices().length, 1);
  assert.equal(s2.snapshotDevices()[0].name, 'Pixel 9');
  // 令牌已一次性消费，恢复后仍无效
  assert.equal(s2.validate(t), false);
  // removeDevice 持久化
  s2.removeDevice(acc.deviceId);
  const s3 = new PairingStore({ storage });
  assert.equal(s3.snapshotDevices().length, 0);
});

test('持久化：文件存储 0600 + 重启恢复', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-pair-'));
  const file = path.join(dir, 'pairing.json');
  try {
    const storage = createFileStorage(file);
    const s1 = new PairingStore({ storage });
    const t = s1.mint();
    const acc = s1.accept(t, { name: 'iPhone' });
    assert.ok(acc);
    // 文件存在且 0600
    const mode = fs.statSync(file).mode & 0o777;
    assert.equal(mode, 0o600, '设备会话文件必须 0600');
    // 重启恢复
    const s2 = new PairingStore({ storage: createFileStorage(file) });
    assert.equal(s2.isDevice(acc.cookie), true);
    assert.equal(s2.snapshotDevices()[0].name, 'iPhone');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
