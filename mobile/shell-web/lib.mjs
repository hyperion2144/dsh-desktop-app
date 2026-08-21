// H5 手机壳核心纯逻辑：配对输入解析、进入地址组装、配对列表存储（可注入存储适配器）。

// 解析配对输入：支持三种形态 → { token, base } | null
//   dsh-mobile://pair?token=..&base=host:port[,host2:port]
//   http(s)://host:port/pair?token=..
//   host:port（配合桌面显示的令牌单独输入）
export function parsePairInput(input, extraToken = '') {
  const s = String(input ?? '').trim();
  let token = '', base = '';
  if (s.startsWith('dsh-mobile://')) {
    const u = new URL(s);
    token = u.searchParams.get('token') ?? extraToken;
    base = u.searchParams.get('base') ?? '';
  } else if (/^https?:\/\//.test(s)) {
    const u = new URL(s);
    token = u.searchParams.get('token') ?? extraToken;
    const path = u.pathname === '/pair' ? '' : u.pathname;
    base = u.host + path;
  } else if (/^[^/\s]+:\d{1,5}$/.test(s)) {
    base = s;
    token = extraToken;
  } else {
    return null;
  }
  if (!token || !base) return null;
  return { token, base };
}

// 组装进入地址：http(s)://base/（dsh 页面；移动布局由注入的 dsh-mobile-nav 负责）
export function buildEnterUrl(base, scheme = 'http') {
  return scheme + '://' + base + '/';
}

// 配对列表存储（默认 localStorage；测试可传入内存适配器）
export function createPairStore(storage) {
  const mem = new Map();
  const get = (k) => (storage ? storage.getItem(k) : mem.get(k));
  const set = (k, v) => (storage ? storage.setItem(k, v) : mem.set(k, v));
  return {
    list: () => { const raw = get('dsh-mobile-pairs') ?? '[]'; try { return JSON.parse(raw); } catch { return []; } },
    add(pair) {
      const list = this.list();
      if (!list.some((p) => p.base === pair.base)) list.push(pair);
      this.save(list);
      return list;
    },
    remove(base) { this.save(this.list().filter((p) => p.base !== base)); },
    save(list) { set('dsh-mobile-pairs', JSON.stringify(list)); },
    active: (base) => set('dsh-mobile-active', base ?? ''),
    activeBase: () => get('dsh-mobile-active') ?? '',
  };
}