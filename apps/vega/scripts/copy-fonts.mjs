// Copies the shared fonts into <app>/assets/fonts, where Vega apps keep font files (vega-video-sample README,
// react-native-vector-icons section: "Add your font files to <app_package_root>/assets/fonts"). The target is gitignored.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const app = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(app, '../../packages/shared-ui/assets/fonts')
const to = join(app, 'assets/fonts')
mkdirSync(to, { recursive: true })
const fonts = readdirSync(from).filter((f) => f.endsWith('.ttf'))
if (!fonts.length) { console.error(`copy-fonts: no .ttf in ${from}`); process.exit(1) }
for (const f of fonts) copyFileSync(join(from, f), join(to, f))
console.log(`copy-fonts: ${fonts.join(', ')} → ${to}`)
