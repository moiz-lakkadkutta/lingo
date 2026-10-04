import { levelAfterQuiz, type Attempt } from '../src/lib/levelRule'

const a = (clipId: string, correct: number, total = 10, clipLevel: Attempt['clipLevel'] = 'A2'): Attempt => ({ clipId, clipLevel, correct, total })

describe('levelAfterQuiz', () => {
  it('two eligible attempts on different clips at 90 % or more move up one band', () => {
    expect(levelAfterQuiz('A2', [a('x', 9), a('y', 10)])).toEqual({ level: 'B1', changed: 'up' })
    expect(levelAfterQuiz('A1', [a('x', 9, 10, 'A1'), a('y', 9, 10, 'B1')])).toEqual({ level: 'A2', changed: 'up' })
  })
  it('one attempt is not enough', () => {
    expect(levelAfterQuiz('A2', [a('x', 10)])).toEqual({ level: 'A2', changed: null })
    expect(levelAfterQuiz('A2', [])).toEqual({ level: 'A2', changed: null })
  })
  it('an eligible attempt under 90 % breaks the run', () => {
    expect(levelAfterQuiz('A2', [a('x', 10), a('y', 8)])).toEqual({ level: 'A2', changed: null })
    expect(levelAfterQuiz('A2', [a('x', 10), a('y', 8), a('z', 9)])).toEqual({ level: 'A2', changed: null })
    expect(levelAfterQuiz('A2', [a('x', 10), a('y', 8), a('z', 9), a('w', 10)])).toEqual({ level: 'B1', changed: 'up' })
  })
  it('a retake of the same clip replaces the earlier attempt instead of counting twice', () => {
    expect(levelAfterQuiz('A2', [a('x', 9), a('x', 10)])).toEqual({ level: 'A2', changed: null })
    expect(levelAfterQuiz('A2', [a('x', 9), a('y', 5), a('y', 10)])).toEqual({ level: 'B1', changed: 'up' })
  })
  it('attempts on clips below the learner level are ignored, neither counting nor breaking', () => {
    expect(levelAfterQuiz('B1', [a('x', 10, 10, 'A2'), a('y', 10, 10, 'B1')])).toEqual({ level: 'B1', changed: null })
    expect(levelAfterQuiz('B1', [a('x', 10, 10, 'B1'), a('low', 2, 10, 'A1'), a('y', 9, 10, 'B2')])).toEqual({ level: 'B2', changed: 'up' })
  })
  it('quizzes with fewer than 5 items are ignored', () => {
    expect(levelAfterQuiz('A2', [a('x', 4, 4), a('y', 4, 4)])).toEqual({ level: 'A2', changed: null })
    expect(levelAfterQuiz('A2', [a('x', 9), a('short', 0, 4), a('y', 9)])).toEqual({ level: 'B1', changed: 'up' })
  })
  it('B2 stays B2', () => {
    expect(levelAfterQuiz('B2', [a('x', 10, 10, 'B2'), a('y', 10, 10, 'B2')])).toEqual({ level: 'B2', changed: null })
  })
  it('never moves down', () => {
    expect(levelAfterQuiz('B1', [a('x', 0, 10, 'B1'), a('y', 0, 10, 'B2'), a('z', 1, 10, 'B1')])).toEqual({ level: 'B1', changed: null })
  })
})
