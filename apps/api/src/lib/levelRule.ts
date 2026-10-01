import { LEVELS, NEXT, type Level } from '@lingo/contracts'
/** One TV quiz attempt joined to its clip level (PUT /me/level, source quiz). */
export interface Attempt { clipId: string; clipLevel: Level; correct: number; total: number }
export const MIN_ITEMS = 5, UP_SHARE = 0.9
const idx = (l: Level) => LEVELS.indexOf(l)
/**
 * Level rule (docs/plans/LING-005.md §0.4). `attempts`: since levelChangedAt, oldest → newest, including the one just recorded.
 * Eligible = ≥ 5 items on a clip at or above the learner's level; ineligible attempts neither count nor break a run.
 * Consecutive attempts on the same clip collapse to the latest. The two newest eligible attempts (distinct clips) both ≥ 90 % → up one band.
 * Never moves down; B2 stays B2.
 */
export function levelAfterQuiz(level: Level, attempts: readonly Attempt[]): { level: Level; changed: 'up' | null } {
  const runs: Attempt[] = []
  for (const t of attempts) {
    if (t.total < MIN_ITEMS || idx(t.clipLevel) < idx(level)) continue
    if (runs.at(-1)?.clipId === t.clipId) runs[runs.length - 1] = t
    else runs.push(t)
  }
  const last = runs.slice(-2)
  const up = last.length === 2 && last.every((t) => t.correct / t.total >= UP_SHARE) && NEXT[level] !== level
  return up ? { level: NEXT[level], changed: 'up' } : { level, changed: null }
}
