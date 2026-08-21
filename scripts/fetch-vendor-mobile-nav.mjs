// 拉取 dsh-web-mobile（mexiaosqwq）关键产物到 mobile/vendor/dsh-mobile-nav（base64 通道，保留 LICENSE）。
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const DEST = join(HERE, '../mobile/vendor/dsh-mobile-nav');
mkdirSync(DEST, { recursive: true });
const FILES = ['lib/client.js', 'LICENSE', 'package.json', 'cordis.patch.yml', 'README.md'];
for (const f of FILES) {
  const dir = join(DEST, f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '.');
  mkdirSync(dir, { recursive: true });
  const content = execSync('gh api repos/mexiaosqwq/dsh-web-mobile/contents/' + f + ' --jq .content | base64 -d').toString();
  writeFileSync(join(DEST, f), content);
}
console.log('vendor updated -> ' + DEST);