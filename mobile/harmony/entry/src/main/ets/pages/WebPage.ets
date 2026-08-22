import { webview } from '@kit.ArkWeb';
import { router } from '@kit.ArkUI';
import { Theme } from '../common/Theme';
import { PairLogic } from '../common/PairLogic';

@Entry
@Component
struct WebPage {
  @State base: string = '';
  @State url: string = 'about:blank';
  @State loadErr: string = '';
  private controller: webview.WebviewController = new webview.WebviewController();

  aboutToAppear(): void {
    const params = (router.getParams() ?? {}) as Record<string, string>;
    this.base = params['base'] ?? '';
    this.url = params['url'] ?? PairLogic.buildEnterUrl(this.base);
  }

  build() {
    Column() {
      Row() {
        Button('‹ 返回')
          .backgroundColor(Color.Transparent)
          .fontColor(Theme.Accent)
          .onClick(() => router.back())

        Text(this.base)
          .fontSize(14)
          .fontColor(Theme.Text)
          .layoutWeight(1)
          .textAlign(TextAlign.Center)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })

        Button('⟳')
          .backgroundColor(Color.Transparent)
          .fontColor(Theme.Accent)
          .onClick(() => this.controller.refresh())
      }
      .width('100%')
      .padding({ left: Theme.Sp12, right: Theme.Sp12, top: Theme.Sp8, bottom: Theme.Sp8 })
      .backgroundColor(Theme.Panel)

      if (this.loadErr !== '') {
        Text(this.loadErr)
          .fontSize(13)
          .fontColor(Theme.Err)
          .padding(Theme.Sp16)
          .textAlign(TextAlign.Center)
      }

      // ArkWeb 加载 dsh；移动布局由页面内注入的 dsh-mobile-nav 插件生效
      Web({ src: this.url, controller: this.controller })
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .fileAccess(true)
        .onlineImageAccess(true)
        .onErrorReceive((event) => {
          const code = event?.error?.getErrorCode?.();
          const info = event?.error?.getErrorInfo?.() ?? '';
          this.loadErr = '加载失败：' + (info !== '' ? info : String(code));
        })
        .layoutWeight(1)
    }
    .backgroundColor(Theme.Bg)
    .width('100%')
    .height('100%')
  }
}