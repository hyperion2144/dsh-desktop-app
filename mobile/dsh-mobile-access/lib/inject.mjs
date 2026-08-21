// 生成 --patch 注入清单（包名行），对齐既有 dsh-desktop-tauriapp 机制（设计 §1.3）。
export function generateInjectionPatch(entries = []) {
  const rows = entries
    .filter((e) => e && e.id && e.name)
    .map((e) => '    - id: ' + e.id + '\n      name: ' + e.name)
    .join('\n');
  return rows ? '- insert:\n' + rows + '\n' : '';
}