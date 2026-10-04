import { bandRows, nextReview, streakView } from '../src/lib/progress'
import { strings } from '../src/strings'
import { stats } from './fixtures'

describe('progress view-model', () => {
  it('streakView shows Day n for an active streak', () => {
    expect(streakView({ day: 6, welcomeBack: false })).toEqual({ kind: 'day', text: 'Day 6' })
  })
  it('streakView shows Welcome back after a missed day, never a zero streak', () => {
    const v = streakView({ day: 0, welcomeBack: true })
    expect(v).toEqual({ kind: 'welcome', text: 'Welcome back' })
    expect(v.text).not.toMatch(/0/)
  })
  it('streakView shows the first-day line for a new learner', () => {
    expect(streakView({ day: 0, welcomeBack: false })).toEqual({ kind: 'first', text: strings.progress.first })
  })
  it('bandRows computes known over saved and 0 for an empty band', () => {
    const rows = bandRows(stats().bands)
    expect(rows.map((r) => r.fraction)).toEqual([0.5, 0, 0, 1])
    expect(rows.map((r) => r.value)).toEqual(['2 of 4', '0 of 3', '0 of 0', '1 of 1'])
    expect(rows.map((r) => r.level)).toEqual(['A1', 'A2', 'B1', 'B2'])
  })
  it('bandRows labels say approximate', () => {
    for (const r of bandRows(stats().bands)) expect(r.label).toMatch(/approximate/)
    expect(bandRows(stats().bands)[0]!.label).toBe('Level A1, approximate: 2 of 4 saved words known')
  })
  it('nextReview counts new and due words together and offers review', () => {
    expect(nextReview({ dueNow: 2, newNow: 1, dueTomorrow: 4 })).toEqual({ text: '3 words to review now', canReview: true })
    expect(nextReview({ dueNow: 0, newNow: 1, dueTomorrow: 0 })).toEqual({ text: '1 word to review now', canReview: true })
  })
  it('nextReview falls back to tomorrow, then to nothing due', () => {
    expect(nextReview({ dueNow: 0, newNow: 0, dueTomorrow: 4 })).toEqual({ text: '4 words to review tomorrow', canReview: false })
    expect(nextReview({ dueNow: 0, newNow: 0, dueTomorrow: 0 })).toEqual({ text: strings.progress.nothingDue, canReview: false })
  })
})
