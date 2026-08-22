import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Alert,
  Linking,
} from 'react-native';
import { shellStyles, palette } from '../theme';
import { parsePairInput, buildEnterUrl, type PairEntry } from '../lib/pair';
import {
  loadPairs,
  pairs,
  addPair,
  removePair,
  setActive,
  getActiveBase,
} from '../store';

export type EnterTarget = { url: string; base: string; name: string };

export function HomeScreen({ onEnter }: { onEnter: (t: EnterTarget) => void }) {
  const [list, setList] = useState<PairEntry[]>([]);
  const [input, setInput] = useState('');
  const [token, setToken] = useState('');
  const [err, setErr] = useState('');

  const refresh = useCallback(() => setList([...pairs()]), []);

  useEffect(() => {
    void loadPairs().then(refresh);
    // 深链：dsh-mobile://pair?token=..&base=..
    void Linking.getInitialURL().then((u) => {
      if (u) handleDeepLink(u);
    });
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDeepLink(url: string) {
    const p = parsePairInput(url);
    if (!p) return;
    addPair({ ...p, name: '扫码配对' });
    refresh();
    enterPair(p);
  }

  function enterPair(p: { token: string; base: string; name?: string }) {
    setActive(p.base);
    onEnter({ url: buildEnterUrl(p.base), base: p.base, name: p.name ?? p.base });
  }

  function submit() {
    const p = parsePairInput(input, token);
    if (!p) {
      setErr('无法解析：请粘贴 dsh-mobile:// 链接、http(s) 配对链接，或输入 host:端口 并填写令牌');
      return;
    }
    setErr('');
    addPair(p);
    refresh();
    setInput('');
    setToken('');
    enterPair(p);
  }

  function onRemove(base: string) {
    Alert.alert('删除配对', `确定删除 ${base} 吗？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => { removePair(base); refresh(); } },
    ]);
  }

  return (
    <View style={shellStyles.page}>
      <Text style={shellStyles.title}>DeepSeek 手机访问</Text>
      <Text style={shellStyles.sub}>
        粘贴桌面端显示的配对链接（dsh-mobile:// 或 http(s) 链接），或输入 host:端口 并单独填写配对令牌。
      </Text>

      <TextInput
        style={shellStyles.input}
        placeholder="配对链接或 host:端口"
        placeholderTextColor={palette.text2}
        autoCapitalize="none"
        autoCorrect={false}
        value={input}
        onChangeText={setInput}
      />
      <TextInput
        style={shellStyles.input}
        placeholder="配对令牌（链接已含令牌时可留空）"
        placeholderTextColor={palette.text2}
        autoCapitalize="none"
        autoCorrect={false}
        value={token}
        onChangeText={setToken}
      />
      {err ? <Text style={shellStyles.errText}>{err}</Text> : null}
      <Pressable style={shellStyles.btnPrimary} onPress={submit}>
        <Text style={shellStyles.btnPrimaryText}>配对并进入</Text>
      </Pressable>

      <FlatList
        style={{ marginTop: 16 }}
        data={list}
        keyExtractor={(it) => it.base}
        renderItem={({ item }) => (
          <Pressable
            style={shellStyles.card}
            onPress={() => enterPair(item)}
            onLongPress={() => onRemove(item.base)}
          >
            <View style={shellStyles.row}>
              <View style={{ flexShrink: 1 }}>
                <Text style={shellStyles.rowText}>{item.name ?? item.base}</Text>
                <Text style={shellStyles.rowSub}>
                  {item.base}
                  {getActiveBase() === item.base ? ' · 最近使用' : ''}
                </Text>
              </View>
              <Text style={{ color: palette.accent, fontSize: 13 }}>进入 ›</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={[shellStyles.sub, { textAlign: 'center', marginTop: 32 }]}>
            暂无配对。先在桌面端「手机访问」设置中生成配对令牌。
          </Text>
        }
      />
    </View>
  );
}