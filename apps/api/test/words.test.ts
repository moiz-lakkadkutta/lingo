import { DueWord } from '@lingo/contracts'
import { nativeLine, toDueWord } from '../src/lib/words'

describe('words', () => {
  it('nativeLine picks the learner native language, then en, then null', () => {
    expect(nativeLine({ en: 'The train', tr: 'Tren' }, 'tr')).toBe('Tren')
    expect(nativeLine({ en: 'The train' }, 'tr')).toBe('The train')
    expect(nativeLine({ ar: 'x' }, 'tr')).toBeNull()
  })
  it('nativeLine returns null for non-object or non-string JSON values', () => {
    expect(nativeLine(null, 'en')).toBeNull()
    expect(nativeLine('The train', 'en')).toBeNull()
    expect(nativeLine([1, 2], 'en')).toBeNull()
    expect(nativeLine({ en: 3, tr: { x: 1 } }, 'tr')).toBeNull()
  })
  it('toDueWord maps the highlight, cue and clip fields and formats due as ISO', () => {
    const due = new Date('2026-10-01T08:00:00Z')
    const w = toDueWord({
      id: 's1', due, reps: 2, lapses: 1, intervalD: 6,
      highlight: { id: 'h1', word: 'Bahnhof', lemma: 'bahnhof', gloss: 'station', example: 'Am Bahnhof.', level: 'A2',
        cue: { index: 4, text: 'Der Zug fährt vom Bahnhof ab.', native: { en: 'The train leaves.' }, clip: { slug: 'demo', title: 'Demo clip' } } },
    }, 'en')
    expect(w).toEqual({
      savedWordId: 's1', highlightId: 'h1', word: 'Bahnhof', lemma: 'bahnhof', gloss: 'station', example: 'Am Bahnhof.', level: 'A2',
      due: '2026-10-01T08:00:00.000Z', reps: 2, lapses: 1, intervalD: 6, clipSlug: 'demo', clipTitle: 'Demo clip',
      cueIndex: 4, cueText: 'Der Zug fährt vom Bahnhof ab.', cueNative: 'The train leaves.',
    })
    expect(DueWord.parse(w)).toEqual(w)
  })
})
