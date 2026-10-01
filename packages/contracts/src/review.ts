import { z } from 'zod'
import { Level } from './base'
/** Header the phone sends so /me/* resolves the TV's learner (the code is the pairing secret; docs/decisions/0005). */
export const SESSION_CODE_HEADER = 'x-session-code'
/** A word counts as known once it has survived the 1-day review: SM-2 interval ≥ 6 days. LING-005's "Learned" filter may reuse this. */
export const KNOWN_MIN_INTERVAL_D = 6
export const Grade = z.enum(['again', 'hard', 'good', 'easy'])
export const ReviewResult = z.object({
  savedWordId: z.string(), ease: z.number(), intervalD: z.number().int(), reps: z.number().int(), lapses: z.number().int(), due: z.string().datetime(),
})
export const BandStat = z.object({ level: Level, saved: z.number().int().min(0), known: z.number().int().min(0) })
export const ProgressStats = z.object({
  level: Level,
  bands: z.array(BandStat).length(4),            // always A1, A2, B1, B2 in that order
  clipsWatched: z.number().int().min(0),
  streak: z.object({ day: z.number().int().min(0), welcomeBack: z.boolean() }),
  dueNow: z.number().int().min(0),              // due before the next UTC midnight, already reviewed at least once
  newNow: z.number().int().min(0),              // due now and never reviewed (reps 0 and lapses 0)
  dueTomorrow: z.number().int().min(0),         // due during the next UTC day
})
export type Grade = z.infer<typeof Grade>; export type ReviewResult = z.infer<typeof ReviewResult>
export type BandStat = z.infer<typeof BandStat>; export type ProgressStats = z.infer<typeof ProgressStats>
