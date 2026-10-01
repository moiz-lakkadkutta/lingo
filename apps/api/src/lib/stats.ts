import { KNOWN_MIN_INTERVAL_D, Level } from '@lingo/contracts'
import type { ProgressStats } from '@lingo/contracts'
import { DAY_MS, startOfNextUtcDay, utcDay } from './day'
import { displayStreak, type StreakState } from './streak'
type L = ProgressStats['level']
/** GET /me/stats as a pure function. "Known" = SM-2 interval ≥ 6 days (survived the 1-day review); levels are approximate CEFR from Highlight.level. */
export function computeStats(a: {
  level: L; words: Array<{ intervalD: number; reps: number; lapses: number; due: Date; level: L }>
  clipsWatched: number; streak: StreakState; now: Date
}): ProgressStats {
  const t = startOfNextUtcDay(a.now).getTime(); const t2 = t + DAY_MS
  let dueNow = 0, newNow = 0, dueTomorrow = 0
  for (const w of a.words) {
    const d = w.due.getTime()
    if (d < t) { if (w.reps === 0 && w.lapses === 0) newNow++; else dueNow++ }
    else if (d < t2) dueTomorrow++
  }
  return {
    level: a.level,
    bands: Level.options.map((level) => {
      const ws = a.words.filter((w) => w.level === level)
      return { level, saved: ws.length, known: ws.filter((w) => w.intervalD >= KNOWN_MIN_INTERVAL_D).length }
    }),
    clipsWatched: a.clipsWatched,
    streak: displayStreak(a.streak, utcDay(a.now)),
    dueNow, newNow, dueTomorrow,
  }
}
