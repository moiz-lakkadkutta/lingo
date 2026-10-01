import { MIN_GAP_S, type Dropped, type Seg } from './segment'

/** Quality gate on the target-language cues (PLAN §5: reject any cue over 20 cps or 2 lines; 1–7 s; ≥ 2 frames apart; monotonic). */
export interface GateFinding { cueIndex: number; problem: 'cps' | 'lines' | 'lineLength' | 'tooShort' | 'tooLong' | 'gap' | 'order'; value: number }
const CPS = 20, LINES = 2, LINE = 42, MIN_S = 1, MAX_S = 7, GAP = MIN_GAP_S

export function qualityGate(segs: Seg[]): GateFinding[] {
  const out: GateFinding[] = []
  const r = (n: number) => Math.round(n * 1000) / 1000
  segs.forEach((s, i) => {
    const lines = s.text.split('\n')
    const dur = s.endS - s.startS
    const cps = lines.join('').length / Math.max(dur, 0.001)
    if (cps > CPS) out.push({ cueIndex: s.index, problem: 'cps', value: r(cps) })
    if (lines.length > LINES) out.push({ cueIndex: s.index, problem: 'lines', value: lines.length })
    const longest = Math.max(...lines.map((l) => l.length))
    if (longest > LINE) out.push({ cueIndex: s.index, problem: 'lineLength', value: longest })
    if (dur < MIN_S - 1e-6) out.push({ cueIndex: s.index, problem: 'tooShort', value: r(dur) })
    if (dur > MAX_S + 1e-6) out.push({ cueIndex: s.index, problem: 'tooLong', value: r(dur) })
    const next = segs[i + 1]
    if (next) {
      const gap = next.startS - s.endS
      if (gap < GAP - 1e-6) out.push({ cueIndex: s.index, problem: 'gap', value: r(gap) })
      if (next.startS <= s.startS) out.push({ cueIndex: next.index, problem: 'order', value: r(next.startS) })
    }
  })
  return out
}

/** gate.json (docs/decisions/0007): every finding joined with its cue's time span and text, what the segmenter dropped, and cues to review. */
/** A cue a human should look at before publishing although it passes the gate: 'number-only' = no letter (12.), kept since 0008 M3. */
export interface GateReview { cueIndex: number; startS: number; endS: number; text: string; reason: 'number-only' }
export interface GateReport { findings: Array<GateFinding & { startS: number; endS: number; text: string }>; dropped: Dropped[]; review: GateReview[] }
export function gateReport(segs: Seg[], dropped: Dropped[]): GateReport {
  const byIndex = new Map(segs.map((s) => [s.index, s]))
  return {
    findings: qualityGate(segs).map((f) => { const s = byIndex.get(f.cueIndex)!; return { ...f, startS: s.startS, endS: s.endS, text: s.text } }),
    dropped,
    review: segs.filter((s) => !/\p{L}/u.test(s.text)).map((s) => ({ cueIndex: s.index, startS: s.startS, endS: s.endS, text: s.text, reason: 'number-only' as const })),
  }
}

/** prepare() calls this: throws one Error listing every finding with its time span and text; `hint` (the correction path) goes on its own line. */
export function assertGate(segs: Seg[], hint?: string): void {
  const findings = gateReport(segs, []).findings
  if (!findings.length) return
  const list = findings.map((f) => `cue ${f.cueIndex} ${f.problem}=${f.value} [${f.startS.toFixed(3)}–${f.endS.toFixed(3)}] ${JSON.stringify(f.text)}`).join('; ')
  throw new Error(`quality gate: ${findings.length} finding(s) — ${list}${hint ? `\n${hint}` : ''}`)
}
