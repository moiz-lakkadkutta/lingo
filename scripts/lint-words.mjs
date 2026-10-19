// Fails CI if user-facing strings contain words this product must not use. See docs/decisions/0002-wording.md
// Exempt a single line with a trailing comment containing `lint-words-allow` (e.g. a legally required notice).
import { readFileSync, globSync } from 'node:fs'
const BLOCK = ["streak broken", "failed", "wrong answer", "wrong"]
// Every app surface: shared-ui, the phone, the Vega entry and the Fire OS (Expo) entry. Generated and installed trees are skipped.
const SKIP = /(^|\/)(node_modules|android|ios|build|dist|\.expo)\//
const files = [
  'packages/shared-ui/src/**/*.{ts,tsx}',
  'apps/phone/src/**/*.{ts,tsx}',
  'apps/vega/src/**/*.{ts,tsx}',
  'apps/expo/**/*.{ts,tsx,js}',
].flatMap((g) => globSync(g)).filter((f) => !SKIP.test(f))
let bad = 0
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (line.includes('lint-words-allow')) return
    for (const wd of BLOCK) {
      const re = new RegExp(`(["'\`])[^"'\`]*\\b${wd}\\b[^"'\`]*\\1`, 'i')
      const m = re.exec(line)
      if (m) { bad++; console.error(`${f}:${i + 1}: "${wd}" in ${m[0].slice(0, 80)}`) }
    }
  })
}
if (BLOCK.length === 0) console.log('no blocklist for this app')
process.exit(bad ? 1 : 0)
