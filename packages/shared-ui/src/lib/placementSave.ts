import type { LearnerDto, Level } from '@lingo/contracts'

export interface PlacementSaveDeps {
  /** PUT /me/level { source: 'placement', level }; rejects when it did not save. */
  put(level: Level): Promise<unknown>
  setLearner(fn: (l: LearnerDto) => LearnerDto): void
  /** Pauses between attempts (ms). Default: retry after 1 s and again after 3 s. */
  delays?: readonly number[]
  wait?(ms: number): Promise<void>
  report?(err: unknown, level: Level): void
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const logFailure = (err: unknown, level: Level) => console.warn('[lingo] placement level did not save; level rolled back', level, err)

/**
 * First-run placement result (review-005 L5): shown at once, saved with retries. If every attempt fails, the failure is reported and the
 * level rolls back to what the server holds (unless the learner changed it since), so the TV never shows a level the next boot would revert.
 * Resolves true when saved.
 */
export async function savePlacement({ put, setLearner, delays = [1000, 3000], wait = sleep, report = logFailure }: PlacementSaveDeps, level: Level): Promise<boolean> {
  let before: Level | undefined
  setLearner((l) => { before = l.level; return { ...l, level } })
  let err: unknown
  for (let i = 0; i <= delays.length; i++) {
    try {
      await put(level)
      return true
    } catch (e) {
      err = e
      if (i < delays.length) await wait(delays[i]!)
    }
  }
  report(err, level)
  setLearner((l) => (l.level === level && before !== undefined ? { ...l, level: before } : l))
  return false
}
