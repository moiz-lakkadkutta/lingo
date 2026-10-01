import { lintCues, parseVtt, serializeVtt, type Cue } from '@moizp/vega-media-kit/core'

/** Lingo's limits (PLAN §5): ≤ 20 cps, ≤ 2 lines × 42, ≥ 1 s — passed explicitly rather than relying on the kit's Netflix 0.833 s default. */
export const LINT_LIMITS = { cps: 20, lines: 2, lineLength: 42, minDuration: 1 }

/** Cue ids are `c${index}` (0-based = PreparedCue.index). Text is already wrapped. */
export function cuesToVtt(cues: Array<{ index: number; startS: number; endS: number; text: string }>, trackId: string): string {
  return serializeVtt(cues.map((c) => ({ trackId, id: `c${c.index}`, start: c.startS, end: c.endS, text: c.text })))
}

/** Parse with minDuration 0 / mergeGap 0 so the round trip compares what we wrote, not the kit's padding; lint with Lingo's limits. */
export function checkVtt(vtt: string, trackId: string): { cues: Cue[]; findings: ReturnType<typeof lintCues> } {
  const cues = parseVtt(vtt, { trackId, minDuration: 0, mergeGap: 0 })
  return { cues, findings: lintCues(cues, LINT_LIMITS) }
}
