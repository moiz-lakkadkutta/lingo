import type { LearnerDto, Level } from '@lingo/contracts'
import { savePlacement } from '../src/lib/placementSave'
import { learner } from './fixtures'

function harness(results: Array<'ok' | 'fail'>) {
  let l: LearnerDto = learner({ level: 'A2' })
  const put = vi.fn(async (_level: Level) => { if (results.shift() === 'fail') throw new Error('offline'); return {} })
  const waits: number[] = []
  const report = vi.fn()
  const deps = { put, setLearner: (fn: (x: LearnerDto) => LearnerDto) => { l = fn(l) }, wait: async (ms: number) => { waits.push(ms) }, report }
  return { deps, put, waits, report, level: () => l.level }
}

describe('L5: placement save', () => {
  it('L5: shows the placed level at once and saves it', async () => {
    const h = harness(['ok'])
    expect(await savePlacement(h.deps, 'B1')).toBe(true)
    expect(h.level()).toBe('B1')
    expect(h.put).toHaveBeenCalledTimes(1)
  })
  it('L5: retries after a failed save and keeps the level when a retry works', async () => {
    const h = harness(['fail', 'ok'])
    expect(await savePlacement(h.deps, 'B1')).toBe(true)
    expect(h.put).toHaveBeenCalledTimes(2)
    expect(h.waits).toEqual([1000])
    expect(h.level()).toBe('B1')
    expect(h.report).not.toHaveBeenCalled()
  })
  it('L5: when every attempt fails it reports and rolls back to the server level', async () => {
    const h = harness(['fail', 'fail', 'fail'])
    expect(await savePlacement(h.deps, 'B2')).toBe(false)
    expect(h.put).toHaveBeenCalledTimes(3)
    expect(h.waits).toEqual([1000, 3000])
    expect(h.report).toHaveBeenCalledWith(expect.any(Error), 'B2')
    expect(h.level()).toBe('A2')
  })
})
