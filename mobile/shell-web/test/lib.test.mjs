import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePairInput, buildEnterUrl, buildEntryUrl, createPairStore } from '../lib.mjs';

test('parsePairInput 三种形态', () => {
  const a = parsePairInput('dsh-mobile://pair?token=t1&base=192.168.1.23%3A3091');
  assert.deepEqual(a, { token: 't1', base: '192.168.1.23:3091' });
  const b = parsePairInput('https://x.cn:8080/pair?token=t2');
  assert.deepEqual(b, { token: 't2', base: 'x.cn:8080', entryUrl: 'https://x.cn:8080/pair?token=t2' });
  const c = parsePairInput('192.168.1.23:3091', 'tok3');
  assert.deepEqual(c, { token: 'tok3', base: '192.168.1.23:3091' });
  assert.equal(parsePairInput('乱写'), null);
  assert.equal(parsePairInput('x.cn:8080'), null); // 无令牌
});

test('buildEnterUrl / buildEntryUrl', () => {
  assert.equal(buildEnterUrl('a.cn:3091'), 'http://a.cn:3091/');
  // entryUrl 优先（自动配对后再进应用）
  assert.equal(buildEntryUrl({ token: 't', base: 'a.cn:3091', entryUrl: 'https://a.cn:3091/pair?token=t' }), 'https://a.cn:3091/pair?token=t');
  // 无 entryUrl（dsh-mobile:// 或已保存配对）→ 直连
  assert.equal(buildEntryUrl({ token: 't', base: 'a.cn:3091' }), 'http://a.cn:3091/');
});

test('createPairStore（内存适配器）', () => {
  const store = createPairStore(null);
  store.add({ token: 't', base: 'a.cn:3091', name: '家里' });
  store.add({ token: 't', base: 'b.cn:3091', name: '公司' });
  store.add({ token: 't', base: 'a.cn:3091', name: '家里' }); // 去重
  assert.equal(store.list().length, 2);
  store.active('a.cn:3091');
  assert.equal(store.activeBase(), 'a.cn:3091');
  store.remove('a.cn:3091');
  assert.equal(store.list().length, 1);
});
