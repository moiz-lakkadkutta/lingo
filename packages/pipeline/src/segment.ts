/**
 * Segmentation rules (PLAN §5, docs/decisions/0007, docs/decisions/0008): repair → utterances → glue → chunk → merge pass → timing.
 * Repair: a sentence without letters ("00.") is dropped as nonverbal; a hesitation stop ("hat. man") before a lowercase word of the same
 * speaker within PAUSE_S (or GLUE_GAP_S for a sub-second fragment) is removed. Utterances end at a sentence end, a speaker change or a word
 * gap above PAUSE_S. An orphan utterance (spoken span < 1 s) is glued to a same-speaker neighbour across ≤ GLUE_GAP_S (a fragment prefers
 * what follows, a sentence the smaller gap). Chunking keeps the clause rule (split after , ; : once the prefix exceeds 40 chars, unless the
 * rest is an orphan) and bisects anything over 2×42 chars, 7 s or 30 cps at the most balanced point, never leaving an orphan when it can.
 * Limits: ≤ 84 chars (2×42 after wrap2), 1–7 s, ≤ 20 cps; a speaker change always starts a new cue. The out-time extends into the following silence up to 0.5 s for reading speed
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
export interface Dropped { startS: number; endS: number; text: string; speaker?: string; reason: 'interjection' | 'unplaceable' | 'nonverbal' }
export interface SegmentReport { cues: Seg[]; dropped: Dropped[]; /** hesitation stops removed by repairWords (docs/decisions/0008 decision 2) */ repairedStops: number }
/** Minimum gap between consecutive cues: 2 frames at 23.976 fps (2 / 23.976 = 0.0834 s, rounded up to whole ms). Shared with the quality gate. */
export const MIN_GAP_S = 0.084
/** Target line budget (PLAN §5) and native line budget (docs/decisions/0007 M4: 42 × 44 px / 32 px = 57.75, rounded down for a margin). */
export const MAX_LINE = 42, NATIVE_LINE = 56
const MAX_S = 7, MIN_S = 1, CPS = 20, GAP = MIN_GAP_S, EXTEND = 0.5, TINY = 2
/** A word gap above this always ends an utterance (docs/decisions/0008 decision 1). */
export const PAUSE_S = 1.0
/** An orphan may be glued, and two groups merged, across a gap up to this — never more. */
export const GLUE_GAP_S = 2.0
/** = PAUSE_S − EXTEND: the cue gap below which two cues cannot have been split at a pause (tokenize.ts uses it). */
export const UTTERANCE_GAP_S = PAUSE_S - EXTEND

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
const SENTENCE_END = /[.!?…]$/
const spoken = (g: Word[]) => lastEndOf(g) - g[0]!.start
/** An utterance whose spoken span is under 1 s. */
const isOrphan = (g: Word[]) => spoken(g) < MIN_S - 1e-9
const gapBetween = (a: Word[], b: Word[]) => b[0]!.start - lastEndOf(a)
/** Same speaker, or at least one side unlabelled (docs/decisions/0007). */
const sameSpeaker = (a: Word[], b: Word[]) => speakerOf(a) === undefined || speakerOf(b) === undefined || speakerOf(a) === speakerOf(b)
const hasLetter = (t: string) => /\p{L}/u.test(t)
const CLAUSE = /[,;:]$/
/** Today's three overflow checks: fits 2 × 42, spoken ≤ 7 s, ≤ 30 cps before timing. */
const ok = (g: Word[]) => fits2(render(g)) && spoken(g) <= MAX_S && chars(render(g)) / Math.max(spoken(g), 0.01) <= CPS * 1.5

/**
 * Before anything else (docs/decisions/0008 decisions 2 and 5). Pure: changed words are copies.
 * 1. A sentence run (ending at . ! ? …) whose text has no letter ("00.") is removed and reported as 'nonverbal'; digits inside speech stay.
 * 2. A trailing single "." is a hesitation, not a sentence end, when the next word (same speaker) starts lowercase, does not itself end a
 *    sentence, and follows within PAUSE_S — or within GLUE_GAP_S when the run ending here is an orphan fragment. ! and ? are kept.
 */
