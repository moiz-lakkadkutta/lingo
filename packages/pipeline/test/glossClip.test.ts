import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { glossesOverlap, siblingConflicts, type GlossCard } from '@lingo/contracts'
import { glossClip, quizInput, type ClipGlossItem, type ClipGlossResult } from '../src/ai/glossClip'
import type { GlossOutcome, GlossRequest } from '../src/ai/gloss'
import { prepare } from '../src/prepare'
import { fixtureDeps } from '../src/fixtureDeps'

const card = (gloss: string[]): GlossCard => ({ sense: 's', pos: 'noun', gloss, register: 'neutral', example: 'An example.' })
const ok = (gloss: string[]): GlossOutcome => ({ status: 'ok', card: card(gloss), gloss: { gloss: gloss.join(', '), grammar: 'Nomen', example: 'An example.' }, issues: [], attempts: 1, cached: false })
const cue9 = "I'll get my tennis racket."
const items: ClipGlossItem[] = [
  { cueIndex: 9, word: 'tennis', lemma: 'tennis', rank: 3000, cue: cue9 },
  { cueIndex: 9, word: 'racket', lemma: 'racket', rank: 5000, cue: cue9 },
]

/** Fake gloss: answers from a table keyed by `${word}|${hint ? 'hint' : ''}`. */
function fakeGloss(table: Record<string, string[]>) {
  const calls: GlossRequest[] = []
  const gloss = async (r: GlossRequest): Promise<GlossOutcome> => {
    calls.push(r)
    const g = table[`${r.word}|${r.hint ? 'hint' : ''}`] ?? table[`${r.word}|`]!
    return ok(g)
  }
  return { gloss, calls }
}

describe('siblingConflicts (contracts)', () => {
  it('equal glosses after normalisation and a compound containing a ≥ 5-letter word overlap; short contained words do not', () => {
    expect(glossesOverlap(['Tennisschläger'], ['der Tennisschläger'])).toBe(true)
    expect(glossesOverlap(['Tennisschläger'], ['Schläger'])).toBe(true)
    expect(glossesOverlap(['Tennis (Sport)'], ['Schläger'])).toBe(false)
    expect(glossesOverlap(['Bart'], ['Eis'])).toBe(false)
    expect(glossesOverlap(['Reis'], ['Eis'])).toBe(false)
    expect(siblingConflicts([{ cueIndex: 1, lemma: 'a', gloss: ['X'] }, { cueIndex: 1, lemma: 'b', gloss: ['x'] }, { cueIndex: 2, lemma: 'c', gloss: ['x'] }])).toEqual([[0, 1]])
  })
})

describe('glossClip', () => {
  it('re-asks both words of one cue that got the same gloss (tennis/racket → Tennisschläger) once, with a hint naming the other word', async () => {
    const f = fakeGloss({ 'tennis|': ['Tennisschläger'], 'racket|': ['Tennisschläger'], 'tennis|hint': ['Tennis (Sport)'], 'racket|hint': ['Schläger'] })
    const logs: string[] = []
    const r = await glossClip({ gloss: f.gloss }, items, 'en', 'de', 'A2', (m) => logs.push(m))
    expect(f.calls).toHaveLength(4)
    const hints = f.calls.filter((c) => c.hint).map((c) => c.hint!)
    expect(hints).toHaveLength(2)
    expect(hints.find((h) => h.includes('[[tennis]]'))).toContain('"racket"')
    expect(hints.find((h) => h.includes('[[racket]]'))).toContain('"tennis"')
    expect(hints[0]).toContain('"Tennisschläger"')
    expect(r.map((x) => x.status)).toEqual(['ok', 'ok'])
    expect(r[0]!.status === 'ok' && r[0]!.card.gloss).toEqual(['Tennis (Sport)'])
    expect(r.every((x) => x.reasked)).toBe(true)
    expect(logs).toEqual([])
  })

  it('marks an item conflict when the re-ask still overlaps, and does not re-ask a third time', async () => {
    const f = fakeGloss({ 'tennis|': ['Tennisschläger'], 'racket|': ['Schläger'] })
    const logs: string[] = []
    const r = await glossClip({ gloss: f.gloss }, items, 'en', 'de', 'A2', (m) => logs.push(m))
    expect(f.calls).toHaveLength(4)
    expect(r.map((x) => x.status)).toEqual(['conflict', 'conflict'])
    expect(r[0]!.status === 'conflict' && r[0]!.card?.gloss).toEqual(['Tennisschläger'])
    expect(logs).toHaveLength(2)
    expect(logs[0]).toMatch(/^gloss: conflict "tennis" \(cue 9\): /)
  })

  it('does not treat the same gloss in two different cues as a conflict', async () => {
    const f = fakeGloss({ 'tennis|': ['Tennis (Sport)'], 'racket|': ['Tennis (Sport)'] })
    const r = await glossClip({ gloss: f.gloss }, [items[0]!, { ...items[1]!, cueIndex: 10 }], 'en', 'de', 'A2', () => {})
    expect(f.calls).toHaveLength(2)
    expect(r.map((x) => x.status)).toEqual(['ok', 'ok'])
  })

  it('passes rejected outcomes through with their issues and logs them', async () => {
    const logs: string[] = []
    const gloss = async (r: GlossRequest): Promise<GlossOutcome> => r.word === 'racket' ? { status: 'rejected', issues: ['G-LEN: too long'], lastOutput: {}, attempts: 2, cached: false } : ok(['Tennis (Sport)'])
    const r = await glossClip({ gloss }, items, 'en', 'de', 'A2', (m) => logs.push(m))
    expect(r[1]).toMatchObject({ status: 'rejected', issues: ['G-LEN: too long'], word: 'racket' })
    expect(logs).toEqual(['gloss: rejected "racket" (cue 9): G-LEN: too long'])
  })
})

