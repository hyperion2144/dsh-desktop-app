import { useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { palette } from '../theme';
import type { EnterTarget } from './HomeScreen';

export function WebScreen({ target, onBack }: { target: EnterTarget; onBack: () => void }) {
  const webRef = useRef<WebView>(null);

  function onShouldStartLoadWithRequest(nav: WebViewNavigation): boolean {
    // 外链（非当前 base 域名）交系统浏览器；应用内导航放行。
    try {
      const cur = new URL(nav.url);
      const want = new URL(target.url);
      if (cur.host !== want.host && nav.navigationType === 'other') {
        return false;
      }
    } catch {
      return false;
    }
    return true;
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <View style={styles.bar}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.back}>‹ 返回</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {target.name}
        </Text>
        <Pressable onPress={() => webRef.current?.reload()} hitSlop={8}>
          <Text style={styles.back}>⟳</Text>
        </Pressable>
      </View>
      <WebView
        ref={webRef}
        source={{ uri: target.url }}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        style={{ flex: 1 }}
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures
        originWhitelist={['*']}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: palette.panel,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  back: {
    color: palette.accent,
    fontSize: 15,
  },
  title: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1,
    marginHorizontal: 8,
  },
});