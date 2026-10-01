import type { LearnerDto } from '@lingo/contracts'
import { patchLearnerOptimistic } from '../src/lib/learnerPatch'

const base: LearnerDto = { learning: 'de', native: 'en', level: 'A2', plus: false, streak: 0, firstRunDone: false, nativeLine: 'always', autoPause: false, cueScale: 1 }
const harness = (put: () => Promise<unknown>) => {
  let state = base
  const set = (fn: (l: LearnerDto) => LearnerDto) => { state = fn(state) }
  const report = vi.fn()
  return { get: () => state, set, report, put: vi.fn(put) }
}

describe('patchLearnerOptimistic', () => {
  it('applies the change at once and keeps it when PUT /me succeeds', async () => {
    const h = harness(async () => ({}))
    const p = patchLearnerOptimistic({ put: h.put, setLearner: h.set, report: h.report }, { cueScale: 1.25 })
    expect(h.get().cueScale).toBe(1.25)
    expect(await p).toBe(true)
    expect(h.get().cueScale).toBe(1.25)
    expect(h.put).toHaveBeenCalledWith({ cueScale: 1.25 })
    expect(h.report).not.toHaveBeenCalled()
  })
  it('reports a failed PUT /me and rolls the change back', async () => {
    const err = new Error('api')
    const h = harness(async () => { throw err })
    expect(await patchLearnerOptimistic({ put: h.put, setLearner: h.set, report: h.report }, { nativeLine: 'never' })).toBe(false)
    expect(h.report).toHaveBeenCalledWith(err, { nativeLine: 'never' })
    expect(h.get().nativeLine).toBe('always')
  })
  it('does not undo a newer change to the same setting', async () => {
    let fail!: (e: unknown) => void
    const h = harness(() => new Promise((_, rej) => { fail = rej }))
    const first = patchLearnerOptimistic({ put: h.put, setLearner: h.set, report: h.report }, { cueScale: 1.25 })
    h.set((l) => ({ ...l, cueScale: 1.5 })) // a second press before the first PUT fails
    fail(new Error('api'))
    await first
    expect(h.get().cueScale).toBe(1.5)
  })
})
