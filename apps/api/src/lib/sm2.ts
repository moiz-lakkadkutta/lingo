/**
 * SM-2 as Anki documents it: first interval 1 day, then 6, then interval × ease; ease starts 2.5 (250 %).
 * Again → lapse, interval 1 (relearn), ease −0.20 (floor 1.3); Hard → interval × 1.2, ease −0.15; Good → × ease; Easy → × ease × 1.3, ease +0.15.
 */
export type Grade = 'again' | 'hard' | 'good' | 'easy'
export interface Card { ease: number; intervalD: number; reps: number; lapses: number }
export function sm2(c: Card, grade: Grade): Card {
  let { ease, intervalD, reps, lapses } = c
  if (grade === 'again') return { ease: Math.max(1.3, ease - 0.2), intervalD: 1, reps: 0, lapses: lapses + 1 }
  let next: number
  if (reps === 0) next = 1
  else if (reps === 1) next = 6
  else next = Math.round(intervalD * (grade === 'hard' ? 1.2 : ease) * (grade === 'easy' ? 1.3 : 1)) // interval uses the ease *before* this grade adjusts it
  if (grade === 'hard') ease = Math.max(1.3, ease - 0.15)
  if (grade === 'easy') ease = ease + 0.15
  if (grade === 'hard' && reps >= 2) next = Math.max(intervalD + 1, next)
  return { ease, intervalD: Math.max(1, next), reps: reps + 1, lapses }
}
