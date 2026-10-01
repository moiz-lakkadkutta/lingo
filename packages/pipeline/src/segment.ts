/**
 * Segmentation rules (PLAN §5, docs/decisions/0007): split at sentence punctuation, then clauses, ≤ 84 chars (2×42 after wrap2), 1–7 s,
 * ≤ 20 cps; a speaker change always starts a new cue. The out-time extends into the following silence up to 0.5 s for reading speed
 * (the 1 s minimum is a hard floor and is not capped), but never past two frames before the next cue's first word.
 * A cue that still reads too fast or is shorter than 1 s is fixed in this order: same-speaker merge forward, same-speaker merge
 * backward, interjection drop (+ rejoin of the interrupted clause), two-speaker cue with the next cue, two-speaker cue with the
 * previous cue (both only when both turns end with punctuation), drop of a tiny (≤ 2 words that fit one 42-char line) cue; anything else is left for the quality gate.
 * Two-speaker cue = Netflix "Dual Speakers": exactly two lines, each `-` + text, one speaker per line, ≤ 42 chars per line.
 * https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide
 */
import type { Word } from './types'
export type { Word }
export interface Seg { index: number; startS: number; endS: number; text: string }
/** A word group the segmenter removed; written to dropped.vtt so a human can restore it through --cues. */
export interface Dropped { startS: number; endS: number; text: string; speaker?: string; reason: 'interjection' | 'unplaceable' }
export interface SegmentReport { cues: Seg[]; dropped: Dropped[] }
/** Minimum gap between consecutive cues: 2 frames at 23.976 fps (2 / 23.976 = 0.0834 s, rounded up to whole ms). Shared with the quality gate. */
export const MIN_GAP_S = 0.084
/** Target line budget (PLAN §5) and native line budget (docs/decisions/0007 M4: 42 × 44 px / 32 px = 57.75, rounded down for a margin). */
export const MAX_LINE = 42, NATIVE_LINE = 56
const MAX_S = 7, MIN_S = 1, CPS = 20, GAP = MIN_GAP_S, EXTEND = 0.5, TINY = 2

const round = (n: number) => Math.round(n * 1000) / 1000
const joinWords = (b: Word[]) => b.map((w) => w.text).join(' ').replace(/\s([,.!?;:])/g, '$1')
/** Characters that count for length and reading speed: line breaks are not characters. */
const chars = (t: string) => t.replace(/\n/g, '').length

const speakerOf = (g: Word[]) => g[0]?.speaker
/** Maximal runs of consecutive words with the same label; an unlabelled word joins the current run. */
function runs(g: Word[]): Word[][] {
  const out: Word[][] = []
  let cur: Word[] = [], label: string | undefined
  for (const w of g) {
    if (cur.length && w.speaker !== undefined && label !== undefined && w.speaker !== label) { out.push(cur); cur = [] }
    if (w.speaker !== undefined) label = w.speaker
    cur.push(w)
  }
  if (cur.length) out.push(cur)
  return out
}
/** One line per run with the Netflix hyphen when there are ≥ 2 runs, else joinWords. */
function render(g: Word[]): string {
  const r = runs(g)
  return r.length >= 2 ? r.map((x) => '-' + joinWords(x)).join('\n') : joinWords(g)
}
const lastEndOf = (g: Word[]) => Math.max(...g.map((w) => w.end))
/** A tiny cue (back-channel, interjection): ≤ 2 words that fit one line. A single long word is content, never tiny. */
const tiny = (g: Word[]) => g.length <= TINY && joinWords(g).length <= MAX_LINE
const endsSentence = (g: Word[]) => /[.!?…]$/.test(g.at(-1)!.text)
const endsPunct = (g: Word[]) => /[.!?…,;:]$/.test(g.at(-1)!.text)

/** Timing of one word group given the next group's first word start (undefined for the last group). */
function timing(group: Word[], nextStart: number | undefined): { s: number; e: number } {
  const s = group[0]!.start, lastEnd = lastEndOf(group)
  const t = render(group), n = chars(t), need = n / CPS
  const latest = nextStart !== undefined ? nextStart - GAP : Infinity
  let e = lastEnd
  if (e - s < need) {
    e = Math.min(s + need, lastEnd + EXTEND, latest, s + MAX_S)
    if (e === s + need && (round(e) - s) * CPS < n) e += 0.001 // 1 ms slack so ms rounding never lands above 20 cps
  }
  if (e - s < MIN_S) e = Math.min(s + MIN_S, latest)
  e = Math.max(e, lastEnd, s + 0.04) // never end before the last word (or before the start)
  if (e > latest) e = Math.max(latest, s + 0.04) // the next cue's words overlap this cue's tail: stop two frames before them
  return { s: round(s), e: round(e) }
}

