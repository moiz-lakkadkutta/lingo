import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BANDS, NEXT, pickHighlights } from '../src/highlights'
import { fixtureDeps } from '../src/fixtureDeps'
import { prepare } from '../src/prepare'
import { realClip } from './helpers/realClip'

const toks = (s: string) => s.split(' ').map((w) => ({ word: w, lemma: w.toLowerCase() }))

describe('floor-only band (docs/decisions/0008 decision 9)', () => {
  const rank = (l: string) => ({ ich: 1, warte: 1500, seit: 300, zwei: 200, stunden: 900, auf: 40, dich: 120, angerufen: 2500, abgenommen: 3800, konsulat: 9523, holocaust: 15958 })[l]
  it('with level A1 the floor is 1000 and there is no ceiling: B1 words are picked too, lowest rank first', () => {
    const hl = pickHighlights([{ index: 0, tokens: toks('Ich warte seit zwei Stunden auf dich') }, { index: 1, tokens: toks('angerufen abgenommen') }], rank, 'A1', 1)
    expect(hl.map((h) => h.lemma)).toEqual(['warte', 'angerufen', 'abgenommen'])
  })
  it('has no ceiling: a rank above 8000 is picked when it is the rarest candidate', () => {
    expect(pickHighlights([{ index: 0, tokens: toks('Konsulat') }], rank, 'B1', 1).map((h) => h.rank)).toEqual([9523])
    expect(pickHighlights([{ index: 0, tokens: toks('Holocaust Konsulat warte') }], rank, 'B2', 1).map((h) => h.lemma)).toEqual(['konsulat', 'holocaust'])
  })
  it('never picks below the floor', () => {
    for (const level of ['A1', 'A2', 'B1', 'B2'] as const) {
      const lo = BANDS[NEXT[level]][0]
      const hl = pickHighlights([{ index: 0, tokens: toks('warte Stunden') }, { index: 1, tokens: toks('angerufen abgenommen') }, { index: 2, tokens: toks('Konsulat Holocaust') }], rank, level, 1)
      for (const h of hl) expect(h.rank).toBeGreaterThanOrEqual(lo)
      expect(hl.length).toBe({ A1: 5, A2: 4, B1: 2, B2: 2 }[level])
    }
  })
})

describe('prepare: zero highlights is a verdict', () => {
  it('writes and prints the no-highlights warning when nothing reaches the floor', async () => {
    const workRoot = await mkdtemp(join(tmpdir(), 'lingo-p6-'))
    const logs: string[] = []
    try {
      // every lemma ranks 5: level A1, floor 1000, nothing qualifies
      const deps = { ...fixtureDeps('en'), log: (m: string) => { logs.push(m) } }
      const list = await deps.freqList('en')
      const { clip } = await prepare({ slug: 'demo-en', source: 's3://unused', lang: 'en', natives: ['de'], workRoot, publish: false, ai: false }, { ...deps, freqList: async () => list.slice(0, 900) })
      expect(clip.highlights).toEqual([])
      const w = clip.warnings.filter((x) => x.startsWith('no highlights: '))
      expect(w).toEqual([`no highlights: no countable token has rank ≥ ${BANDS[NEXT[clip.level]][0]} (band above ${clip.level}); the clip teaches nothing above its level — swap it (docs/content.md §8)`])
      expect(logs).toContain(`warning: ${w[0]}`)
    } finally { await rm(workRoot, { recursive: true, force: true }) }
  })
  it('the 60 s demo fixtures still get highlights and no such warning', async () => {
    for (const lang of ['de', 'en'] as const) {
      const workRoot = await mkdtemp(join(tmpdir(), 'lingo-p6-'))
      try {
        const { clip } = await prepare({ slug: `demo-${lang}`, source: 's3://unused', lang, natives: [lang === 'de' ? 'en' : 'de'], workRoot, publish: false, ai: false }, fixtureDeps(lang))
        expect(clip.highlights.length > 0).toBe(true)
        expect(clip.warnings.some((x) => x.startsWith('no highlights'))).toBe(false)
      } finally { await rm(workRoot, { recursive: true, force: true }) }
    }
  })
})

// Equivalent of the plan's real.test.ts §10.1 highlight checks, as numeric/boolean assertions only.
describe('real fixtures: highlights (plan §10.1, numeric)', () => {
  it('friedlaender de: Konsulat is reachable once the ceiling is gone; every pick is at or above the floor; no name is picked', async () => {
    const { clip } = await realClip('friedlaender', 'de')
    const lo = BANDS[NEXT[clip.level]][0]
    expect(clip.highlights.length > 0).toBe(true)
    expect(clip.highlights.some((h) => h.lemma === 'Konsulat')).toBe(true)
    expect(clip.highlights.every((h) => h.rank >= lo)).toBe(true)
    expect(clip.highlights.some((h) => ['Margot', 'Brasilien', 'Schai', 'Shanghai'].includes(h.word))).toBe(false)
    const names = clip.cues.flatMap((c) => c.tokens).filter((t) => ['Margot', 'Friedländer', 'Brasilien', 'Shanghai', 'Auschwitz'].includes(t.word))
    expect(names.every((t) => t.name)).toBe(true)
    expect(clip.warnings.some((w) => w.startsWith('no highlights'))).toBe(false)
  })
  it('voa01 en: zero highlights with the verdict warning, level A2', async () => {
    const { clip, logs } = await realClip('voa01', 'en')
    expect(clip.highlights.length).toBe(0)
    expect(clip.level).toBe('A2')
    expect(clip.coverageRank < 2000).toBe(true)
    expect(clip.warnings.some((w) => w.startsWith('no highlights: no countable token has rank ≥ 2000'))).toBe(true)
    expect(logs.some((l) => l.startsWith('warning: no highlights: '))).toBe(true)
  })
  it('voa01 en: names are Pete, Anna, Ana, Irving and none of the lesson UI words or contractions', async () => {
    const { clip } = await realClip('voa01', 'en')
    const tokens = clip.cues.flatMap((c) => c.tokens)
    const nameWords = new Set(tokens.filter((t) => t.name).map((t) => t.word))
    for (const w of ['Listen', 'Speak', 'Say', 'Now', 'Nice', 'Fast', 'A', 'An', 'N', "N's", "Let's", "Here's", "I'm", 'Apartment', 'Record', 'Street']) expect(nameWords.has(w), w).toBe(false)
    for (const w of ['Pete', 'Anna', 'Ana', 'Irving']) {
      const occ = tokens.filter((t) => t.word === w)
      expect(occ.length > 0, w).toBe(true)
      expect(occ.every((t) => t.name), w).toBe(true)
    }
    const im = tokens.filter((t) => t.word === "I'm")
    expect(im.every((t) => t.rank !== null && t.rank < 100)).toBe(true)
  })
})
