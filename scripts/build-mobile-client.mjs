/**
 * 构建 dsh-mobile-access 的 client bundle。
 * 入口：mobile/dsh-mobile-access/client/client.source.js（裸 ES module 源码）
 * 产物：mobile/dsh-mobile-access/client/client.js，包裹在
 * `window.__ModuleLoader__.load({ id, factory })` 中，与桌面插件格式一致。
 * ⚠️ 入口必须是裸源码，绝不能是已打包产物（否则双层包装 → duplicate factory registration）。
 */
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PACKAGE_NAME = 'dsh-mobile-access'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const clientSrc = join(root, 'mobile/dsh-mobile-access/client/client.source.js')
const clientOut = join(root, 'mobile/dsh-mobile-access/client/client.js')

const result = await build({
  entryPoints: [clientSrc],
  outfile: clientOut,
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  external: [
    'react',
    'react/jsx-runtime',
  ],
  banner: {
    js: `window.__ModuleLoader__.load({\n  id: ${JSON.stringify(PACKAGE_NAME)},\n  factory: (require) => {\nvar module = { exports: {} };\nvar exports = module.exports;\n`,
  },
  footer: {
    js: 'return module.exports;\n  }\n});\n',
  },
  logLevel: 'info',
})

if (result.errors.length > 0) process.exit(1)

console.log(`✅ Built ${PACKAGE_NAME} client: ${clientOut}`)
