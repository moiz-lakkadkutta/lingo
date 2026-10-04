import { db } from './db'
import { addUtcDays, utcDay } from './day'
/** A study day is a graded review or a saved word (server-side, UTC). A missed day shows "Welcome back", never a zero streak. */
export interface StreakState { streak: number; lastStudyDay: string | null }
/** today === last → unchanged; last === yesterday → streak + 1; otherwise (null or older) → 1. */
export function nextStreak(s: StreakState, today: string): StreakState {
  if (s.lastStudyDay === today) return s
  if (s.lastStudyDay === addUtcDays(today, -1)) return { streak: s.streak + 1, lastStudyDay: today }
  return { streak: 1, lastStudyDay: today }
}
/** last is today or yesterday → { day: streak, welcomeBack: false }; null → { day: 0, welcomeBack: false }; older → { day: 0, welcomeBack: true }. */
export function displayStreak(s: StreakState, today: string): { day: number; welcomeBack: boolean } {
  if (s.lastStudyDay === null) return { day: 0, welcomeBack: false }
  if (s.lastStudyDay === today || s.lastStudyDay === addUtcDays(today, -1)) return { day: s.streak, welcomeBack: false }
  return { day: 0, welcomeBack: true }
}
/** Applies nextStreak(utcDay(now)) and writes { streak, lastStudyDay } only when they change. Called from POST /me/reviews and POST /me/words. */
export async function touchStreak(l: { id: string; streak: number; lastStudyDay: string | null }, now: Date): Promise<void> {
  const n = nextStreak({ streak: l.streak, lastStudyDay: l.lastStudyDay }, utcDay(now))
  if (n.streak === l.streak && n.lastStudyDay === l.lastStudyDay) return
  await db.learner.update({ where: { id: l.id }, data: n })
}
