import { loadFreqList, rankFn } from '../src/freq'
import { clipLevel, coverageRank, unrankedShare } from '../src/highlights'
import { fixtureDeps } from '../src/fixtureDeps'
import { prepare } from '../src/prepare'
import { creditLemmas, isUsableLemma, SANITY } from '../scripts/build-freq'
import { realClip } from './helpers/realClip'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('build-freq: the sich fix (docs/decisions/0008 decision 10)', () => {
  const k = (lemma: string, known = true) => ({ lemma, known })
  it('isUsableLemma rejects simplemma ambiguity markers', () => {
    expect(isUsableLemma('er|es|sie')).toBe(false)
    expect(isUsableLemma('sich')).toBe(true)
  })
  it('creditLemmas ignores a capitalised lookup whose lemma carries |', () => {
    expect(creditLemmas([{ word: 'sich', count: 533395, low: k('sich'), capped: k('er|es|sie') }])).toEqual([{ word: 'sich', count: 533395, lemma: 'sich' }])
  })
  it('sich is in the de sanity list and ranks in the top 100 of the rebuilt list', async () => {
    expect(SANITY.de).toContain('sich')
    const de = rankFn(await loadFreqList('de'))
    expect(de('sich')).toBeDefined()
    expect(de('sich')!).toBeLessThanOrEqual(100)
  })
})

describe('ranked-only level and coverage, unrankedShare', () => {
  const tokens = [...Array.from({ length: 19 }, (_, i) => ({ word: `w${i}`, lemma: `w${i}` })), { word: 'x', lemma: 'x' }]
  const r = (l: string) => (l.startsWith('w') ? Number(l.slice(1)) + 1 : undefined)
  it('clipLevel and coverageRank ignore unranked tokens; unrankedShare reports them', () => {
    expect(clipLevel(tokens, r)).toBe('A1')
    expect(coverageRank(tokens, r)).toBe(19)
    expect(unrankedShare(tokens, r)).toEqual({ share: 0.05, lemmas: ['x'] })
  })
  it('one unranked token no longer pushes the level up', () => {
    const t = [...Array.from({ length: 10 }, () => ({ word: 'a', lemma: 'a' })), { word: 'zz', lemma: 'zz' }, { word: 'zz', lemma: 'zz' }]
    expect(clipLevel(t, (l) => (l === 'a' ? 5 : undefined))).toBe('A1')
  })
  it('none ranked → B2 / 99999 / share 1; no tokens → share 0', () => {
    const t = [{ word: 'b', lemma: 'b' }, { word: 'a', lemma: 'a' }, { word: 'b', lemma: 'b' }]
    expect(clipLevel(t, () => undefined)).toBe('B2')
    expect(coverageRank(t, () => undefined)).toBe(99999)
    expect(unrankedShare(t, () => undefined)).toEqual({ share: 1, lemmas: ['a', 'b'] })
    expect(unrankedShare([], () => undefined)).toEqual({ share: 0, lemmas: [] })
  })
})

describe('prepare: the unranked warning', () => {
  it('warns (and prints) when more than 5 % of countable tokens have no rank, listing at most 12 lemmas', async () => {
    const workRoot = await mkdtemp(join(tmpdir(), 'lingo-p5-'))
    const logs: string[] = []
    try {
      const deps = { ...fixtureDeps('de'), freqList: async () => ['ich', 'du', 'sein'], log: (m: string) => { logs.push(m) } }
      const { clip } = await prepare({ slug: 'demo-de', source: 's3://unused', lang: 'de', natives: ['en'], workRoot, publish: false, ai: false }, deps)
      const w = clip.warnings.filter((x) => x.startsWith('unranked tokens: '))
      expect(w).toHaveLength(1)
      expect(w[0]).toMatch(/^unranked tokens: \d+ % of countable tokens have no frequency rank \(.+, …\) — ASR errors or rare words; the level ignores them$/)
      expect(w[0]!.split('(')[1]!.split(')')[0]!.split(', ').length).toBe(13) // 12 lemmas + the ellipsis
      expect(logs.some((l) => l === `warning: ${w[0]}`)).toBe(true)
    } finally { await rm(workRoot, { recursive: true, force: true }) }
  })
  it('does not warn on the 60 s demo fixtures with the real lists', async () => {
    for (const lang of ['de', 'en'] as const) {
      const workRoot = await mkdtemp(join(tmpdir(), 'lingo-p5-'))
      try {
        const { clip } = await prepare({ slug: `demo-${lang}`, source: 's3://unused', lang, natives: [lang === 'de' ? 'en' : 'de'], workRoot, publish: false, ai: false }, fixtureDeps(lang))
        expect(clip.warnings.some((x) => x.startsWith('unranked tokens'))).toBe(false)
      } finally { await rm(workRoot, { recursive: true, force: true }) }
    }
  })
})

// Equivalent of the plan's real.test.ts §10.1 "sich is ranked" / "level is B1" checks, as numeric/boolean assertions only.
describe('real fixtures: level and sich (plan §10.1, numeric)', () => {
  it('friedlaender de: every sich token is ranked; level B1, coverageRank < 4000, no unranked warning', async () => {
    const { clip } = await realClip('friedlaender', 'de')
    const sich = clip.cues.flatMap((c) => c.tokens).filter((t) => t.word === 'sich')
    expect(sich.length > 0).toBe(true)
    expect(sich.every((t) => t.rank !== null)).toBe(true)
    expect(clip.level).toBe('B1')
    expect(clip.coverageRank < 4000).toBe(true)
    expect(clip.warnings.some((w) => w.startsWith('unranked tokens'))).toBe(false)
  })
  it('voa01 en: level A2 and coverageRank < 2000', async () => {
    const { clip } = await realClip('voa01', 'en')
    expect(clip.level).toBe('A2')
    expect(clip.coverageRank < 2000).toBe(true)
  })
})
