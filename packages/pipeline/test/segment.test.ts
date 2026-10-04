import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { segment, segmentWithReport, repairWords, cps, wrap2, fits2, isDualText, MIN_GAP_S, PAUSE_S, GLUE_GAP_S } from '../src/segment'
import { qualityGate } from '../src/gate'
import { wordsFromTranscribe } from '../src/steps/transcribe'
import { TranscribeJson } from '../src/types'
import { FIXTURES } from '../scripts/gen-fixtures'

const mk = (s: string, t0 = 0, per = 0.35, dur = 0.3) => s.split(' ').map((w, i) => ({ start: t0 + i * per, end: t0 + i * per + dur, text: w }))
const fixtureWords = async (lang: 'de' | 'en') => wordsFromTranscribe(TranscribeJson.parse(JSON.parse(await readFile(resolve(FIXTURES, `transcribe-60s-${lang}.json`), 'utf8'))))

describe('segment', () => {
  it('splits at sentence ends and respects limits', () => {
    const segs = segment(mk('Ich warte seit zwei Stunden auf dich. Wo warst du denn die ganze Zeit? Ich habe dreimal angerufen und niemand hat abgenommen, also bin ich einfach hierher gekommen.'))
    expect(segs[0]!.text).toBe('Ich warte seit zwei Stunden auf dich.')
    for (const s of segs) { expect(s.text.length).toBeLessThanOrEqual(84); expect(s.endS - s.startS).toBeGreaterThanOrEqual(1); expect(s.endS - s.startS).toBeLessThanOrEqual(7) }
    for (let i = 0; i < segs.length - 1; i++) expect(segs[i + 1]!.startS - segs[i]!.endS).toBeGreaterThanOrEqual(MIN_GAP_S - 1e-9)
  })
  it('extends short fast cues to a readable duration', () => {
    const segs = segment(mk('Nein! Doch! Ohh!', 0, 0.2))
    for (const s of segs) expect(cps(s)).toBeLessThanOrEqual(20)
  })
  it('wraps into two balanced lines of ≤ 42', () => {
    const w = wrap2('Ich habe dreimal angerufen und niemand hat abgenommen, also bin ich hier')
    const lines = w.split('\n'); expect(lines.length).toBe(2); for (const l of lines) expect(l.length).toBeLessThanOrEqual(42)
  })
  it('never produces a line longer than 42 after wrap2', () => {
    // 20 texts of 70–84 chars with uneven word lengths (long words near the middle make the balanced break fall past 42)
    const texts: string[] = []
    for (let k = 0; k < 20; k++) {
      const lens = [3, 12 + (k % 5), 5, 9, 2, 14 + (k % 7), 7, 11, 4, 8, 6, 13, 3, 10]
      let t = ''
      for (let i = 0; t.length < 70; i++) t = (t ? t + ' ' : '') + String.fromCharCode(97 + ((i + k) % 26)).repeat(lens[(i + k) % lens.length]!)
      texts.push(t.slice(0, 84).trimEnd())
    }
    expect(texts.every((t) => t.length >= 70 && t.length <= 84)).toBe(true)
    expect(fits2('a'.repeat(45) + ' ' + 'b'.repeat(38))).toBe(false)
    for (const t of texts) for (const s of segment(mk(t))) for (const line of wrap2(s.text).split('\n')) expect(line.length).toBeLessThanOrEqual(42)
  })
  it('extends at most 0.5 s past the last word for reading speed', () => {
    // 3 words (34 chars, need 1.7 s) end at 1.0 s; 4 s of silence; the next sentence cannot merge (pair > 84 chars)
    const words = [...mk('Unglaublich, wirklich unglaublich.'), ...mk('Ich habe dreimal angerufen und niemand hat abgenommen, also bin ich hier.', 5)]
    const segs = segment(words)
    expect(segs[0]!.text).toBe('Unglaublich, wirklich unglaublich.')
    expect(segs[0]!.endS - 1.0).toBeLessThanOrEqual(0.5 + 1e-6)
    expect(segs[0]!.endS - segs[0]!.startS).toBeGreaterThanOrEqual(1)
  })
  it('merges a sub-second cue with its neighbour when the pair fits', () => {
    const words = [
      { start: 0, end: 0.19, text: 'Im' }, { start: 0.24, end: 0.57, text: 'Regen?' },
      { start: 1.07, end: 1.26, text: 'Du' }, { start: 1.31, end: 1.59, text: 'bist' }, { start: 1.64, end: 2.06, text: 'verrückt.' },
    ]
    const segs = segment(words)
    expect(segs.map((s) => s.text)).toEqual(['Im Regen? Du bist verrückt.'])
    expect(segs[0]!.endS - segs[0]!.startS).toBeGreaterThanOrEqual(1)
  })
  it('never emits a cue with endS ≤ startS on dense timing', () => {
    const words = Array.from({ length: 40 }, (_, i) => ({ start: i * 0.05, end: i * 0.05 + 0.04, text: String.fromCharCode(97 + (i % 26)) }))
    const segs = segment(words)
    expect(segs.length).toBeGreaterThan(0)
    for (const s of segs) expect(s.endS).toBeGreaterThan(s.startS)
    for (let i = 0; i < segs.length - 1; i++) expect(segs[i + 1]!.startS - segs[i]!.endS).toBeGreaterThanOrEqual(MIN_GAP_S - 1e-9)
  })
  it('keeps the fast exclamation run under 20 cps by merging forward', async () => {
    // the fixture's [fast] run: word durations × 0.5, 20 ms gaps, 50 ms sentence pauses; followed by "Das ist mein Bus." and "Egal, der nächste kommt um 8."
    const all = await fixtureWords('de')
    const from = all.findIndex((w) => w.text === 'Nein!'), to = all.findIndex((w) => w.text === '8.')
    const segs = segment(all.slice(from, to + 1))
    expect(segs[0]!.text).toBe('Nein! Nein! Warte! Stopp! Das ist mein Bus.')
    for (const s of segs) { expect(cps(s)).toBeLessThanOrEqual(20); expect(s.endS - s.startS).toBeGreaterThanOrEqual(1) }
    for (let i = 0; i < segs.length - 1; i++) expect(segs[i + 1]!.startS - segs[i]!.endS).toBeGreaterThanOrEqual(MIN_GAP_S - 1e-9)
  })
  it('cue gaps are at least two frames', async () => {
    for (const lang of ['de', 'en'] as const) {
      const segs = segment(await fixtureWords(lang))
      expect(segs.length).toBeGreaterThan(10)
      for (let i = 0; i < segs.length - 1; i++) expect(segs[i + 1]!.startS - segs[i]!.endS).toBeGreaterThanOrEqual(MIN_GAP_S - 1e-9)
      for (let i = 0; i < segs.length - 1; i++) expect(segs[i + 1]!.startS).toBeGreaterThan(segs[i]!.startS)
    }
  })
})

