// AsyncStorage 适配的配对存储（纯逻辑在 src/lib/pair.ts，这里只接异步读写的 `PairStorage` 适配器）。
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createPairStore, type PairEntry } from './lib/pair';

// 内存态存储（App 启动时从 AsyncStorage 加载，之后同步读写内存；保存时落盘）
const mem = new Map<string, string>();

const store = createPairStore({
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => {
    mem.set(k, v);
    void AsyncStorage.setItem(k, v);
  },
});

export async function loadPairs(): Promise<PairEntry[]> {
  for (const k of ['dsh-mobile-pairs', 'dsh-mobile-active']) {
    const v = await AsyncStorage.getItem(k);
    if (v != null) mem.set(k, v);
  }
  return store.list();
}

export function pairs() {
  return store.list();
}

export function addPair(pair: PairEntry) {
  return store.add(pair);
}

export function removePair(base: string) {
  store.remove(base);
}

export function setActive(base?: string) {
  store.active(base);
}

export function getActiveBase(): string {
  return store.activeBase();
}