export function repairWords(words: Word[]): { words: Word[]; dropped: Dropped[]; repairedStops: number } {
  const dropped: Dropped[] = []
  const runsOf: Word[][] = []
  let cur: Word[] = []
  for (const w of words) { cur.push(w); if (SENTENCE_END.test(w.text)) { runsOf.push(cur); cur = [] } }
  if (cur.length) runsOf.push(cur)
  const kept: Array<{ w: Word; run: Word[] }> = []
  for (const run of runsOf) {
    if (!hasLetter(joinWords(run))) {
      const sp = speakerOf(run)
      dropped.push({ startS: round(run[0]!.start), endS: round(lastEndOf(run)), text: joinWords(run), ...(sp ? { speaker: sp } : {}), reason: 'nonverbal' })
      continue
    }
    for (const w of run) kept.push({ w, run })
  }
  let repairedStops = 0
  const out = kept.map(({ w, run }, i) => {
    const n = kept[i + 1]?.w
    if (!n || !/[^.]\.$/.test(w.text) || /…$/.test(w.text)) return w
    if (!/^\p{Ll}/u.test(n.text) || SENTENCE_END.test(n.text) || !sameSpeaker([w], [n])) return w
    const gap = n.start - w.end
    if (!(gap <= PAUSE_S || (isOrphan(run) && gap <= GLUE_GAP_S))) return w
    repairedStops++
    return { ...w, text: w.text.slice(0, -1) }
  })
  return { words: out, dropped, repairedStops }
}

/** One pass: a new utterance starts after a sentence end, at a speaker change (both labelled, different), or after a word gap above PAUSE_S. */
export function utterances(words: Word[]): Word[][] {
  const out: Word[][] = []
  let cur: Word[] = []
  for (const w of words) {
    const prev = cur.at(-1)
    if (prev && (SENTENCE_END.test(prev.text) || (prev.speaker !== undefined && w.speaker !== undefined && prev.speaker !== w.speaker) || w.start - prev.end > PAUSE_S)) { out.push(cur); cur = [] }
    cur.push(w)
  }
  if (cur.length) out.push(cur)
  return out
}

/**
 * Glue every orphan utterance to a same-speaker neighbour across ≤ GLUE_GAP_S: without a sentence end it belongs to what follows (next,
 * then previous) and is glued whatever the length (chunk re-splits); with one, the neighbour across the smaller gap goes first and only a
 * neighbour the sentence fits with (2 × 42, 7 s, 30 cps) is eligible. An orphan with no eligible neighbour stays. The glued utterance is
 * re-checked (it may still be an orphan).
 */
export function glueOrphans(utts: Word[][]): Word[][] {
  const u = [...utts]
  for (let i = 0; i < u.length; ) {
    const cur = u[i]!
    if (!isOrphan(cur)) { i++; continue }
    const prev = u[i - 1], next = u[i + 1]
    // a fragment glues regardless of length (chunk re-splits what follows it); a complete sentence only when the pair fits as one cue,
    // so a short sentence is never cut out of its neighbour's middle by chunk (0007 §5.3 "Genau." stays for the two-speaker rule)
    const fits = (g: Word[]) => !endsSentence(cur) || ok(g)
    const canNext = !!next && sameSpeaker(cur, next) && gapBetween(cur, next) <= GLUE_GAP_S && fits([...cur, ...next])
    const canPrev = !!prev && sameSpeaker(prev, cur) && gapBetween(prev, cur) <= GLUE_GAP_S && fits([...prev, ...cur])
    const gPrev = prev ? gapBetween(prev, cur) : Infinity, gNext = next ? gapBetween(cur, next) : Infinity
    const order: Array<'next' | 'prev'> = !endsSentence(cur) ? ['next', 'prev'] : gPrev <= gNext ? ['prev', 'next'] : ['next', 'prev']
    const pick = order.find((o) => (o === 'next' ? canNext : canPrev))
    if (!pick) { i++; continue }
    if (pick === 'next') u.splice(i, 2, [...cur, ...next!])
    else { u.splice(i - 1, 2, [...prev!, ...cur]); i-- }
  }
  return u
}