describe('segment: a single word longer than 42 chars', () => {
  const compound = 'Donaudampfschifffahrtsgesellschaftskapitänsmütze' // 48 chars
  it('places the word alone in its own cue (no empty cue) and the gate reports lineLength instead of crashing', () => {
    expect(compound.length).toBeGreaterThan(42)
    for (const words of [mk(`Das ist die ${compound} von meinem Opa.`, 0, 0.6, 0.5), mk(compound, 0, 0.6, 2), mk(`${compound} ${compound}.`, 0, 3, 2.5)]) {
      const segs = segment(words)
      for (const s of segs) expect(s.text.length).toBeGreaterThan(0)
      expect(segs.map((s) => s.text).join(' ')).toBe(words.map((w) => w.text).join(' '))
      const own = segs.filter((s) => s.text.replace(/[.!?,]$/, '') === compound)
      expect(own.length).toBe(words.filter((w) => w.text.replace(/[.!?,]$/, '') === compound).length)
      const wrapped = segs.map((s) => ({ ...s, text: wrap2(s.text) }))
      expect(() => qualityGate(wrapped)).not.toThrow()
      expect(qualityGate(wrapped).some((f) => f.problem === 'lineLength' && f.value >= compound.length)).toBe(true)
    }
  })
})

// docs/decisions/0007 M3 — speakers, two-speaker cues, drops (docs/plans/LING-001-gate.md §7)
type W = { start: number; end: number; text: string; speaker?: string }
/** words of one speaker, `per` s apart, `dur` s long, starting at t0 */
const say = (speaker: string, s: string, t0: number, per = 0.35, dur = 0.3): W[] => mk(s, t0, per, dur).map((w) => ({ ...w, speaker }))
const endOf = (ws: W[]) => ws.at(-1)!.end
const r3 = (n: number) => Math.round(n * 1000) / 1000
const overlapWords = async () => wordsFromTranscribe(TranscribeJson.parse(JSON.parse(await readFile(resolve(FIXTURES, 'transcribe-overlap-de.json'), 'utf8'))))
const LONG_A = 'Wir haben das Projekt im letzten Jahr dreimal komplett neu geplant und umgebaut.' // 80 chars

