import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { segment, cps, wrap2, fits2, MIN_GAP_S } from '../src/segment'
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
