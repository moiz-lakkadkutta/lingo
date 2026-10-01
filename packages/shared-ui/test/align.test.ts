import { alignHighlights, stripToken } from '../src/screens/player/align'

const w = (word: string) => ({ word })
const slots = (text: string, hs: { word: string }[]) => alignHighlights(text, hs).lines.map((l) => l.map((s) => [s.text, s.highlightIdx]))

describe('alignHighlights', () => {
  it('splits one row per pipeline line break and one slot per whitespace-separated token', () => {
    const a = alignHighlights('Ich habe  zwei\nStunden gewartet.', [])
    expect(a.lines.map((l) => l.map((s) => s.text))).toEqual([['Ich', 'habe', 'zwei'], ['Stunden', 'gewartet.']])
    expect(a.lines.flat().every((s) => s.highlightIdx === null)).toBe(true)
    expect(a.unmatched).toEqual([])
  })
  it('places each highlight on the first unassigned slot whose stripped form equals the word', () => {
    expect(slots('Ich habe zwei\nStunden gewartet', [w('Stunden'), w('habe')])).toEqual([
      [['Ich', null], ['habe', 1], ['zwei', null]],
      [['Stunden', 0], ['gewartet', null]],
    ])
  })
  it('matches through trailing punctuation and surrounding quotes', () => {
    expect(stripToken('„Hallo!“')).toBe('Hallo')
    expect(stripToken("geht's,")).toBe("geht's")
    expect(slots('„Hallo!“ Wie geht\'s?', [w('Hallo'), w("geht's")])).toEqual([[['„Hallo!“', 0], ['Wie', null], ["geht's?", 1]]])
  })
  it('assigns a repeated word to successive slots in order', () => {
    expect(slots('nein, nein, nein', [w('nein'), w('nein')])).toEqual([[['nein,', 0], ['nein,', 1], ['nein', null]]])
  })
  it('falls back to case-insensitive matching before reporting unmatched', () => {
    const a = alignHighlights('Morgen gehen wir', [w('morgen')])
    expect(a.lines[0]![0]!.highlightIdx).toBe(0)
    expect(a.unmatched).toEqual([])
  })
  it('reports unmatched highlight indexes and leaves every slot null for them', () => {
    const a = alignHighlights('Guten Morgen', [w('Abend'), w('Morgen'), w('Nacht')])
    expect(a.unmatched).toEqual([0, 2])
    expect(a.lines[0]!.map((s) => s.highlightIdx)).toEqual([null, 1])
  })
})
