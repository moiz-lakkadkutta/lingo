import type { LearnerDto, LearnerSettingsPatch } from '@lingo/contracts'

export interface LearnerPatchDeps {
  /** PUT /me with the patch; rejects when the server refuses it. */
  put(patch: LearnerSettingsPatch): Promise<unknown>
  setLearner(fn: (l: LearnerDto) => LearnerDto): void
  /** Where a failed save goes (logged by default), so it is never silently dropped. */
  report?(err: unknown, patch: LearnerSettingsPatch): void
}

const logFailure = (err: unknown, patch: LearnerSettingsPatch) => console.warn('[lingo] PUT /me did not save; setting rolled back', patch, err)

/** Optimistic settings change: the Player sees it at once. If PUT /me fails, the failure is reported and each changed
 *  setting is rolled back, unless the learner has changed it again since (a newer press wins). Resolves true when saved. */
export async function patchLearnerOptimistic({ put, setLearner, report = logFailure }: LearnerPatchDeps, patch: LearnerSettingsPatch): Promise<boolean> {
  const keys = Object.keys(patch) as (keyof LearnerSettingsPatch)[]
  let before: Partial<LearnerDto> = {}
  setLearner((l) => { before = Object.fromEntries(keys.map((k) => [k, l[k]])); return { ...l, ...patch } })
  try {
    await put(patch)
    return true
  } catch (err) {
    report(err, patch)
    setLearner((l) => {
      const next = { ...l }
      for (const k of keys) if (l[k] === patch[k]) (next as Record<string, unknown>)[k] = before[k]
      return next
    })
    return false
  }
}
