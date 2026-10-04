import type { LibraryWord } from '@lingo/contracts'
import type { Clip, Cue, Highlight, SavedWord } from '@prisma/client'
/** Anki's "mature" threshold (https://docs.ankiweb.net/getting-started.html#cards): an interval of 21 days or more counts as learned. */
export const LEARNED_INTERVAL_D = 21
export function isLearned(intervalD: number): boolean { return intervalD >= LEARNED_INTERVAL_D }
export type SavedWordWithHighlightCueClip = SavedWord & { highlight: Highlight & { cue: Cue & { clip: Clip } } }
/** One saved word for the TV Words screen. Native line: `nativeLang`, else en, else ''. manifestUrl only for a published clip. */
export function toLibraryWord(row: SavedWordWithHighlightCueClip, nativeLang: string, cdn: (key: string | null) => string | null): LibraryWord {
  const h = row.highlight, q = h.cue, c = q.clip
  const native = (q.native ?? {}) as Record<string, string>
  return {
    savedWordId: row.id, word: h.word, lemma: h.lemma, gloss: h.gloss,
    due: row.due.toISOString(), intervalD: row.intervalD, reps: row.reps, learned: isLearned(row.intervalD),
    clip: { slug: c.slug, title: c.title, manifestUrl: c.status === 'published' ? cdn(c.manifestKey) : null },
    cue: { index: q.index, startS: q.startMs / 1000, endS: q.endMs / 1000, text: q.text, native: native[nativeLang] ?? native.en ?? '' },
  }
}
