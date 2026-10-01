import { clipLevel, coverageRank, reviewHighlights, unrankedShare } from '../src/highlights'
import { repairWords, segmentWithReport } from '../src/segment'
import { gateReport } from '../src/gate'
import { realClip } from './helpers/realClip'
import { simplemmaAvailable } from './helpers/simplemma'

const mk = (s: string, t0 = 0, per = 0.35, dur = 0.3) => s.split(' ').map((w, i) => ({ start: t0 + i * per, end: t0 + i * per + dur, text: w }))

describe('M1: level, coverage and unranked share use the token rank (rankOf: I\'m → i)', () => {
  const rank = (l: string) => ({ i: 10, let: 500, be: 2 })[l]
  const toks = [{ word: "I'm", lemma: "I'm" }, { word: "Let's", lemma: "Let's" }, { word: 'is', lemma: 'be' }]
  it('contractions do not count as unranked', () => {
    expect(unrankedShare(toks, rank)).toEqual({ share: 0, lemmas: [] })
    expect(clipLevel(toks, rank)).toBe('A1')
    expect(coverageRank(toks, rank)).toBe(500)
  })
})

describe('M2: the hesitation repair leaves abbreviations and ordinals alone', () => {
  for (const [label, text] of [['usw. und', 'Äpfel, Birnen usw. und dann Brot.'], ['etc. and', 'Apples, pears etc. and then bread.'], ['Die 3. und', 'Die 3. und die 4. Klasse kamen.'], ['z.B. und', 'Obst z.B. und Gemüse kauften wir.'], ['Dr. und', 'Er rief Dr. und Frau Meier an.']] as const) {
    it(`keeps the dot in "${label}"`, () => {
      const ws = mk(text)
      const r = repairWords(ws)
      expect(r.repairedStops).toBe(0)
      expect(r.words.map((w) => w.text)).toEqual(ws.map((w) => w.text))
    })
  }
  it('still repairs an ordinary hesitation stop', () => {
    const r = repairWords(mk('Und dann hat. man die Papiere angeguckt.'))
    expect(r.repairedStops).toBe(1)
    expect(r.words.map((w) => w.text).join(' ')).toBe('Und dann hat man die Papiere angeguckt.')
  })
})

describe('M3: only zeros or symbol-only runs are nonverbal; a number-only cue stays and is listed for review', () => {
  it('drops 00., 0. and a run without letters or digits; keeps 12.', () => {
    const a = mk('Ich war lange dort.', 0)
    const runs = [{ start: 3, end: 3.3, text: '00.' }, { start: 5, end: 5.3, text: '0.' }, { start: 7, end: 7.3, text: '…' }, { start: 9, end: 9.3, text: '12.' }]
    const b = mk('Dann kam er zurück.', 11)
    const r = repairWords([...a, ...runs, ...b])
    expect(r.dropped.map((d) => d.text)).toEqual(['00.', '0.', '…'])
    expect(r.dropped.every((d) => d.reason === 'nonverbal')).toBe(true)
    expect(r.words.some((w) => w.text === '12.')).toBe(true)
  })
  it('gate.json lists a number-only cue under review', () => {
    const words = [...mk('Ich war lange dort.', 0), { start: 4, end: 5.2, text: '12.' }, ...mk('Dann kam er zurück.', 7)]
    const { cues, dropped } = segmentWithReport(words)
    const numberCue = cues.find((c) => c.text === '12.')
    expect(numberCue).toBeDefined()
    const report = gateReport(cues, dropped)
    expect(report.review).toEqual([{ cueIndex: numberCue!.index, startS: numberCue!.startS, endS: numberCue!.endS, text: '12.', reason: 'number-only' }])
    expect(gateReport([{ index: 0, startS: 0, endS: 2, text: 'Ein Satz.' }], []).review).toEqual([])
  })
})

describe('highlight tail guard (no ceiling stays)', () => {
  const hl = [
    { cueIndex: 0, word: 'warte', lemma: 'warten', rank: 1500 },
    { cueIndex: 1, word: 'Konsulat', lemma: 'Konsulat', rank: 9523 },
    { cueIndex: 2, word: 'Xylofonia', lemma: 'Xylofonia', rank: 15000 },
    { cueIndex: 3, word: 'Holocausts', lemma: 'Holocaust', rank: 15958 },
  ]
  it('lists every highlight above 8000 for review; de also flags capitalised, uninflected highlights above 12000 as possible names', () => {
    const de = reviewHighlights(hl, 'de'), en = reviewHighlights(hl, 'en')
    expect(de.filter((w) => w.startsWith('review: rare highlight ')).length).toBe(3)
    expect(de.filter((w) => w.startsWith('review: possible name ')).length).toBe(1)
    expect(en.filter((w) => w.startsWith('review: rare highlight ')).length).toBe(3)
    expect(en.filter((w) => w.startsWith('review: possible name ')).length).toBe(0)
    expect(de[0]).toMatch(/^review: rare highlight 9523 Konsulat \(cue 1\)$/)
    expect(reviewHighlights(hl.slice(0, 1), 'de')).toEqual([])
  })
  it('real fixtures: one review warning per highlight above 8000 (counts only)', async () => {
    for (const [name, lang] of [['friedlaender', 'de'], ['voa01', 'en']] as const) {
      const { clip, logs } = await realClip(name, lang)
      const rare = clip.highlights.filter((h) => h.rank > 8000).length
      expect(clip.warnings.filter((w) => w.startsWith('review: rare highlight ')).length).toBe(rare)
      expect(logs.filter((l) => l.startsWith('warning: review: rare highlight ')).length).toBe(rare)
      if (lang === 'en') expect(clip.warnings.some((w) => w.startsWith('review: possible name '))).toBe(false)
    }
  })
})

describe('L3: simplemma tests fail loudly in CI', () => {
  it('throws in CI without LINGO_PYTHON or simplemma; skips locally', async () => {
    await expect(simplemmaAvailable({ CI: 'true' }, async () => true)).rejects.toThrow(/LINGO_PYTHON/)
    await expect(simplemmaAvailable({ CI: 'true', LINGO_PYTHON: '/x' }, async () => false)).rejects.toThrow(/simplemma/)
    expect(await simplemmaAvailable({ CI: 'true', LINGO_PYTHON: '/x' }, async () => true)).toBe(true)
    expect(await simplemmaAvailable({}, async () => false)).toBe(false)
  })
})
