import type { CueDto } from '@lingo/contracts'
import { tokens } from '../../theme/tokens'

/** Index of the cue with startS <= s < endS, or null in a gap. Cues are in time order. */
export function cueAt(cues: readonly CueDto[], s: number): number | null {
  const i = cues.findIndex((c) => c.startS <= s && s < c.endS)
  return i < 0 ? null : i
}

/** Last index with startS <= s, or null before the first cue. */
export function lastStartedCue(cues: readonly CueDto[], s: number): number | null {
  for (let i = cues.length - 1; i >= 0; i--) if (cues[i]!.startS <= s) return i
  return null
}

/**
 * 'prev': if the last-started cue began more than graceS ago → its startS; else the previous cue's startS; none → 0.
 * 'next': first cue with startS > s + 0.05 → its startS; none → null.
 * 'replay': lastStartedCue's startS; none → 0.
 */
export function seekTarget(cues: readonly CueDto[], s: number, dir: 'prev' | 'next' | 'replay', graceS: number = tokens.motion.seekGraceS): number | null {
  if (dir === 'next') return cues.find((c) => c.startS > s + 0.05)?.startS ?? null
  const i = lastStartedCue(cues, s)
  if (i === null) return 0
  const start = cues[i]!.startS
  if (dir === 'replay' || s - start > graceS) return start
  return i > 0 ? cues[i - 1]!.startS : 0
}
