import type { RawToken } from './tokenize'
import type { TranscribeJson } from './types'

/**
 * ASR filter on highlight candidates (docs/plans/LING-002-gate-c.md §2, docs/decisions/0009 decision 1).
 * Transcribe output (item `confidence`): https://docs.aws.amazon.com/transcribe/latest/dg/how-input.html#how-it-works-output
 * Floor 0.4: below the lowest correct highlight measured (old-timer 0.519), above the ASR error `sal` (0.158).
 */
export const MIN_HIGHLIGHT_CONFIDENCE = 0.4

const norm = (s: string) => s.replace(/’/g, "'").replace(/^[^\p{L}\p{N}'-]+/u, '').replace(/[^\p{L}\p{N}'-]+$/u, '').toLowerCase()

export interface ConfidenceItem { text: string; start: number; end: number; conf: number }

/** Transcribe pronunciation items → { text (stripped, lowercase), start, end, confidence }; items without a numeric confidence are left out. */
export function confidenceItems(t: TranscribeJson): ConfidenceItem[] {
  const out: ConfidenceItem[] = []
  for (const i of t.results.items) {
    if (i.type !== 'pronunciation') continue
    const conf = Number.parseFloat(i.alternatives[0]!.confidence ?? '')
    const text = norm(i.alternatives[0]!.content)
    if (!Number.isFinite(conf) || !text) continue
    const start = Number.parseFloat(i.start_time ?? '0')
    out.push({ text, start, end: Number.parseFloat(i.end_time ?? i.start_time ?? '0'), conf })
  }
  return out
}

/**
 * For each RawToken (cue order), the confidence of the Transcribe item with the same stripped lowercase text whose midpoint lies in
 * [cue.startS − 0.25, cue.endS + 0.25], matched left to right with one forward pointer per cue; undefined when there is no match.
 */
export function alignConfidence(raw: RawToken[], cues: Array<{ index: number; startS: number; endS: number }>, items: ConfidenceItem[]): Array<number | undefined> {
  const window = new Map<number, ConfidenceItem[]>()
  for (const c of cues) window.set(c.index, items.filter((i) => { const mid = (i.start + i.end) / 2; return mid >= c.startS - 0.25 && mid <= c.endS + 0.25 }))
  const pointer = new Map<number, number>()
  return raw.map((t) => {
    const its = window.get(t.cueIndex) ?? []
    const from = pointer.get(t.cueIndex) ?? 0
    const w = norm(t.word)
    for (let j = from; j < its.length; j++) {
      if (its[j]!.text === w) { pointer.set(t.cueIndex, j + 1); return its[j]!.conf }
    }
    return undefined
  })
}

/** Plain Levenshtein distance (two rows). */
export function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]!
}

/** Key of a token for `pickHighlights(…, exclude)`: `${cueIndex}|${word.toLowerCase()}`. */
export const tokenKey = (cueIndex: number, word: string) => `${cueIndex}|${word.toLowerCase()}`

/**
 * Rule 2 of LING-002-gate-c §2.2 with the reason per key: a token is an ASR suspect when its lemma L occurs once in the clip and another
 * lemma M of the clip occurs at least twice, |M| ≥ 3, Levenshtein(L, M) = 1, rank(M) < rank(L) (unranked L counts as rarer), and one
 * occurrence of M has the same preceding token (case-insensitive, across cue boundaries) as L's occurrence.
 */
export function asrSuspectReasons(cues: Array<{ index: number; tokens: Array<{ word: string; lemma: string }> }>, rank: (lemma: string) => number | undefined): Map<string, string> {
  const flat = cues.flatMap((c) => c.tokens.map((t) => ({ cueIndex: c.index, word: t.word, lemma: t.lemma.toLowerCase() })))
  const count = new Map<string, number>()
  const prevWords = new Map<string, Set<string>>()
  flat.forEach((t, i) => {
    count.set(t.lemma, (count.get(t.lemma) ?? 0) + 1)
    if (i > 0) { const s = prevWords.get(t.lemma) ?? new Set<string>(); s.add(flat[i - 1]!.word.toLowerCase()); prevWords.set(t.lemma, s) }
  })
  const frequent = [...count].filter(([m, n]) => n >= 2 && m.length >= 3).map(([m]) => m)
  const out = new Map<string, string>()
  flat.forEach((t, i) => {
    if (i === 0 || count.get(t.lemma) !== 1) return
    const prev = flat[i - 1]!.word.toLowerCase()
    const rl = rank(t.lemma)
    for (const m of frequent) {
      if (m === t.lemma || Math.abs(m.length - t.lemma.length) > 1 || levenshtein(m, t.lemma) !== 1) continue
      const rm = rank(m)
      if (rm === undefined || (rl !== undefined && rm >= rl)) continue
      if (!prevWords.get(m)?.has(prev)) continue
      out.set(tokenKey(t.cueIndex, t.word), `one-off near-spelling of "${m}" after "${prev}"`)
      return
    }
  })
  return out
}

/** Rule 2 of LING-002-gate-c §2.2. Returns keys `${cueIndex}|${word.toLowerCase()}`. */
export function asrSuspects(cues: Array<{ index: number; tokens: Array<{ word: string; lemma: string }> }>, rank: (lemma: string) => number | undefined): Set<string> {
  return new Set(asrSuspectReasons(cues, rank).keys())
}

/** Warning text for a highlight candidate skipped by the ASR filter. */
export function asrSkipWarning(cueIndex: number, word: string, asr: number | undefined, reason: string | undefined): string {
  const why = asr !== undefined && asr < MIN_HIGHLIGHT_CONFIDENCE ? `confidence ${asr.toFixed(2)}` : reason ?? 'ASR suspect'
  return `asr: skipped highlight "${word}" (cue ${cueIndex}): ${why}`
}