describe('segment: speakers (docs/decisions/0007)', () => {
  it('starts a new cue at a speaker change even mid-sentence', () => {
    const a = say('spk_0', 'Ich glaube wirklich, dass das heute Abend', 0)
    const b = say('spk_1', 'nicht mehr klappen wird.', endOf(a) + 0.6)
    expect(segment([...a, ...b]).map((s) => s.text)).toEqual(['Ich glaube wirklich, dass das heute Abend', 'nicht mehr klappen wird.'])
  })
  it('never merges cues of different speakers onto one line', () => {
    const turns: Array<[string, string]> = [['spk_0', 'Komm bitte her.'], ['spk_1', 'Warum denn?'], ['spk_0', 'Weil ich es sage.'], ['spk_1', 'Na gut.'], ['spk_0', 'Danke dir.']]
    const words: W[] = []
    let t0 = 0
    for (const [sp, s] of turns) { const w = say(sp, s, t0, 0.25, 0.2); words.push(...w); t0 = endOf(w) + 0.15 }
    const speakerOfWord = new Map(words.map((w) => [w.text, w.speaker!]))
    const { cues } = segmentWithReport(words)
    expect(cues.length).toBeGreaterThan(0)
    for (const c of cues) {
      const lines = c.text.split('\n')
      expect(lines.length).toBeLessThanOrEqual(2)
      if (lines.length === 2) expect(isDualText(c.text)).toBe(true)
      for (const line of lines) expect(new Set(line.replace(/^-/, '').split(' ').map((x) => speakerOfWord.get(x))).size).toBe(1)
    }
  })
  it('builds a two-speaker cue with one hyphenated line per speaker when a short turn cannot stand alone', () => {
    const a = say('spk_0', LONG_A, 0)
    const genau: W[] = [{ start: endOf(a) + 0.45, end: endOf(a) + 0.85, text: 'Genau.', speaker: 'spk_0' }]
    const b = say('spk_1', 'Aber was ist mit den Kosten?', endOf(genau) + 0.05)
    const { cues, dropped } = segmentWithReport([...a, ...genau, ...b])
    expect(cues.map((c) => c.text)).toEqual([LONG_A, '-Genau.\n-Aber was ist mit den Kosten?'])
    expect(dropped).toEqual([])
    expect(qualityGate(cues.map((s) => ({ ...s, text: wrap2(s.text) })))).toEqual([])
  })
  it('drops a ≤ 2-word interjection inside the other speaker’s turn and rejoins the interrupted clause', () => {
    const a1 = say('spk_0', 'Ich habe gestern mit ihm gesprochen,', 0)
    const ja = say('spk_1', 'Ja.', endOf(a1) + 0.02)
    const a2 = say('spk_0', 'und er sagte, dass er morgen kommt.', endOf(ja) + 0.02)
    const { cues, dropped } = segmentWithReport([...a1, ...ja, ...a2])
    expect(cues.map((c) => c.text)).toEqual(['Ich habe gestern mit ihm gesprochen, und er sagte, dass er morgen kommt.'])
    expect(dropped).toEqual([{ startS: r3(ja[0]!.start), endS: r3(ja[0]!.end), text: 'Ja.', speaker: 'spk_1', reason: 'interjection' }])
  })
  it('drops an unplaceable ≤ 2-word cue at the start of the clip and reports it', () => {
    const ja = say('spk_1', 'Ja.', 0.4)
    const a = say('spk_0', LONG_A, endOf(ja) + 0.02)
    const { cues, dropped } = segmentWithReport([...ja, ...a])
    expect(cues.map((c) => c.text)).toEqual([LONG_A])
    expect(dropped).toEqual([{ startS: 0.4, endS: 0.7, text: 'Ja.', speaker: 'spk_1', reason: 'unplaceable' }])
  })
  it('ends a cue two frames before the next speaker’s overlapping words instead of trimming it under 1 s', () => {
    const a = say('spk_0', 'Das war wirklich nicht einfach für uns alle.', 0)
    const b = say('spk_1', 'Das glaube ich dir sofort.', endOf(a) - 0.12)
    const { cues } = segmentWithReport([...a, ...b])
    expect(cues.map((c) => c.text)).toEqual(['Das war wirklich nicht einfach für uns alle.', 'Das glaube ich dir sofort.'])
    expect(cues[0]!.endS).toBe(r3(cues[1]!.startS - MIN_GAP_S))
    expect(cues[0]!.endS - cues[0]!.startS).toBeGreaterThanOrEqual(1)
    expect(cues[1]!.startS).toBe(r3(b[0]!.start))
    expect(qualityGate(cues.map((s) => ({ ...s, text: wrap2(s.text) })))).toEqual([])
  })
  it('keeps a fast burst under 20 cps by pairing it with the other speaker’s reply', async () => {
    const all = await overlapWords()
    const from = all.findIndex((w) => w.text === 'Nein,'), to = all.findIndex((w) => w.text === 'zufrieden.')
    const burst = all.slice(from, all.findIndex((w) => w.text === 'kurz!') + 1)
    expect(burst.map((w) => w.text).join(' ').length / (endOf(burst) - burst[0]!.start)).toBeGreaterThan(20) // the burst alone reads too fast
    const segs = segment(all.slice(from, to + 1))
    expect(segs[0]!.text).toBe('-Nein, nein, nein, warte mal kurz!\n-Okay, okay.')
    for (const s of segs) { expect(cps(s)).toBeLessThanOrEqual(20); expect(s.endS - s.startS).toBeGreaterThanOrEqual(1) }
  })
  it('never builds a two-speaker cue across a mid-clause speaker-label glitch (VOA cue 35: "-my new\\n-apartment.")', () => {
    // "my new" labelled spk_3, "apartment." spk_0 with zero gap; once at the clip start, once after another speaker's sentence
    for (const before of [[], say('spk_1', 'Welcome back to the show.', 0)]) {
      const glitch = say('spk_3', 'my new', before.length ? endOf(before) + 0.45 : 0.4)
      const apartment: W[] = [{ start: endOf(glitch), end: endOf(glitch) + 0.5, text: 'apartment.', speaker: 'spk_0' }]
      const after = say('spk_0', 'It is small but really nice.', endOf(apartment) + 0.45)
      const { cues, dropped } = segmentWithReport([...before, ...glitch, ...apartment, ...after])
      expect(cues.some((c) => isDualText(c.text))).toBe(false)
      expect(cues.some((c) => c.text.split('\n').some((l) => l === '-my new'))).toBe(false)
      expect(dropped.map((d) => d.text)).toEqual(['my new']) // reported, restorable through dropped.vtt
    }
  })
  it('a short cue overlapped 0.12 s by the next speaker is cut in timing() and becomes a clean two-speaker cue', () => {
    const a = say('spk_0', 'Das stimmt doch.', 0)
    const b = say('spk_1', 'Das glaube ich dir sofort, wirklich.', endOf(a) - 0.12)
    const { cues, dropped } = segmentWithReport([...a, ...b])
    expect(cues.map((c) => c.text)).toEqual(['-Das stimmt doch.\n-Das glaube ich dir sofort, wirklich.'])
    expect(dropped).toEqual([])
    expect(qualityGate(cues.map((s) => ({ ...s, text: wrap2(s.text) })))).toEqual([])
  })
  it('does not drop a tiny cue as an interjection when its neighbours are two different speakers', () => {
    const a = say('spk_0', LONG_A, 0)
    const ja = say('spk_1', 'Ja.', endOf(a) + 0.02)
    const c = say('spk_2', 'Die Kosten waren dabei eigentlich nie das allergrößte Problem für uns alle.', endOf(ja) + 0.02)
    const { cues, dropped } = segmentWithReport([...a, ...ja, ...c])
    expect(dropped.some((d) => d.reason === 'interjection')).toBe(false)
    expect(dropped.map((d) => [d.text, d.reason])).toEqual([['Ja.', 'unplaceable']])
    expect(cues.length).toBe(2)
  })
  it('a two-speaker cue is never merged again', () => {
    const words: W[] = [
      { start: 0, end: 0.3, text: 'Ja.', speaker: 'spk_0' },
      { start: 0.4, end: 0.7, text: 'Nein.', speaker: 'spk_1' },
      { start: 0.8, end: 1.1, text: 'Doch.', speaker: 'spk_0' },
    ]
    const { cues, dropped } = segmentWithReport(words)
    expect(cues.length).toBe(1)
    expect(isDualText(cues[0]!.text)).toBe(true)
    expect(cues[0]!.text.split('\n').length).toBe(2)
    expect(dropped.length).toBe(1)
  })
  it('overlap fixture: 12 cues, 3 dropped, the texts of §5.3, every cue within limits and ≥ 2 frames apart', async () => {
    const { cues, dropped } = segmentWithReport(await overlapWords())
    expect(cues.map((c) => c.text)).toEqual([
      'Wir haben das Projekt im letzten Jahr dreimal komplett neu geplant und umgebaut.',
      '-Genau.\n-Aber was ist mit den Kosten?',
      'Die Kosten waren nie das Problem.',
      'Ich habe gestern mit ihm gesprochen, und er sagte, dass er morgen kommt.',
      'Das war wirklich nicht einfach für uns alle.',
      'Das glaube ich dir sofort.',
      '-Nein, nein, nein, warte mal kurz!\n-Okay, okay.',
      'Das Ganze hat uns am Ende fast zwei Monate gekostet,',
      'und niemand war zufrieden.',
      'Deshalb haben wir diesmal von Anfang an alles anders gemacht.',
      'Und hat es funktioniert?',
      'Ja, zum Glück hat es funktioniert.',
    ])
    expect(dropped.map((d) => [d.text, d.reason, d.speaker])).toEqual([['Ja.', 'unplaceable', 'spk_1'], ['Ja.', 'interjection', 'spk_1'], ['Mhm.', 'interjection', 'spk_1']])
    expect(cues[4]!.endS).toBe(r3(cues[5]!.startS - MIN_GAP_S))
    const wrapped = cues.map((s) => ({ ...s, text: wrap2(s.text) }))
    expect(qualityGate(wrapped)).toEqual([])
    for (const s of wrapped) {
      const dur = s.endS - s.startS
      expect(dur).toBeGreaterThanOrEqual(1); expect(dur).toBeLessThanOrEqual(7); expect(cps(s)).toBeLessThanOrEqual(20)
      const lines = s.text.split('\n'); expect(lines.length).toBeLessThanOrEqual(2); for (const l of lines) expect(l.length).toBeLessThanOrEqual(42)
    }
    for (let i = 0; i < cues.length - 1; i++) expect(cues[i + 1]!.startS - cues[i]!.endS).toBeGreaterThanOrEqual(MIN_GAP_S - 1e-9)
  })
  it('segment() equals segmentWithReport().cues and reports nothing dropped for the 60-second fixtures', async () => {
    for (const lang of ['de', 'en'] as const) {
      const words = await fixtureWords(lang)
      const r = segmentWithReport(words)
      expect(segment(words)).toEqual(r.cues)
      expect(r.dropped).toEqual([])
    }
  })
  it('wrap2 leaves text with a forced line break untouched and honours maxLine', () => {
    expect(wrap2('a\nb')).toBe('a\nb')
    expect(wrap2('-Genau.\n-Aber was ist mit den Kosten?')).toBe('-Genau.\n-Aber was ist mit den Kosten?')
    const hundred = Array.from({ length: 17 }, (_, i) => String.fromCharCode(97 + i).repeat(5)).join(' ').slice(0, 100)
    expect(hundred.length).toBe(100)
    const lines = wrap2(hundred, 56).split('\n')
    expect(lines.length).toBe(2)
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(56)
    expect(wrap2('x'.repeat(50) + ' y', 56)).toBe('x'.repeat(50) + ' y')
  })
  it('fits2 accepts two hyphenated lines of ≤ 42 and rejects a third line or a 43-char line', () => {
    expect(fits2('-' + 'a'.repeat(41) + '\n-' + 'b'.repeat(41))).toBe(true)
    expect(fits2('-a\n-b\n-c')).toBe(false)
    expect(fits2('-' + 'a'.repeat(42) + '\n-b')).toBe(false)
    expect(fits2('a'.repeat(50), 56)).toBe(true)
  })
})

