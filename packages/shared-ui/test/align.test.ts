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
  it('places a fixed expression ("scavenger sale") on its consecutive slots, also across a line break', () => {
    expect(slots('on Friday to fix up\nthat scavenger sale?', [w('scavenger sale')])).toEqual([
      [['on', null], ['Friday', null], ['to', null], ['fix', null], ['up', null]],
      [['that', null], ['scavenger', 0], ['sale?', 0]],
    ])
    expect(slots('Or a weenie\nroast.', [w('weenie roast')]).flat().filter(([, i]) => i === 0).map(([t]) => t)).toEqual(['weenie', 'roast.'])
    expect(alignHighlights('a scavenger hunt', [w('scavenger sale')]).unmatched).toEqual([0])
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

describe('alignHighlights: two-speaker cues (mirrors pipeline tokenizeCues)', () => {
  it('matches -Wirklich? and -Genau. at the start of speaker lines, keeping the displayed dash', () => {
    const a = alignHighlights('-Wirklich? Das glaube ich.\n-Genau.', [{ word: 'Wirklich' }, { word: 'Genau' }])
    expect(a.unmatched).toEqual([])
    expect(a.lines[0]![0]).toEqual({ text: '-Wirklich?', highlightIdx: 0 })
    expect(a.lines[1]![0]).toEqual({ text: '-Genau.', highlightIdx: 1 })
  })
  it('matches a lowercase -wirklich case-insensitively too', () => {
    expect(alignHighlights('-wirklich?\n-Ja.', [{ word: 'Wirklich' }]).unmatched).toEqual([])
  })
  it('strips the speaker dash only at the start of a line, not inside it', () => {
    const a = alignHighlights('Schick die E-Mail -heute.', [{ word: 'E-Mail' }, { word: 'heute' }])
    expect(a.lines[0]![2]!.highlightIdx).toBe(0)
    expect(a.unmatched).toEqual([1]) // the pipeline keeps "-heute" mid-line, so it never makes a highlight "heute" from it
  })
  it('strips other punctuation the pipeline strips («…», en dash, ellipsis)', () => {
    const a = alignHighlights('–«Wirklich…» Na gut.', [{ word: 'Wirklich' }])
    expect(a.unmatched).toEqual([])
  })
})