/**
 * Split one utterance within the limits. a) the clause rule of 0007 (first , ; : once the prefix exceeds 40 chars, unless the rest is an
 * orphan); b) a piece that breaks a limit (2 × 42, 7 s, 30 cps) is bisected at the most balanced point (bonus 15 for a clause mark),
 * never creating an orphan when another split point exists; recursively.
 */
export function chunk(run: Word[]): Word[][] {
  if (run.length <= 1) return [run]
  for (let k = 0; k < run.length - 1; k++) {
    if (chars(render(run.slice(0, k + 1))) > 40 && CLAUSE.test(run[k]!.text) && !isOrphan(run.slice(k + 1))) return [...chunk(run.slice(0, k + 1)), ...chunk(run.slice(k + 1))]
  }
  if (ok(run)) return [run]
  const ks = Array.from({ length: run.length - 1 }, (_, k) => k)
  const feasible = ks.filter((k) => !isOrphan(run.slice(0, k + 1)) && !isOrphan(run.slice(k + 1)))
  const cost = (k: number) => Math.abs(chars(render(run.slice(0, k + 1))) - chars(render(run.slice(k + 1)))) - (CLAUSE.test(run[k]!.text) ? 15 : 0)
  let best = -1
  for (const k of feasible.length ? feasible : ks) if (best < 0 || cost(k) < cost(best)) best = k
  return [...chunk(run.slice(0, best + 1)), ...chunk(run.slice(best + 1))]
}

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
  const { words: repaired, dropped, repairedStops } = repairWords(words)
  const groups: Word[][] = glueOrphans(utterances(repaired)).flatMap(chunk)

  // fix pass, in the fallback order of the header comment
  const n = () => groups.length
  const nextStartOf = (i: number) => groups[i + 1]?.[0]?.start
  const t = (i: number) => timing(groups[i]!, nextStartOf(i))
  const bad = (i: number) => { const { s, e } = t(i); return e - s < MIN_S - 1e-9 || chars(render(groups[i]!)) / (e - s) > CPS }
  const single = (g: Word[]) => runs(g).length === 1 // a two-speaker cue is final
  const differentSpeakers = (a: Word[], b: Word[]) => speakerOf(a) !== undefined && speakerOf(b) !== undefined && speakerOf(a) !== speakerOf(b)
  const pair = (i: number) => [...groups[i]!, ...groups[i + 1]!]
  const mergedTiming = (i: number) => timing(pair(i), nextStartOf(i + 1))
  /** same-speaker merge of i and i+1: the pair fits 2×42 and ≤ 7 s, never across a gap above GLUE_GAP_S (docs/decisions/0008) */
  const canMerge = (i: number) => sameSpeaker(groups[i]!, groups[i + 1]!) && gapBetween(groups[i]!, groups[i + 1]!) <= GLUE_GAP_S && single(groups[i]!) && single(groups[i + 1]!)
    && fits2(render(pair(i))) && (() => { const { s, e } = mergedTiming(i); return e - s <= MAX_S })()
  /**
   * two-speaker cue of i and i+1: must be fully good, because it is never merged again. Both turns must end with punctuation:
   * a turn that stops mid-clause ("my new" | "apartment.") is a speaker-label glitch, not a dialogue exchange.
   */
  const canDual = (i: number) => differentSpeakers(groups[i]!, groups[i + 1]!) && gapBetween(groups[i]!, groups[i + 1]!) <= GLUE_GAP_S && endsPunct(groups[i]!) && endsPunct(groups[i + 1]!) && single(groups[i]!) && single(groups[i + 1]!)
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
  return { cues: out, dropped, repairedStops }
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
