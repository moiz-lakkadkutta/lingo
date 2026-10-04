import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { tokenizeCues, tokenizeWords } from '../src/tokenize'
import { segment, wrap2, UTTERANCE_GAP_S } from '../src/segment'
import { wordsFromTranscribe } from '../src/steps/transcribe'
import { TranscribeJson } from '../src/types'
import { FIXTURES } from '../scripts/gen-fixtures'
const mk = (s: string) => s.split(' ').map((w, i) => ({ start: i * 0.35, end: i * 0.35 + 0.3, text: w }))
const cuesOf = (texts: string[]) => texts.map((text, index) => ({ index, text }))

describe('tokenizeCues', () => {
  it('tokenizeCues strips the speaker hyphen and marks each hyphenated line’s first word sentence-initial', () => {
    const t = tokenizeCues(cuesOf(['Ich habe gewartet,', '-und dann?\n-Dann kam der Bus.']))
    expect(t.map((x) => [x.word, x.sentenceInitial, x.cueIndex])).toEqual([
      ['Ich', true, 0], ['habe', false, 0], ['gewartet', false, 0],
      ['und', true, 1], ['dann', false, 1], ['Dann', true, 1], ['kam', false, 1], ['der', false, 1], ['Bus', false, 1],
    ])
    expect(t.some((x) => x.word.startsWith('-'))).toBe(false)
  })
  it('tokenizeCues marks a cue’s first word sentence-initial only when the previous cue ends a sentence', () => {
    expect(tokenizeCues(cuesOf(['Ich warte,', 'und du?'])).find((x) => x.word === 'und')!.sentenceInitial).toBe(false)
    expect(tokenizeCues(cuesOf(['Ja.', 'Und du?'])).find((x) => x.word === 'Und')!.sentenceInitial).toBe(true)
    // a wrapped second line continues the sentence; a word after . inside the cue starts one
    expect(tokenizeCues(cuesOf(['Ich warte seit zwei Stunden\nauf dich. Wo warst du?'])).map((x) => x.sentenceInitial)).toEqual([true, false, false, false, false, false, false, true, false, false])
  })
  it('tokenizeCues agrees with tokenizeWords on word and sentenceInitial for both 60-second fixtures', async () => {
    for (const lang of ['de', 'en'] as const) {
      const words = wordsFromTranscribe(TranscribeJson.parse(JSON.parse(await readFile(resolve(FIXTURES, `transcribe-60s-${lang}.json`), 'utf8'))))
      const cues = segment(words).map((s) => ({ ...s, text: wrap2(s.text) }))
      const fromCues = tokenizeCues(cues).map((x) => [x.word, x.sentenceInitial])
      expect(fromCues.length).toBeGreaterThan(100)
      expect(fromCues).toEqual(tokenizeWords(words).map((x) => [x.word, x.sentenceInitial]))
    }
  })
})

describe('tokenizeCues with timestamps (docs/decisions/0008 decision 6)', () => {
  it('tokenizeCues marks a cue sentence-initial after a gap ≥ UTTERANCE_GAP_S unless the previous cue ends in a clause mark', () => {
    expect(UTTERANCE_GAP_S).toBe(0.5)
    const nice = tokenizeCues([{ index: 0, text: 'Listen', startS: 0, endS: 1.0 }, { index: 1, text: 'Nice to meet you', startS: 1.6, endS: 3 }])
    expect(nice.find((x) => x.word === 'Nice')!.sentenceInitial).toBe(true)
    const close = tokenizeCues([{ index: 0, text: 'Listen', startS: 0, endS: 1.0 }, { index: 1, text: 'Nice to meet you', startS: 1.3, endS: 3 }])
    expect(close.find((x) => x.word === 'Nice')!.sentenceInitial).toBe(false)
    const und = tokenizeCues([{ index: 0, text: 'Ich warte,', startS: 0, endS: 1.2 }, { index: 1, text: 'und du', startS: 2.0, endS: 3 }])
    expect(und.find((x) => x.word === 'und')!.sentenceInitial).toBe(false)
  })
  it('tokenizeCues without timestamps behaves as before', () => {
    expect(tokenizeCues(cuesOf(['Listen', 'Nice to meet you'])).find((x) => x.word === 'Nice')!.sentenceInitial).toBe(false)
    expect(tokenizeCues(cuesOf(['Ja.', 'Und du?'])).find((x) => x.word === 'Und')!.sentenceInitial).toBe(true)
    expect(tokenizeCues(cuesOf(['Ich warte,', 'und du?'])).find((x) => x.word === 'und')!.sentenceInitial).toBe(false)
  })
})

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
