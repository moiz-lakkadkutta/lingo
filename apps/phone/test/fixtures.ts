import type { DueWord, ProgressStats, WordSavedPayload } from '@lingo/contracts'
let n = 0
export const dueWord = (o: Partial<DueWord> = {}): DueWord => {
  n++
  return {
    savedWordId: `s${n}`, highlightId: `h${n}`, word: `Wort${n}`, lemma: `wort${n}`, gloss: `word ${n}`, example: `Beispiel ${n}.`, level: 'A2',
    due: '2026-10-01T08:00:00.000Z', reps: 1, lapses: 0, intervalD: 1, clipSlug: 'am-bahnhof', clipTitle: 'Am Bahnhof',
    cueIndex: 0, cueText: `Das ist Wort${n}.`, cueNative: `That is word ${n}.`, ...o,
  }
}
export const fresh = (o: Partial<DueWord> = {}) => dueWord({ reps: 0, lapses: 0, intervalD: 0, ...o })
export const saved = (o: Partial<WordSavedPayload> = {}): WordSavedPayload => {
  n++
  return { code: 'ABC234', savedWordId: `w${n}`, highlightId: `h${n}`, word: `Wort${n}`, lemma: `wort${n}`, gloss: `word ${n}`, example: `Beispiel ${n}.`,
    level: 'A2', clipSlug: 'am-bahnhof', clipTitle: 'Am Bahnhof', savedAt: '2026-10-01T08:00:00.000Z', ...o }
}
export const stats = (o: Partial<ProgressStats> = {}): ProgressStats => ({
  level: 'A2',
  bands: [{ level: 'A1', saved: 4, known: 2 }, { level: 'A2', saved: 3, known: 0 }, { level: 'B1', saved: 0, known: 0 }, { level: 'B2', saved: 1, known: 1 }],
  clipsWatched: 2, streak: { day: 6, welcomeBack: false }, dueNow: 2, newNow: 1, dueTomorrow: 4, ...o,
})
