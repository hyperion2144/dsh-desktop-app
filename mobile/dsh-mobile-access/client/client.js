// dsh client 半区：注册 settings.section「手机访问」行。
// 轻量 DOM 渲染（无 React 依赖），后续可与 host RPC 对接。
export function apply(ctx) {
  const slots = ctx?.slots;
  if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') {
    ctx?.logger?.warn?.('dsh-mobile-access: slots 服务不可用，跳过设置入口');
    return;
  }
  slots.inject('settings.section', () => slots.register({
    name: 'settings.section',
    id: 'dsh-mobile-access',
    order: 20,
  }, MobileAccessPanel));
}

function MobileAccessPanel() {
  const root = document.createElement('div');
  root.dataset.mobileAccessPanel = '1';
  root.style.cssText = 'display:flex;flex-direction:column;gap:12px;max-width:640px;';
  root.innerHTML = [
    '<div style="font-size:15px;font-weight:600">手机访问</div>',
    '<div style="color:var(--dsw-alias-label-secondary, #9aa4b2);font-size:13px">扫码或输入配对地址，在手机上使用本机 dsh web（局域网 · 公网 · 内网穿透）。授权=配对令牌 + 会话 Cookie。</div>',
    '<div style="border:1px solid var(--dsw-alias-border-l2,#2a2f3a);border-radius:10px;padding:14px">二维码 / 配对链接 / 令牌刷新 · 停止 由 host 半区 RPC 提供（0.1.0 占位）</div>',
  ].join('');
  return root;
}