export function segmentWithReport(words: Word[]): SegmentReport {
  const groups: Word[][] = []
  const dropped: Dropped[] = []
  let buf: Word[] = []
  const flush = () => { if (buf.length) { groups.push(buf); buf = [] } }
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!
    const cand = joinWords([...buf, w])
    const dur = w.end - (buf[0]?.start ?? w.start)
    const last = buf.at(-1)
    const speakerChange = !!last && last.speaker !== undefined && w.speaker !== undefined && w.speaker !== last.speaker
    if (buf.length && (speakerChange || !fits2(cand) || dur > MAX_S || cand.length / Math.max(dur, 0.01) > CPS * 1.5)) flush()
    buf.push(w)
    if (/[.!?]$/.test(w.text) || (/[,;:]$/.test(w.text) && joinWords(buf).length > 40)) flush()
  }
  flush()

  // fix pass, in the fallback order of the header comment
  const n = () => groups.length
  const nextStartOf = (i: number) => groups[i + 1]?.[0]?.start
  const t = (i: number) => timing(groups[i]!, nextStartOf(i))
  const bad = (i: number) => { const { s, e } = t(i); return e - s < MIN_S - 1e-9 || chars(render(groups[i]!)) / (e - s) > CPS }
  const single = (g: Word[]) => runs(g).length === 1 // a two-speaker cue is final
  const sameSpeaker = (a: Word[], b: Word[]) => speakerOf(a) === undefined || speakerOf(b) === undefined || speakerOf(a) === speakerOf(b)
  const differentSpeakers = (a: Word[], b: Word[]) => speakerOf(a) !== undefined && speakerOf(b) !== undefined && speakerOf(a) !== speakerOf(b)
  const pair = (i: number) => [...groups[i]!, ...groups[i + 1]!]
  const mergedTiming = (i: number) => timing(pair(i), nextStartOf(i + 1))
  /** same-speaker merge of i and i+1: the pair fits 2×42 and ≤ 7 s */
  const canMerge = (i: number) => sameSpeaker(groups[i]!, groups[i + 1]!) && single(groups[i]!) && single(groups[i + 1]!)
    && fits2(render(pair(i))) && (() => { const { s, e } = mergedTiming(i); return e - s <= MAX_S })()
  /**
   * two-speaker cue of i and i+1: must be fully good, because it is never merged again. Both turns must end with punctuation:
   * a turn that stops mid-clause ("my new" | "apartment.") is a speaker-label glitch, not a dialogue exchange.
   */
  const canDual = (i: number) => differentSpeakers(groups[i]!, groups[i + 1]!) && endsPunct(groups[i]!) && endsPunct(groups[i + 1]!) && single(groups[i]!) && single(groups[i + 1]!)
    && fits2(render(pair(i)))
    && (() => { const { s, e } = mergedTiming(i); return e - s <= MAX_S && e - s >= MIN_S - 1e-9 && chars(render(pair(i))) / (e - s) <= CPS })()
  const isInterjection = (i: number) => tiny(groups[i]!) && i > 0 && i + 1 < n()
    && speakerOf(groups[i - 1]!) !== undefined && speakerOf(groups[i - 1]!) === speakerOf(groups[i + 1]!) && differentSpeakers(groups[i - 1]!, groups[i]!)
  const merge = (i: number) => { groups.splice(i, 2, pair(i)) }
  const drop = (i: number, reason: Dropped['reason']) => {
    const g = groups[i]!, sp = speakerOf(g)
    dropped.push({ startS: round(g[0]!.start), endS: round(lastEndOf(g)), text: joinWords(g), ...(sp ? { speaker: sp } : {}), reason })
    groups.splice(i, 1)
  }
  for (let i = 0; i < n(); ) {
    if (!bad(i)) { i++; continue }
    if (i + 1 < n() && canMerge(i)) { merge(i); continue }
    if (i > 0 && canMerge(i - 1)) { merge(i - 1); i--; continue }
    if (isInterjection(i)) {
      drop(i, 'interjection') // groups[i] is now the old i+1
      if (!endsSentence(groups[i - 1]!) && canMerge(i - 1)) merge(i - 1) // rejoin the interrupted sentence
      i--; continue // re-check the previous group: its `latest` moved
    }
    if (i + 1 < n() && canDual(i)) { merge(i); i++; continue }
    if (i > 0 && canDual(i - 1)) { merge(i - 1); continue }
    if (tiny(groups[i]!)) { drop(i, 'unplaceable'); i = Math.max(0, i - 1); continue }
    i++
  }
  dropped.sort((a, b) => a.startS - b.startS)

  const out: Seg[] = groups.map((g, i) => { const { s, e } = t(i); return { index: i, startS: s, endS: e, text: render(g) } })
  // safety net: enforce ≥ 2 frames (MIN_GAP_S = 84 ms) between cues; trim only while the cue keeps a positive duration
  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i]!, b = out[i + 1]!
    if (b.startS - a.endS < GAP) { const trimmed = round(b.startS - GAP); if (trimmed > a.startS) a.endS = trimmed }
  }
  return { cues: out, dropped }
}

export function segment(words: Word[]): Seg[] { return segmentWithReport(words).cues }

export function cps(seg: Seg): number { return chars(seg.text) / (seg.endS - seg.startS) }

/** Wrap into ≤ 2 lines of ≤ maxLine chars, breaking at the most balanced space. Text with a forced line break (a two-speaker cue or an edited VTT) is returned unchanged. */
export function wrap2(t: string, maxLine = MAX_LINE): string {
  if (t.includes('\n')) return t
  if (t.length <= maxLine) return t
  const mid = t.length / 2
  let best = -1
  for (let i = 0; i < t.length; i++) if (t[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i
  return best < 0 ? t : `${t.slice(0, best)}\n${t.slice(best + 1)}`
}

/** True when the text fits two lines of ≤ maxLine: as written when it carries a line break, else after wrap2 (≤ 2 × maxLine chars is necessary, not sufficient). */
export function fits2(t: string, maxLine = MAX_LINE): boolean {
  if (t.includes('\n')) { const lines = t.split('\n'); return lines.length <= 2 && lines.every((l) => l.length <= maxLine) }
  return chars(t) <= 2 * maxLine && wrap2(t, maxLine).split('\n').every((l) => l.length <= maxLine)
}

/** A two-speaker cue: ≥ 2 lines and every line starts with '-'. */
export function isDualText(t: string): boolean {
  const lines = t.split('\n')
  return lines.length >= 2 && lines.every((l) => l.startsWith('-'))
}
