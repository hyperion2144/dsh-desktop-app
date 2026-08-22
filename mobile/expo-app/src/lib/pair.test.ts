import { describe, it, expect } from 'vitest';
import { parsePairInput, buildEnterUrl, createPairStore, parseDeepLink } from './pair';

describe('parsePairInput 三种形态', () => {
  it('dsh-mobile:// 深链', () => {
    expect(parsePairInput('dsh-mobile://pair?token=t1&base=192.168.1.23%3A3091')).toEqual({
      token: 't1',
      base: '192.168.1.23:3091',
    });
  });
  it('https 链接 /pair', () => {
    expect(parsePairInput('https://x.cn:8080/pair?token=t2')).toEqual({
      token: 't2',
      base: 'x.cn:8080',
    });
  });
  it('host:port + 额外令牌', () => {
    expect(parsePairInput('192.168.1.23:3091', 'tok3')).toEqual({
      token: 'tok3',
      base: '192.168.1.23:3091',
    });
  });
  it('非法输入返回 null', () => {
    expect(parsePairInput('乱写')).toBeNull();
    expect(parsePairInput('x.cn:8080')).toBeNull(); // 无令牌
  });
});

describe('buildEnterUrl', () => {
  it('拼装 http 进入地址', () => {
    expect(buildEnterUrl('a.cn:3091')).toBe('http://a.cn:3091/');
    expect(buildEnterUrl('a.cn:3091', 'https')).toBe('https://a.cn:3091/');
  });
});

describe('createPairStore（内存适配器）', () => {
  it('增删去重与 active 记录', () => {
    const store = createPairStore(null);
    store.add({ token: 't', base: 'a.cn:3091', name: '家里' });
    store.add({ token: 't', base: 'b.cn:3091', name: '公司' });
    store.add({ token: 't', base: 'a.cn:3091', name: '家里' }); // 去重
    expect(store.list().length).toBe(2);
    store.active('a.cn:3091');
    expect(store.activeBase()).toBe('a.cn:3091');
    store.remove('a.cn:3091');
    expect(store.list().length).toBe(1);
  });
});

describe('parseDeepLink', () => {
  it('空串返回 null，合法深链正常解析', () => {
    expect(parseDeepLink('')).toBeNull();
    expect(parseDeepLink('dsh-mobile://pair?token=t9&base=1.2.3.4%3A3091')).toEqual({
      token: 't9',
      base: '1.2.3.4:3091',
    });
  });
});