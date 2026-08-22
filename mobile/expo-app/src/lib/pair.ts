// 手机壳核心纯逻辑（自 shell-web/lib.mjs 移植，行为保持一致）：
// 配对输入解析、进入地址组装、配对列表存储（可注入存储适配器）。
// 平台无关：浏览器 / RN / vitest 均可直接使用。

export interface PairInput {
  token: string;
  base: string;
}

export interface PairEntry {
  token: string;
  base: string;
  name?: string;
}

export interface PairStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const PAIRS_KEY = 'dsh-mobile-pairs';
const ACTIVE_KEY = 'dsh-mobile-active';

/**
 * 解析配对输入，支持三种形态 → { token, base } | null
 *   dsh-mobile://pair?token=..&base=host:port[,host2:port]
 *   http(s)://host:port/pair?token=..
 *   host:port（配合桌面显示的令牌单独输入，token 由 extraToken 提供）
 */
export function parsePairInput(input: string, extraToken = ''): PairInput | null {
  const s = String(input ?? '').trim();
  let token = '';
  let base = '';
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

/**
 * 组装进入地址：http(s)://base/（dsh 页面；移动布局由注入的 dsh-mobile-nav 负责）
 */
export function buildEnterUrl(base: string, scheme = 'http'): string {
  return scheme + '://' + base + '/';
}

/**
 * 配对列表存储（默认内存；传入 storage 适配器可接 AsyncStorage / localStorage）
 */
export function createPairStore(storage?: PairStorage | null) {
  const mem = new Map<string, string>();
  const get = (k: string) => (storage ? storage.getItem(k) : mem.get(k));
  const set = (k: string, v: string) => {
    if (storage) storage.setItem(k, v);
    else mem.set(k, v);
  };
  return {
    list(): PairEntry[] {
      const raw = get(PAIRS_KEY) ?? '[]';
      try {
        return JSON.parse(raw) as PairEntry[];
      } catch {
        return [];
      }
    },
    add(pair: PairEntry): PairEntry[] {
      const list = this.list();
      if (!list.some((p) => p.base === pair.base)) list.push(pair);
      this.save(list);
      return list;
    },
    remove(base: string): void {
      this.save(this.list().filter((p) => p.base !== base));
    },
    save(list: PairEntry[]): void {
      set(PAIRS_KEY, JSON.stringify(list));
    },
    active(base?: string): void {
      set(ACTIVE_KEY, base ?? '');
    },
    activeBase(): string {
      return get(ACTIVE_KEY) ?? '';
    },
  };
}

/**
 * 从深链 URL 直接解析（App 冷启动 / 已运行时被 dsh-mobile:// 拉起时使用）
 */
export function parseDeepLink(url: string): PairInput | null {
  if (!url) return null;
  return parsePairInput(url);
}