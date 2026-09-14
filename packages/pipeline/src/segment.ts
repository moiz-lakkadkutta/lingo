/** Segmentation rules (PLAN §5): split at sentence punctuation, then clauses, ≤ 84 chars (2×42), 1–7 s, ≤ 20 cps; extend into silence ≤ 0.5 s else split. */
export interface Word { start: number; end: number; text: string }
export interface Seg { index: number; startS: number; endS: number; text: string }
const MAX = 84, MAX_S = 7, MIN_S = 1, CPS = 20
export function segment(words: Word[]): Seg[] {
  const out: Seg[] = []
  let buf: Word[] = []
  const text = (b: Word[]) => b.map((w) => w.text).join(' ').replace(/\s([,.!?;:])/g, '$1')
  const flush = (nextStart?: number) => {
    if (!buf.length) return
    let s = buf[0]!.start, e = buf.at(-1)!.end
    const t = text(buf)
    const need = t.length / CPS
    if (e - s < need) e = Math.min(s + need, nextStart !== undefined ? nextStart - 0.08 : s + need, s + MAX_S)
    if (e - s < MIN_S) e = Math.min(s + MIN_S, nextStart !== undefined ? nextStart - 0.08 : s + MIN_S)
    out.push({ index: out.length, startS: round(s), endS: round(e), text: t })
    buf = []
  }
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!
    const cand = text([...buf, w])
    const dur = w.end - (buf[0]?.start ?? w.start)
    if (buf.length && (cand.length > MAX || dur > MAX_S || cand.length / Math.max(dur, 0.01) > CPS * 1.5)) flush(w.start)
    buf.push(w)
    if (/[.!?]$/.test(w.text) || (/[,;:]$/.test(w.text) && text(buf).length > 40)) flush(words[i + 1]?.start)
  }
  flush()
  // a cue that still reads too fast (short exclamations) merges with its neighbour when the pair fits
  for (let i = 0; i < out.length - 1; ) {
    const a = out[i]!, b = out[i + 1]!
    if (cps(a) > CPS && `${a.text} ${b.text}`.length <= MAX && b.endS - a.startS <= MAX_S) { a.text = `${a.text} ${b.text}`; a.endS = b.endS; out.splice(i + 1, 1) } else i++
  }
  const lastSeg = out.at(-1)
  if (lastSeg && cps(lastSeg) > CPS) lastSeg.endS = round(lastSeg.startS + Math.max(MIN_S, lastSeg.text.length / CPS))
  // enforce ≥ 2 frames (80 ms) between cues
  for (let i = 0; i < out.length - 1; i++) if (out[i + 1]!.startS - out[i]!.endS < 0.08) out[i]!.endS = round(out[i + 1]!.startS - 0.08)
  out.forEach((s, i) => (s.index = i))
  return out
}
const round = (n: number) => Math.round(n * 1000) / 1000
export function cps(seg: Seg): number { return seg.text.replace(/\n/g, '').length / (seg.endS - seg.startS) }
/** Wrap into ≤ 2 lines of ≤ 42 chars, breaking at the most balanced space. */
export function wrap2(t: string): string {
  if (t.length <= 42) return t
  const mid = t.length / 2
  let best = -1
  for (let i = 0; i < t.length; i++) if (t[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i
  return best < 0 ? t : `${t.slice(0, best)}\n${t.slice(best + 1)}`
}
