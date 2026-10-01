import { phoneQuizReducer, type PhoneQuizState } from '../src/session/types'

const idle: PhoneQuizState = { status: 'idle' }
describe('phoneQuizReducer', () => {
  it('sent moves to sent and a result then moves to done', () => {
    const s = phoneQuizReducer(idle, { type: 'sent', clipSlug: 'x' })
    expect(s).toEqual({ status: 'sent', clipSlug: 'x' })
    expect(phoneQuizReducer(s, { type: 'result', correct: 4, total: 5 })).toEqual({ status: 'done', clipSlug: 'x', correct: 4, total: 5 })
  })
  it('a result while idle is ignored', () => {
    expect(phoneQuizReducer(idle, { type: 'result', correct: 1, total: 2 })).toBe(idle)
    const done: PhoneQuizState = { status: 'done', clipSlug: 'x', correct: 1, total: 2 }
    expect(phoneQuizReducer(done, { type: 'result', correct: 2, total: 2 })).toBe(done)
    expect(phoneQuizReducer(done, { type: 'reset' })).toEqual(idle)
  })
  it('sending again restarts from sent', () => {
    const done: PhoneQuizState = { status: 'done', clipSlug: 'x', correct: 1, total: 2 }
    expect(phoneQuizReducer(done, { type: 'sent', clipSlug: 'y' })).toEqual({ status: 'sent', clipSlug: 'y' })
  })
})