// docs/decisions/0008 — pauses, hesitation stops, orphans, balanced splits, non-verbal items (docs/plans/LING-001-quality.md §3, §10.2)
describe('segment: pauses and orphans (docs/decisions/0008)', () => {
  const texts = (ws: W[]) => segment(ws).map((c) => c.text)
  /** words of `s` starting at t0; returns the words and the end of the last one */
  const at = (s: string, t0: number, per = 0.35, dur = 0.3) => mk(s, t0, per, dur)
  it('splits an utterance at a word gap above PAUSE_S', () => {
    expect(PAUSE_S).toBe(1); expect(GLUE_GAP_S).toBe(2)
    const a = at('Ich warte hier schon', 0)
    expect(texts([...a, ...at('seit einer Stunde auf dich.', endOf(a) + 1.2)])).toEqual(['Ich warte hier schon', 'seit einer Stunde auf dich.'])
    expect(texts([...a, ...at('seit einer Stunde auf dich.', endOf(a) + 0.9)])).toEqual(['Ich warte hier schon seit einer Stunde auf dich.'])
  })
  it('glues an orphan without a sentence end to the utterance that follows, across up to GLUE_GAP_S', () => {
    const lead = at('Er war sehr deutsch.', 0)
    const hat: W[] = [{ start: endOf(lead) + 2.5, end: endOf(lead) + 2.8, text: 'hat' }] // isolated from the left (stop kept, no glue backwards)
    const rest = (gap: number) => at('im Ersten Weltkrieg einen Bruder verloren.', endOf(hat) + gap)
    expect(texts([...lead, ...hat, ...rest(1.5)])).toEqual(['Er war sehr deutsch.', 'hat im Ersten Weltkrieg einen Bruder verloren.'])
    expect(texts([...lead, ...hat, ...rest(2.1)])).toEqual(['Er war sehr deutsch.', 'hat', 'im Ersten Weltkrieg einen Bruder verloren.'])
  })
  it('glues an orphan with a sentence end to the neighbour across the smaller gap', () => {
    const q = at('Kommst du heute Abend mit?', 0)
    const ja: W[] = [{ start: endOf(q) + 0.2, end: endOf(q) + 0.5, text: 'Ja.' }]
    const next = at('Ich hole dich um acht ab.', endOf(ja) + 0.9)
    expect(texts([...q, ...ja, ...next])).toEqual(['Kommst du heute Abend mit? Ja.', 'Ich hole dich um acht ab.'])
    const ja2: W[] = [{ start: endOf(q) + 0.9, end: endOf(q) + 1.2, text: 'Ja.' }]
    expect(texts([...q, ...ja2, ...at('Ich hole dich um acht ab.', endOf(ja2) + 0.2)])).toEqual(['Kommst du heute Abend mit?', 'Ja. Ich hole dich um acht ab.'])
  })
  it('never glues across a speaker change', () => {
    const q = say('spk_0', 'Kommst du heute Abend mit?', 0)
    const ja = say('spk_1', 'Ja, sehr gerne.', endOf(q) + 0.2, 0.25, 0.2) // 0.7 s: an orphan, but not tiny (3 words)
    const next = say('spk_0', 'Dann hole ich dich um acht ab.', endOf(ja) + 0.15)
    const { cues, dropped } = segmentWithReport([...q, ...ja, ...next])
    expect(dropped).toEqual([])
    expect(cues.map((c) => c.text)).toEqual(['Kommst du heute Abend mit?', '-Ja, sehr gerne.\n-Dann hole ich dich um acht ab.'])
    expect(cues[1]!.text.split('\n').length).toBe(2)
    expect(cues.some((c) => c.text.includes('mit? Ja'))).toBe(false)
  })
  it('bisects an overflowing sentence in balance instead of leaving one word', () => {
    const s = 'Gesagt Was willst du mit zwei Kindern in Schai verhungern kannst du auch in Berlin.' // 82 chars, 15 words
    const ws = at(s, 0, 0.52, 0.32)
    expect(r3(endOf(ws) - ws[0]!.start)).toBe(7.6)
    const out = texts(ws)
    expect(out.length).toBe(2)
    expect(out[1]!.endsWith('Berlin.')).toBe(true)
    expect(out[1]!.split(' ').length).toBeGreaterThanOrEqual(3)
    expect(out.join(' ')).toBe(s)
    expect(Math.abs(out[0]!.length - out[1]!.length)).toBeLessThanOrEqual(10)
  })
  it('keeps the clause rule unless the remainder would be an orphan', () => {
    const head = 'Wir haben das Projekt im letzten Jahr geplant,' // 46 chars
    expect(texts(at(`${head} sagt er.`, 0))).toEqual([`${head} sagt er.`]) // 2-word 0.65 s tail: an orphan, no split
    expect(texts(at(`${head} sagt er ganz ruhig zu mir.`, 0))).toEqual([head, 'sagt er ganz ruhig zu mir.'])
  })
  it('repairs a hesitation stop before a lowercase word within a pause, or across up to GLUE_GAP_S for an orphan fragment', () => {
    const a = at('Ich weiß nicht, was er hat.', 0)
    const man = at('man sagt es nicht.', endOf(a) + 0.7)
    const r1 = repairWords([...a, ...man])
    expect(r1.repairedStops).toBe(1)
    expect(r1.words.map((w) => w.text).join(' ')).toBe('Ich weiß nicht, was er hat man sagt es nicht.')
    expect(a.at(-1)!.text).toBe('hat.') // input not mutated
    const lead = at('Er war sehr deutsch.', 0)
    const hat: W[] = [{ start: endOf(lead) + 0.5, end: endOf(lead) + 0.8, text: 'hat.' }]
    const im = at('im Ersten Weltkrieg gekämpft.', endOf(hat) + 1.5)
    const r2 = repairWords([...lead, ...hat, ...im])
    expect(r2.repairedStops).toBe(1)
    expect(r2.words.map((w) => w.text).join(' ')).toBe('Er war sehr deutsch. hat im Ersten Weltkrieg gekämpft.')
    expect(segment([...lead, ...hat, ...im]).map((c) => c.text)).toEqual(['Er war sehr deutsch.', 'hat im Ersten Weltkrieg gekämpft.'])
    const full = at('Wir hatten nur noch ein paar Kartoffeln.', 0, 0.55, 0.45) // a 4 s sentence, not an orphan
    const r3w = repairWords([...full, ...at('verfaulte oder was?', endOf(full) + 1.2)])
    expect(r3w.repairedStops).toBe(0)
    expect(r3w.words.map((w) => w.text)).toContain('Kartoffeln.')
  })
  it('keeps a stop before a one-word sentence, before a capitalised word, across a speaker change, and never touches ! or ?', () => {
    const cases: W[][] = [
      [...at('Er war sehr deutsch.', 0), { start: 1.8, end: 2.1, text: 'hat.' }],
      [...at('Ich war da, aber.', 0), ...at('Man hat gelebt.', 1.6)],
      [...say('spk_0', 'Ich war da, aber.', 0), ...say('spk_1', 'und dann kam er.', 1.6)],
      [...at('Das war toll!', 0), ...at('und dann gingen wir.', 1.2)],
      [...at('War das toll?', 0), ...at('und dann gingen wir.', 1.2)],
    ]
    for (const ws of cases) {
      const r = repairWords(ws)
      expect(r.repairedStops).toBe(0)
      expect(r.words.map((w) => w.text)).toEqual(ws.map((w) => w.text))
    }
  })
  it('drops a sentence without letters as nonverbal and keeps digits inside speech', () => {
    const a = at('Mein Vater hat bis 38 immer geglaubt.', 0)
    const zero: W[] = [{ start: endOf(a) + 1, end: endOf(a) + 1.3, text: '00.', speaker: 'spk_0' }]
    const b = at('Es wird sich nicht halten.', endOf(zero) + 1)
    const { cues, dropped } = segmentWithReport([...a, ...zero, ...b])
    expect(dropped).toEqual([{ startS: r3(zero[0]!.start), endS: r3(zero[0]!.end), text: '00.', speaker: 'spk_0', reason: 'nonverbal' }])
    expect(cues.map((c) => c.text)).toEqual(['Mein Vater hat bis 38 immer geglaubt.', 'Es wird sich nicht halten.'])
  })
  it('60-second fixtures: no pause split, no drop; the en fixture glues its two padded cues', async () => {
    for (const lang of ['de', 'en'] as const) {
      const words = await fixtureWords(lang)
      for (let k = 1; k < words.length; k++) expect(words[k]!.start - words[k - 1]!.end).toBeLessThanOrEqual(PAUSE_S)
      const r = segmentWithReport(words)
      expect(r.dropped).toEqual([]); expect(r.repairedStops).toBe(0)
      if (lang === 'en') expect(r.cues.filter((c) => Math.abs(c.endS - c.startS - 1) < 1e-3)).toEqual([])
    }
  })
})