describe('prepare with glossClip', () => {
  let workRoot: string
  beforeAll(async () => { workRoot = await mkdtemp(join(tmpdir(), 'lingo-glossclip-')) })
  afterAll(async () => { await rm(workRoot, { recursive: true, force: true }) })

  it('prepare leaves rejected and conflict items out of clip.highlights and writes one warning each', async () => {
    const base = fixtureDeps('en')
    const all = await prepare({ slug: 'gc-all', source: 's3://unused', lang: 'en', natives: ['de'], workRoot, publish: false }, base)
    expect(all.clip.highlights.length).toBeGreaterThanOrEqual(2)
    const victim = all.clip.highlights[0]!
    const d = fixtureDeps('en')
    const orig = d.gloss
    d.gloss = async (r) => (r.lemma === victim.lemma ? { status: 'rejected', issues: ['G-SOURCE: copied'], lastOutput: null, attempts: 2, cached: false } : orig(r))
    const r = await prepare({ slug: 'gc-drop', source: 's3://unused', lang: 'en', natives: ['de'], workRoot, publish: false }, d)
    expect(r.clip.highlights.map((h) => h.lemma)).not.toContain(victim.lemma)
    expect(r.clip.highlights).toHaveLength(all.clip.highlights.length - all.clip.highlights.filter((h) => h.lemma === victim.lemma).length)
    const w = r.clip.warnings.filter((x) => x.startsWith('gloss: dropped highlight'))
    expect(w).toHaveLength(all.clip.highlights.filter((h) => h.lemma === victim.lemma).length)
    expect(w[0]).toBe(`gloss: dropped highlight "${victim.word}" (cue ${victim.cueIndex}): rejected G-SOURCE: copied`)
  })

  it('prepare no longer throws when one gloss is rejected twice', async () => {
    const d = fixtureDeps('de')
    const orig = d.gloss
    let first = true
    d.gloss = async (r) => { if (first) { first = false; return { status: 'rejected', issues: ['X-LANG: wrong'], lastOutput: null, attempts: 2, cached: false } } return orig(r) }
    await expect(prepare({ slug: 'gc-nothrow', source: 's3://unused', lang: 'de', natives: ['en'], workRoot, publish: false }, d)).resolves.toBeDefined()
  })
})

describe('quizInput (shared by prepare and the spot check)', () => {
  const base = { cue: 'Or a weenie roast.', rank: 5000, attempts: 1, cached: false, reasked: false }
  const results: ClipGlossResult[] = [
    { ...base, cueIndex: 3, word: 'roast', lemma: 'roast', status: 'ok', card: card(['Grillfest', 'Grillparty']), gloss: { gloss: 'Grillfest, Grillparty', grammar: 'Nomen', example: 'x' }, issues: [] },
    { ...base, cueIndex: 3, word: 'weenie', lemma: 'weenie', status: 'soft', card: card(['Würstchen']), gloss: { gloss: 'Würstchen', grammar: 'Nomen', example: 'x' }, issues: ['X-USES: x'] },
    { ...base, cueIndex: 3, word: 'Or', lemma: 'or', status: 'rejected', issues: ['G-LEN: x'] },
    { ...base, cueIndex: 4, word: 'tennis', lemma: 'tennis', status: 'conflict', issues: ['SIBLING: x'], card: card(['Tennisschläger']) },
  ]
  const cues = [{ index: 3, text: 'Or a weenie roast.', native: 'Oder ein Würstchengrillen.' }, { index: 4, text: 'my tennis racket', native: 'mein Tennisschläger' }]

  it('only status ok highlights reach the quiz: soft, rejected and conflict items are left out', () => {
    const q = quizInput(cues, results)
    expect(q.flatMap((c) => c.highlights.map((h) => h.word))).toEqual(['roast'])
    expect(q.map((c) => c.index)).toEqual([3, 4])
  })

  it('uses the first gloss headword as the option text', () => {
    expect(quizInput(cues, results)[0]!.highlights).toEqual([{ word: 'roast', lemma: 'roast', pos: 'noun', gloss: 'Grillfest' }])
  })
})
