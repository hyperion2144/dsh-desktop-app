// 三端设计令牌（docs/mobile-access-design.md §7，H5 壳 / ArkUI / RN 共用基线）
export const palette = {
  bg: '#0f1115', // 深色页面底
  panel: '#171a21', // 卡片
  line: '#2a2f3a', // 分隔
  text: '#e7eaf0', // 主文
  text2: '#9aa4b2', // 次文
  accent: '#4d6bfe', // 主操作
  ok: '#2fbf71',
  warn: '#e5a13a',
  err: '#e5484d',
};

export const radii = {
  card: 14,
  btn: 10,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

// 深色主题 StyleSheet 基线（壳统一风格）
import { StyleSheet } from 'react-native';

export const shellStyles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: palette.bg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  card: {
    backgroundColor: palette.panel,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.line,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  title: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  sub: {
    color: palette.text2,
    fontSize: 13,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  input: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.btn,
    color: palette.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: spacing.sm,
  },
  btnPrimary: {
    backgroundColor: palette.accent,
    borderRadius: radii.btn,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  btnPrimaryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  btnGhost: {
    borderRadius: radii.btn,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.line,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  btnGhostText: {
    color: palette.text2,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  rowText: {
    color: palette.text,
    fontSize: 15,
    flexShrink: 1,
  },
  rowSub: {
    color: palette.text2,
    fontSize: 12,
    marginTop: 2,
  },
  errText: {
    color: palette.err,
    fontSize: 13,
    marginTop: spacing.sm,
  },
});