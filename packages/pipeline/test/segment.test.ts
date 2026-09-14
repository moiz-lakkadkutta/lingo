import { segment, cps, wrap2 } from '../src/segment'
import { pickHighlights, clipLevel } from '../src/highlights'
const mk = (s: string, t0 = 0, per = 0.35) => s.split(' ').map((w, i) => ({ start: t0 + i * per, end: t0 + i * per + 0.3, text: w }))
describe('segment', () => {
  it('splits at sentence ends and respects limits', () => {
    const segs = segment(mk('Ich warte seit zwei Stunden auf dich. Wo warst du denn die ganze Zeit? Ich habe dreimal angerufen und niemand hat abgenommen, also bin ich einfach hierher gekommen.'))
    expect(segs[0]!.text).toBe('Ich warte seit zwei Stunden auf dich.')
    for (const s of segs) { expect(s.text.length).toBeLessThanOrEqual(84); expect(s.endS - s.startS).toBeGreaterThanOrEqual(1); expect(s.endS - s.startS).toBeLessThanOrEqual(7) }
    for (let i = 0; i < segs.length - 1; i++) expect(segs[i + 1]!.startS - segs[i]!.endS).toBeGreaterThanOrEqual(0.079)
  })
  it('extends short fast cues to a readable duration', () => {
    const segs = segment(mk('Nein! Doch! Ohh!', 0, 0.2))
    for (const s of segs) expect(cps(s)).toBeLessThanOrEqual(20)
  })
  it('wraps into two balanced lines of ≤ 42', () => {
    const w = wrap2('Ich habe dreimal angerufen und niemand hat abgenommen, also bin ich hier')
    const lines = w.split('\n'); expect(lines.length).toBe(2); for (const l of lines) expect(l.length).toBeLessThanOrEqual(42)
  })
})
describe('highlights', () => {
  const rank = (l: string) => ({ ich: 1, warte: 1500, seit: 300, zwei: 200, stunden: 900, auf: 40, dich: 120, angerufen: 2500, abgenommen: 3800, berlin: undefined })[l]
  it('picks words in the band above the level, skipping names and numbers, ≤ 2 per cue', () => {
    const hl = pickHighlights([{ index: 0, tokens: 'Ich warte seit zwei Stunden auf dich'.split(' ').map((w) => ({ word: w, lemma: w.toLowerCase() })) }, { index: 1, tokens: 'Berlin 1989 angerufen abgenommen'.split(' ').map((w) => ({ word: w, lemma: w.toLowerCase() })) }], rank, 'A1', 1)
    expect(hl.map((h) => h.lemma)).toEqual(['warte'])
    const b1 = pickHighlights([{ index: 1, tokens: 'Berlin angerufen abgenommen'.split(' ').map((w) => ({ word: w, lemma: w.toLowerCase() })) }], rank, 'A2', 1)
    expect(b1.map((h) => h.lemma)).toEqual(['angerufen', 'abgenommen'])
  })
  it('assigns clip level from 95 % coverage', () => {
    expect(clipLevel('ich seit zwei auf dich ich seit zwei auf dich ich seit zwei auf dich ich seit zwei auf dich warte warte'.split(' ').map((w) => ({ word: w, lemma: w })), rank)).toBe('A2')
  })
})
