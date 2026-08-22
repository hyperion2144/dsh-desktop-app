import { router } from '@kit.ArkUI';
import { preferences } from '@kit.ArkData';
import { common } from '@kit.AbilityKit';
import { Theme } from '../common/Theme';
import { createPairStore, PairLogic, PairEntry, PairInput, PairStorage } from '../common/PairLogic';

// 简化存储适配器：内存态 + preferences 落盘。
// preferences 实例只能经异步 getPreferences() 获取（无 getPreferencesSync）；
// 初始化完成前读写先落内存，实例就绪后同步到持久化（getSync/putSync 需实例）。
class PairStorageAdapter implements PairStorage {
  private pref: preferences.Preferences | null = null;
  private mem: Map<string, string> = new Map();

  async init(ctx: common.UIAbilityContext): Promise<void> {
    try {
      this.pref = await preferences.getPreferences(ctx, 'dsh-mobile');
      // 实例就绪后把内存中的待持久化数据刷下去
      this.mem.forEach((v, k) => {
        this.pref?.putSync(k, v);
      });
      if (this.mem.size > 0) {
        this.pref?.flush();
      }
    } catch (e) {
      // 读取失败仅退化为内存态（列表不丢，重启回默认）
    }
  }

  getItem(key: string): string | null {
    const cached = this.mem.get(key);
    if (cached !== undefined) return cached;
    if (this.pref != null) {
      const v = this.pref.getSync(key, '') as string;
      if (v !== '') return v;
    }
    return null;
  }

  setItem(key: string, value: string): void {
    this.mem.set(key, value);
    if (this.pref != null) {
      this.pref.putSync(key, value);
      this.pref.flush();
    }
  }
}

@Entry
@Component
struct Index {
  @State pairs: PairEntry[] = [];
  @State input: string = '';
  @State token: string = '';
  @State err: string = '';
  @State loaded: boolean = false;
  private store: PairStorageAdapter = new PairStorageAdapter();

  aboutToAppear(): void {
    const ctx = getContext(this) as common.UIAbilityContext;
    // preferences 实例异步就绪后刷新列表（就绪前为空列表，不阻塞 UI）
    this.store.init(ctx).then(() => {
      this.reload();
    }).catch(() => {
      this.reload();
    });
    // 深链参数：EntryAbility 放入 AppStorage
    const deep = AppStorage.get<string>('pairDeepLink') ?? '';
    if (deep) {
      this.handleDeepLink(deep);
      AppStorage.setOrCreate<string>('pairDeepLink', '');
    }
  }

  reload(): void {
    const st = createPairStore(this.store);
    this.pairs = st.list();
    this.loaded = true;
  }

  handleDeepLink(url: string): void {
    const p = PairLogic.parsePairInput(url);
    if (p == null) return;
    this.addAndEnter(p, '扫码配对');
  }

  submit(): void {
    const p = PairLogic.parsePairInput(this.input, this.token);
    if (p == null) {
      this.err = '无法解析：请粘贴 dsh-mobile:// 链接、http(s) 配对链接，或输入 host:端口 并填写令牌';
      return;
    }
    this.err = '';
    this.addAndEnter(p, p.base);
  }

  addAndEnter(p: PairInput, name: string): void {
    const st = createPairStore(this.store);
    st.add({ token: p.token, base: p.base, name: name });
    st.active(p.base);
    this.reload();
    this.input = '';
    this.token = '';
    this.enter(p.base);
  }

  remove(base: string): void {
    const st = createPairStore(this.store);
    st.remove(base);
    this.reload();
  }

  enter(base: string): void {
    router.pushUrl({
      url: 'pages/WebPage',
      params: { base: base, url: PairLogic.buildEnterUrl(base) },
    });
  }

  build() {
    Column() {
      // 标题
      Text('DeepSeek 手机访问')
        .fontSize(22)
        .fontWeight(FontWeight.Bold)
        .fontColor(Theme.Text)
        .margin({ top: Theme.Sp24, bottom: Theme.Sp12 })
        .width('100%')

      Text('粘贴桌面端显示的配对链接（dsh-mobile:// 或 http(s)），或输入 host:端口 并单独填写配对令牌。')
        .fontSize(13)
        .fontColor(Theme.Text2)
        .margin({ bottom: Theme.Sp16 })
        .width('100%')

      // 输入区
      TextInput({ placeholder: '配对链接或 host:端口', text: this.input })
        .placeholderColor(Theme.Text2)
        .fontColor(Theme.Text)
        .backgroundColor(Theme.Panel)
        .border({ width: 0.5, color: Theme.Line })
        .borderRadius(Theme.RadiusBtn)
        .padding(12)
        .margin({ bottom: Theme.Sp8 })
        .onChange((v: string) => { this.input = v; })

      TextInput({ placeholder: '配对令牌（链接已含令牌时可留空）', text: this.token })
        .placeholderColor(Theme.Text2)
        .fontColor(Theme.Text)
        .backgroundColor(Theme.Panel)
        .border({ width: 0.5, color: Theme.Line })
        .borderRadius(Theme.RadiusBtn)
        .padding(12)
        .margin({ bottom: Theme.Sp8 })
        .onChange((v: string) => { this.token = v; })

      if (this.err !== '') {
        Text(this.err)
          .fontSize(13)
          .fontColor(Theme.Err)
          .width('100%')
          .margin({ bottom: Theme.Sp8 })
      }

      Button('配对并进入')
        .width('100%')
        .backgroundColor(Theme.Accent)
        .borderRadius(Theme.RadiusBtn)
        .fontColor(Color.White)
        .margin({ bottom: Theme.Sp16 })
        .onClick(() => this.submit())

      // 列表
      List({ space: Theme.Sp12 }) {
        ForEach(this.pairs, (p: PairEntry) => {
          ListItem() {
            Column() {
              Row() {
                Column() {
                  Text(p.name ?? p.base)
                    .fontSize(15)
                    .fontColor(Theme.Text)
                  Text(p.base)
                    .fontSize(12)
                    .fontColor(Theme.Text2)
                    .margin({ top: 2 })
                }
                .alignItems(HorizontalAlign.Start)
                .layoutWeight(1)

                Text('进入 ›')
                  .fontSize(13)
                  .fontColor(Theme.Accent)
              }
              .width('100%')
              .justifyContent(FlexAlign.SpaceBetween)
            }
            .padding(Theme.Sp16)
            .backgroundColor(Theme.Panel)
            .borderRadius(Theme.RadiusCard)
          }
          .onClick(() => this.enter(p.base))
          .onLongPress(() => {
            this.remove(p.base);
          })
        }, (p: PairEntry) => p.base)
      }
      .width('100%')
      .layoutWeight(1)

      if (this.pairs.length === 0) {
        Text('暂无配对。先在桌面端「手机访问」设置中生成配对令牌。')
          .fontSize(13)
          .fontColor(Theme.Text2)
          .margin({ top: Theme.Sp24 })
          .width('100%')
          .textAlign(TextAlign.Center)
      }
    }
    .padding({ left: Theme.Sp16, right: Theme.Sp16, bottom: Theme.Sp16 })
    .backgroundColor(Theme.Bg)
    .width('100%')
    .height('100%')
  }
}