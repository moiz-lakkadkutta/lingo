/** Places highlighted words on the pre-wrapped cue text so DualCue can render them as focusable chips (decision 0006 §1). */
export interface WordSlot { text: string; highlightIdx: number | null }
export interface Alignment { lines: WordSlot[][]; unmatched: number[] }

/** Same strip as packages/pipeline/src/tokenize.ts: leading and trailing non-letter/digit runs, keeping apostrophes and hyphens. */
export function stripToken(s: string): string {
  return s.replace(/^[^\p{L}\p{N}'’-]+/u, '').replace(/[^\p{L}\p{N}'’-]+$/u, '')
}

/**
 * text.split('\n') → lines; each line .split(/\s+/).filter(Boolean) → slots. For each highlight in order: first slot (reading order) with
 * highlightIdx === null whose stripToken(text) === h.word; if none, first with equal lowercase; if none, push the index to `unmatched`.
 */
export function alignHighlights(text: string, highlights: ReadonlyArray<{ word: string }>): Alignment {
  const lines: WordSlot[][] = text.split('\n').map((l) => l.split(/\s+/).filter(Boolean).map((t) => ({ text: t, highlightIdx: null })))
  const flat = lines.flat()
  const stripped = flat.map((s) => stripToken(s.text))
  const unmatched: number[] = []
  highlights.forEach((h, i) => {
    let at = flat.findIndex((s, j) => s.highlightIdx === null && stripped[j] === h.word)
    if (at < 0) {
      const lw = h.word.toLowerCase()
      at = flat.findIndex((s, j) => s.highlightIdx === null && stripped[j]!.toLowerCase() === lw)
    }
    if (at < 0) unmatched.push(i)
    else flat[at]!.highlightIdx = i
  })
  return { lines, unmatched }
}
