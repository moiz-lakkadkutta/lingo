import { ProgressStats } from '@lingo/contracts'
import { computeStats } from '../src/lib/stats'

const now = new Date('2026-10-01T15:00:00Z')
type W = Parameters<typeof computeStats>[0]['words'][number]
const w = (o: Partial<W> = {}): W => ({ intervalD: 0, reps: 0, lapses: 0, due: new Date('2026-10-01T10:00:00Z'), level: 'A2', ...o })
const run = (words: W[], over: Partial<Parameters<typeof computeStats>[0]> = {}) =>
  computeStats({ level: 'A2', words, clipsWatched: 0, streak: { streak: 0, lastStudyDay: null }, now, ...over })

describe('computeStats', () => {
  it('returns four bands in A1, A2, B1, B2 order even when some are empty', () => {
    const s = run([w({ level: 'B1' })])
    expect(s.bands).toEqual([
      { level: 'A1', saved: 0, known: 0 }, { level: 'A2', saved: 0, known: 0 }, { level: 'B1', saved: 1, known: 0 }, { level: 'B2', saved: 0, known: 0 },
    ])
  })
  it('counts a word as known from an interval of 6 days, not 1', () => {
    const s = run([w({ intervalD: 1, reps: 1 }), w({ intervalD: 6, reps: 2 }), w({ intervalD: 15, reps: 3 })])
    expect(s.bands[1]).toEqual({ level: 'A2', saved: 3, known: 2 })
  })
  it('splits words due before the next UTC midnight into dueNow and newNow by reps and lapses', () => {
    const s = run([
      w(), w({ due: new Date('2026-10-01T23:59:59.999Z') }), // new
      w({ reps: 1, intervalD: 1, due: new Date('2026-09-30T09:00:00Z') }), // due
      w({ reps: 1, intervalD: 1, due: new Date('2026-10-02T00:00:00Z') }), // tomorrow
    ])
    expect([s.newNow, s.dueNow]).toEqual([2, 1])
  })
  it('counts dueTomorrow only within the next UTC day', () => {
    const s = run([
      w({ reps: 1, due: new Date('2026-10-02T00:00:00Z') }), w({ reps: 1, due: new Date('2026-10-02T23:59:59.999Z') }),
      w({ reps: 1, due: new Date('2026-10-03T00:00:00Z') }), w({ reps: 1, due: new Date('2026-10-01T23:00:00Z') }),
    ])
    expect(s.dueTomorrow).toBe(2)
  })
  it('a relearned word (reps 0, lapses 1) is due, not new', () => {
    const s = run([w({ reps: 0, lapses: 1, intervalD: 1 })])
    expect([s.dueNow, s.newNow]).toEqual([1, 0])
  })
  it('passes the streak through displayStreak', () => {
    expect(run([], { streak: { streak: 6, lastStudyDay: '2026-09-30' } }).streak).toEqual({ day: 6, welcomeBack: false })
    expect(run([], { streak: { streak: 6, lastStudyDay: '2026-09-28' } }).streak).toEqual({ day: 0, welcomeBack: true })
  })
  it('output parses with ProgressStats', () => {
    const s = run([w(), w({ level: 'B2', intervalD: 8, reps: 2 })], { clipsWatched: 3, level: 'B1' })
    expect(ProgressStats.parse(s)).toEqual(s)
    expect(s.clipsWatched).toBe(3)
    expect(s.level).toBe('B1')
  })
})
