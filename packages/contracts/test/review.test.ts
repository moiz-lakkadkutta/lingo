import { DueWord, Grade, ProgressStats, ReviewPost } from '../src/index'

const word = {
  savedWordId: 's1', highlightId: 'h1', word: 'Bahnhof', lemma: 'bahnhof', gloss: 'station', example: 'Der Zug ist am Bahnhof.', level: 'A2',
  due: '2026-10-01T10:00:00.000Z', reps: 0, lapses: 0, intervalD: 0, clipSlug: 'demo', clipTitle: 'Demo',
  cueIndex: 3, cueText: 'Der Zug fährt vom Bahnhof ab.', cueNative: 'The train leaves from the station.',
}
const band = (level: 'A1' | 'A2' | 'B1' | 'B2') => ({ level, saved: 2, known: 1 })
const stats = (bands: unknown[]) => ({ level: 'A2', bands, clipsWatched: 1, streak: { day: 2, welcomeBack: false }, dueNow: 1, newNow: 2, dueTomorrow: 0 })

describe('review contracts', () => {
  it('DueWord accepts the extended shape and rejects a missing cueText', () => {
    expect(DueWord.parse(word)).toEqual(word)
    expect(DueWord.safeParse({ ...word, cueNative: null }).success).toBe(true)
    const { cueText: _drop, ...rest } = word
    expect(DueWord.safeParse(rest).success).toBe(false)
  })
  it('ProgressStats requires exactly four bands', () => {
    const four = [band('A1'), band('A2'), band('B1'), band('B2')]
    expect(ProgressStats.safeParse(stats(four)).success).toBe(true)
    expect(ProgressStats.safeParse(stats(four.slice(0, 3))).success).toBe(false)
    expect(ProgressStats.safeParse(stats([...four, band('A1')])).success).toBe(false)
  })
  it('Grade matches ReviewPost.grade', () => {
    expect(Grade.options).toEqual(ReviewPost.shape.grade.options)
  })
})
