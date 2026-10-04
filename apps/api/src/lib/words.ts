import type { DueWord } from '@lingo/contracts'
/** Cue.native is Json { [lang]: text }. Returns json[native] if a string, else json.en if a string, else null. Never throws on odd JSON. */
export function nativeLine(json: unknown, native: string): string | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null
  const o = json as Record<string, unknown>
  const own = o[native]
  if (typeof own === 'string') return own
  return typeof o.en === 'string' ? o.en : null
}
type SavedRow = { id: string; due: Date; reps: number; lapses: number; intervalD: number
  highlight: { id: string; word: string; lemma: string; gloss: string; example: string; level: 'A1' | 'A2' | 'B1' | 'B2'
    cue: { index: number; text: string; native: unknown; clip: { slug: string; title: string } } } }
export function toDueWord(r: SavedRow, native: string): DueWord {
  const h = r.highlight
  return {
    savedWordId: r.id, highlightId: h.id, word: h.word, lemma: h.lemma, gloss: h.gloss, example: h.example, level: h.level,
    due: r.due.toISOString(), reps: r.reps, lapses: r.lapses, intervalD: r.intervalD,
    clipSlug: h.cue.clip.slug, clipTitle: h.cue.clip.title,
    cueIndex: h.cue.index, cueText: h.cue.text, cueNative: nativeLine(h.cue.native, native),
  }
}
