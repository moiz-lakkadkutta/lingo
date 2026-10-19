import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { strings } from '../src/strings'

describe('strings.explain.saved', () => {
  it('uses the singular for one word', () => { expect(strings.explain.saved(1)).toBe('Saved. 1 word this clip.') })
  it('uses the plural for more than one', () => {
    expect(strings.explain.saved(2)).toBe('Saved. 2 words this clip.')
    expect(strings.explain.saved(12)).toBe('Saved. 12 words this clip.')
  })
})

describe('focusable labels state their purpose (PR #2 review B-L7)', () => {
  const BARE = ['Back', 'Done', 'Continue', 'Try again']
  it('the purpose labels are not bare verbs', () => {
    const purpose = [strings.common.backLabel, strings.common.reconnectLabel, strings.clip.retryLabel, strings.home.retryLabel, strings.words.retryLabel,
      strings.quiz.backLabel, strings.quiz.finishLabel, strings.quiz.continueLabel(false), strings.quiz.continueLabel(true), strings.about.backLabel]
    for (const l of purpose) expect(BARE).not.toContain(l)
    expect(new Set(purpose).size).toBe(purpose.length)
  })
  it('no screen uses a bare Back / Try again / Done / Continue string as an aria-label', () => {
    const src = join(__dirname, '../src')
    const files: string[] = []
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(p)) files.push(p) } }
    walk(src)
    const bare = /label[=:]\s*\{?\s*strings\.(common\.(back|retry)|quiz\.(finish|continue))\b(?!Label)/
    const hits = files.flatMap((f) => readFileSync(f, 'utf8').split('\n').map((l, i) => (bare.test(l) ? `${f}:${i + 1}` : null)).filter(Boolean))
    expect(hits).toEqual([])
  })
})
