import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { window } from '@kit.ArkUI';

const DOMAIN = 0x0001;
const TAG = 'EntryAbility';

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(DOMAIN, TAG, 'onCreate');
    // 深链参数（dsh-mobile://pair?token=..&base=..）：
    // 系统路由深链通常落在 want.uri；部分场景仅注入 parameters.uri（应用自定义 key）。
    // 两种形态都兜底读取，交给 Index 页解析；实际到达形态以真机联调为准。
    const uri = (want?.uri ?? '')
      || (typeof want?.parameters?.uri === 'string' ? want.parameters.uri : '');
    AppStorage.setOrCreate<string>('pairDeepLink', uri);
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index', (err) => {
      if (err.code) {
        hilog.error(DOMAIN, TAG, 'loadContent failed: %{public}s', JSON.stringify(err));
      }
    });
  }
}