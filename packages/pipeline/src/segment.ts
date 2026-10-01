/**
 * Segmentation rules (PLAN §5): split at sentence punctuation, then clauses, ≤ 84 chars (2×42 after wrap2), 1–7 s, ≤ 20 cps;
 * extend the out-time into the following silence up to 0.5 s for reading speed (the 1 s minimum is a hard floor and is not capped);
 * a cue that still reads too fast or is shorter than 1 s merges with its neighbour when the pair fits.
 */
import type { Word } from './types'
export type { Word }
export interface Seg { index: number; startS: number; endS: number; text: string }
/** Minimum gap between consecutive cues: 2 frames at 23.976 fps (2 / 23.976 = 0.0834 s, rounded up to whole ms). Shared with the quality gate. */
export const MIN_GAP_S = 0.084
const MAX = 84, MAX_S = 7, MIN_S = 1, CPS = 20, GAP = MIN_GAP_S, EXTEND = 0.5

const round = (n: number) => Math.round(n * 1000) / 1000
const joinWords = (b: Word[]) => b.map((w) => w.text).join(' ').replace(/\s([,.!?;:])/g, '$1')

/** Timing of one word group given the next group's first word start (undefined for the last group). */
function timing(group: Word[], nextStart: number | undefined): { s: number; e: number } {
  const s = group[0]!.start, lastEnd = group.at(-1)!.end
  const t = joinWords(group)
  const need = t.length / CPS
  const latest = nextStart !== undefined ? nextStart - GAP : Infinity
  let e = lastEnd
  if (e - s < need) {
    e = Math.min(s + need, lastEnd + EXTEND, latest, s + MAX_S)
    if (e === s + need && (round(e) - s) * CPS < t.length) e += 0.001 // 1 ms slack so ms rounding never lands above 20 cps
  }
  if (e - s < MIN_S) e = Math.min(s + MIN_S, latest)
  e = Math.max(e, lastEnd, s + 0.04) // never end before the last word (or before the start)
  return { s: round(s), e: round(e) }
}

export function segment(words: Word[]): Seg[] {
  const groups: Word[][] = []
  let buf: Word[] = []
  const flush = () => { if (buf.length) { groups.push(buf); buf = [] } }
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!
    const cand = joinWords([...buf, w])
    const dur = w.end - (buf[0]?.start ?? w.start)
    if (buf.length && (!fits2(cand) || dur > MAX_S || cand.length / Math.max(dur, 0.01) > CPS * 1.5)) flush()
    buf.push(w)
    if (/[.!?]$/.test(w.text) || (/[,;:]$/.test(w.text) && joinWords(buf).length > 40)) flush()
  }
  flush()

  // merge pass: a cue that reads too fast or is shorter than 1 s merges forward, else backward, when the pair fits (≤ 84 chars / 2×42, ≤ 7 s)
  const nextStartOf = (i: number) => groups[i + 1]?.[0]?.start
  const bad = (i: number) => { const g = groups[i]!, { s, e } = timing(g, nextStartOf(i)); return e - s < MIN_S - 1e-9 || joinWords(g).length / (e - s) > CPS }
  const canMerge = (i: number) => {
    const merged = [...groups[i]!, ...groups[i + 1]!]
    if (!fits2(joinWords(merged))) return false
    const { s, e } = timing(merged, nextStartOf(i + 1))
    return e - s <= MAX_S
  }
  for (let i = 0; i < groups.length; ) {
    if (!bad(i)) { i++; continue }
    if (i + 1 < groups.length && canMerge(i)) { groups.splice(i, 2, [...groups[i]!, ...groups[i + 1]!]); continue }
    if (i > 0 && canMerge(i - 1)) { groups.splice(i - 1, 2, [...groups[i - 1]!, ...groups[i]!]); i--; continue }
    i++
  }

  const out: Seg[] = groups.map((g, i) => { const { s, e } = timing(g, nextStartOf(i)); return { index: i, startS: s, endS: e, text: joinWords(g) } })
  // enforce ≥ 2 frames (MIN_GAP_S = 84 ms) between cues; trim only while the cue keeps a positive duration
  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i]!, b = out[i + 1]!
    if (b.startS - a.endS < GAP) { const trimmed = round(b.startS - GAP); if (trimmed > a.startS) a.endS = trimmed }
  }
  return out
}

export function cps(seg: Seg): number { return seg.text.replace(/\n/g, '').length / (seg.endS - seg.startS) }

/** Wrap into ≤ 2 lines of ≤ 42 chars, breaking at the most balanced space. */
export function wrap2(t: string): string {
  if (t.length <= 42) return t
  const mid = t.length / 2
  let best = -1
  for (let i = 0; i < t.length; i++) if (t[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i
  return best < 0 ? t : `${t.slice(0, best)}\n${t.slice(best + 1)}`
}

/** True when the text fits two lines of ≤ 42 after wrap2 (≤ 84 chars is necessary, not sufficient). */
export function fits2(t: string): boolean {
  return t.length <= MAX && wrap2(t).split('\n').every((l) => l.length <= 42)
}
