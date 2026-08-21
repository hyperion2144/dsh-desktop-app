// 配对令牌生命周期 + 设备会话 + SSE 事件编码（自实现）。
import { randomBytes, createHash } from 'node:crypto';

export const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 分钟

export class PairingStore {
  constructor({ tokenTtlMs = TOKEN_TTL_MS } = {}) {
    this.tokenTtlMs = tokenTtlMs;
    this.token = null;
    this.tokenExpiresAt = 0;
    this.devices = new Map();
    this.listeners = [];
  }
  // 铸一枚新令牌（旧令牌自动作废）。
  mint() {
    const raw = randomBytes(16).toString('hex');
    this.token = raw;
    this.tokenExpiresAt = Date.now() + this.tokenTtlMs;
    this.emit('token', { ref: this.ref(), expiresAt: this.tokenExpiresAt });
    return raw;
  }
  // 令牌引用（展示用，非完整令牌）。
  ref() {
    return this.token ? '••••' + this.token.slice(-4) : '';
  }
  // 令牌有效：存在、未过期、且与输入一致。
  validate(token) {
    if (!this.token || Date.now() > this.tokenExpiresAt || token !== this.token) return false;
    return true;
  }
  // 使当前令牌失效（旧链接作废）。
  revoke() {
    if (this.token) this.emit('token', { ref: this.ref(), revoked: true });
    this.token = null;
    this.tokenExpiresAt = 0;
  }
  // 接受配对：令牌正确 & 未过期 → 创建设备会话；接受后令牌作废（一次性）。
  accept(token, { name = '未知设备' } = {}) {
    if (!this.validate(token)) return null;
    const deviceId = randomBytes(8).toString('hex');
    const cookie = randomBytes(16).toString('hex');
    this.devices.set(deviceId, { name, pairedAt: Date.now(), cookie, lastSeen: Date.now(), online: true });
    this.revoke();
    this.emit('devices', this.snapshotDevices());
    this.emit('state', { paired: true });
    return { deviceId, cookie };
  }
  // 会话 cookie 是否仍然有效。
  isDevice(authCookie) {
    if (!authCookie) return false;
    for (const d of this.devices.values()) {
      if (d.cookie === authCookie) { d.lastSeen = Date.now(); return true; }
    }
    return false;
  }
  // 取消单个设备配对。
  removeDevice(deviceId) {
    const had = this.devices.delete(deviceId);
    if (had) this.emit('devices', this.snapshotDevices());
    return had;
  }
  // 撤销全部设备与令牌（停止访问）。
  stopAll() {
    this.devices.clear();
    this.revoke();
    this.emit('state', { paired: false });
    this.emit('devices', this.snapshotDevices());
  }
  snapshotDevices() {
    return [...this.devices.entries()].map(([deviceId, d]) => ({
      deviceId, name: d.name, pairedAt: d.pairedAt, lastSeen: d.lastSeen, online: d.online,
    }));
  }
  // SSE 事件帧编码（event/data 两行）。
  sse(event, data) {
    return 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n';
  }
  on(listener) { this.listeners.push(listener); return () => this._off(listener); }
  _off(listener) { this.listeners = this.listeners.filter(l => l !== listener); }
  emit(event, data) { for (const l of this.listeners) { try { l(event, data); } catch {} } }
}

// 稳定设备名（供测试断言与 UI 展示）。
export function deviceNameFromUA(ua = '') {
  const known = ['iPhone', 'Android', 'iPad', 'HarmonyOS', 'Windows', 'Macintosh', 'Linux'];
  for (const k of known) if (ua.includes(k)) return k;
  return '未知设备';
}

// 内容寻址：给链接/令牌拍指纹（测试友好）。
export function fingerprint(s) { return createHash('sha256').update(s).digest('hex').slice(0, 12); }