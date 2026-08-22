// dsh-mobile-nav host 半区：空 apply。
// 该包为 client-only（浏览器侧移动布局），host 半区仅需让 loader 行存在；
// 契约见 README：「The host half is an empty apply so the row exists in the host Loader」。
export function apply() {
  // 无 host 侧逻辑
}