import { tokenizeWords } from '../src/tokenize'
const mk = (s: string) => s.split(' ').map((w, i) => ({ start: i * 0.35, end: i * 0.35 + 0.3, text: w }))

describe('tokenizeWords', () => {
  it('strips surrounding punctuation and keeps inner apostrophes and hyphens', () => {
    const t = tokenizeWords(mk('Die U-Bahn, sagt er, "fährt" nicht. I don\'t. (Berlin)'))
    expect(t.map((x) => x.word)).toEqual(['Die', 'U-Bahn', 'sagt', 'er', 'fährt', 'nicht', 'I', "don't", 'Berlin'])
  })
  it('marks the first word and every word after . ! ? as sentence-initial', () => {
    const t = tokenizeWords(mk('Nein! Warte, bitte. Wo bist du? Hier… ja'))
    expect(t.map((x) => [x.word, x.sentenceInitial])).toEqual([['Nein', true], ['Warte', true], ['bitte', false], ['Wo', true], ['bist', false], ['du', false], ['Hier', true], ['ja', true]])
    expect(t.map((x) => x.wordIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })
  it('drops tokens that are only punctuation', () => {
    const t = tokenizeWords(mk('Ja - nein … 8. --'))
    expect(t.map((x) => x.word)).toEqual(['Ja', 'nein', '8'])
    expect(t.map((x) => x.wordIndex)).toEqual([0, 2, 4])
  })
})
