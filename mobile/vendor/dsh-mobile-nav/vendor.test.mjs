import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const D = join(process.cwd(), 'mobile/vendor/dsh-mobile-nav');
test('dsh-mobile-nav vendor 完整性', () => {
  for (const f of ['lib/client.js', 'lib/index.js', 'LICENSE', 'package.json', 'cordis.patch.yml']) assert.ok(existsSync(join(D, f)), '缺少 ' + f);
  const pkg = JSON.parse(readFileSync(join(D, 'package.json'), 'utf8'));
  assert.ok(pkg.name === '@dsh-external/dsh-mobile-nav');
  assert.ok(pkg.exports && pkg.exports['./client']);
  assert.ok(pkg.exports && pkg.exports['.'], 'host 入口导出必须存在（main/lib/index.js 可被 loader 加载）');
  const patch = readFileSync(join(D, 'cordis.patch.yml'), 'utf8');
  assert.ok(patch.includes('insert'));
  assert.ok(patch.includes('@dsh-external/dsh-mobile-nav'));
});