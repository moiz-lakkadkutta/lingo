import { utcDay } from '../src/lib/day'
import { displayStreak, nextStreak } from '../src/lib/streak'

describe('streak', () => {
  it('the first study day starts the streak at 1', () => {
    expect(nextStreak({ streak: 0, lastStudyDay: null }, '2026-10-01')).toEqual({ streak: 1, lastStudyDay: '2026-10-01' })
  })
  it('a second activity on the same UTC day leaves the streak unchanged', () => {
    expect(nextStreak({ streak: 4, lastStudyDay: '2026-10-01' }, '2026-10-01')).toEqual({ streak: 4, lastStudyDay: '2026-10-01' })
  })
  it('activity on the next UTC day adds one', () => {
    expect(nextStreak({ streak: 4, lastStudyDay: '2026-09-30' }, '2026-10-01')).toEqual({ streak: 5, lastStudyDay: '2026-10-01' })
  })
  it('after a missed day the streak restarts at 1', () => {
    expect(nextStreak({ streak: 9, lastStudyDay: '2026-09-29' }, '2026-10-01')).toEqual({ streak: 1, lastStudyDay: '2026-10-01' })
  })
  it('23:59Z and 00:01Z the next day count as consecutive days', () => {
    const a = nextStreak({ streak: 0, lastStudyDay: null }, utcDay(new Date('2026-10-01T23:59:00Z')))
    expect(nextStreak(a, utcDay(new Date('2026-10-02T00:01:00Z')))).toEqual({ streak: 2, lastStudyDay: '2026-10-02' })
  })
  it('display shows the streak when the last study day is today or yesterday', () => {
    expect(displayStreak({ streak: 6, lastStudyDay: '2026-10-01' }, '2026-10-01')).toEqual({ day: 6, welcomeBack: false })
    expect(displayStreak({ streak: 6, lastStudyDay: '2026-09-30' }, '2026-10-01')).toEqual({ day: 6, welcomeBack: false })
  })
  it('display shows day 0 with welcomeBack when the last study day is two or more days ago', () => {
    expect(displayStreak({ streak: 6, lastStudyDay: '2026-09-29' }, '2026-10-01')).toEqual({ day: 0, welcomeBack: true })
    expect(displayStreak({ streak: 6, lastStudyDay: '2025-01-01' }, '2026-10-01')).toEqual({ day: 0, welcomeBack: true })
  })
  it('display shows day 0 without welcomeBack for a learner who never studied', () => {
    expect(displayStreak({ streak: 0, lastStudyDay: null }, '2026-10-01')).toEqual({ day: 0, welcomeBack: false })
  })
})
