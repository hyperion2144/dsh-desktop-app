// 三端设计令牌（docs/mobile-access-design.md §7）
// 深色主题基线，与 H5 壳（theme.ts）／RN 壳（src/theme.ts）同值。
export class Theme {
  static readonly Bg: string = '#0f1115';
  static readonly Panel: string = '#171a21';
  static readonly Line: string = '#2a2f3a';
  static readonly Text: string = '#e7eaf0';
  static readonly Text2: string = '#9aa4b2';
  static readonly Accent: string = '#4d6bfe';
  static readonly Ok: string = '#2fbf71';
  static readonly Warn: string = '#e5a13a';
  static readonly Err: string = '#e5484d';

  static readonly RadiusCard: number = 14;
  static readonly RadiusBtn: number = 10;
  static readonly Sp4: number = 4;
  static readonly Sp8: number = 8;
  static readonly Sp12: number = 12;
  static readonly Sp16: number = 16;
  static readonly Sp24: number = 24;
}