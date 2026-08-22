// 配对核心逻辑（自 shell-web/lib.mjs 移植为 ArkTS，行为保持一致）。
// 纯逻辑：配对输入解析、进入地址组装；存储由调用方注入（preferences 适配）。
import { URL } from '@kit.ArkTS';

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

function hashCodeOfBase(base: string): string {
  // 供去重比较用的稳定 key（直接比较 base 字符串即可，此函数保留语义占位）
  return base;
}

export class PairLogic {
  static parsePairInput(input: string, extraToken: string = ''): PairInput | null {
    const s = (input ?? '').trim();
    let token = '';
    let base = '';
    if (s.startsWith('dsh-mobile://')) {
      const u: URL = new URL(s);
      token = u.searchParams.get('token') ?? extraToken;
      base = u.searchParams.get('base') ?? '';
    } else if (/^https?:\/\//.test(s)) {
      const u: URL = new URL(s);
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
    return { token: token, base: base };
  }

  static buildEnterUrl(base: string, scheme: string = 'http'): string {
    return scheme + '://' + base + '/';
  }

  /** 配对列表存储（内存态；storage 适配器负责持久化，如 preferences） */
  static createPairStore(storage: PairStorage | null) {
    const mem = new Map<string, string>();
    const get = (k: string): string | null => (storage != null ? storage.getItem(k) : (mem.get(k) ?? null));
    const set = (k: string, v: string): void => {
      if (storage != null) storage.setItem(k, v);
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
        const list: PairEntry[] = this.list();
        if (!list.some((p) => hashCodeOfBase(p.base) === hashCodeOfBase(pair.base))) {
          list.push(pair);
        }
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
}