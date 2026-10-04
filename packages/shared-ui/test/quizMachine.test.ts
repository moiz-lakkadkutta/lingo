import { AUTO_ADVANCE_MS, initialQuiz, optionState, quizReduce, type QuizState } from '../src/screens/quiz/machine'
import { quizItem } from './fixtures'

const items = [quizItem('a', { answer: 1 }), quizItem('b', { answer: 2 })]
const run = (s: QuizState, ...es: Parameters<typeof quizReduce>[1][]) => es.reduce<[QuizState, ReturnType<typeof quizReduce>[1]]>(([st], e) => quizReduce(st, e, items), [s, []])

describe('quiz machine', () => {
  it('a correct pick counts, shows the answer and schedules a 600 ms advance', () => {
    const [s, fx] = quizReduce(initialQuiz(), { type: 'pick', k: 1 }, items)
    expect(s).toMatchObject({ phase: 'correct', picked: 1, correct: 1, i: 0 })
    expect(fx).toEqual([{ kind: 'autoAdvance', ms: AUTO_ADVANCE_MS }])
    expect(AUTO_ADVANCE_MS).toBe(600)
  })
  it('an incorrect pick reveals the answer and waits for continue', () => {
    const [s, fx] = quizReduce(initialQuiz(), { type: 'pick', k: 3 }, items)
    expect(s).toMatchObject({ phase: 'revealed', picked: 3, correct: 0 })
    expect(fx).toEqual([])
    const [n] = quizReduce(s, { type: 'continue' }, items)
    expect(n).toMatchObject({ i: 1, phase: 'answering', picked: null })
  })
  it('picks after the first are ignored', () => {
    const [s] = quizReduce(initialQuiz(), { type: 'pick', k: 3 }, items)
    const [s2, fx] = quizReduce(s, { type: 'pick', k: 1 }, items)
    expect(s2).toBe(s)
    expect(fx).toEqual([])
    const [c] = quizReduce(initialQuiz(), { type: 'pick', k: 1 }, items)
    expect(quizReduce(c, { type: 'pick', k: 0 }, items)[0]).toBe(c)
  })
  it('advance only works after a correct pick; continue only after a reveal', () => {
    const s0 = initialQuiz()
    expect(quizReduce(s0, { type: 'advance' }, items)[0]).toBe(s0)
    expect(quizReduce(s0, { type: 'continue' }, items)[0]).toBe(s0)
    const [rev] = quizReduce(s0, { type: 'pick', k: 0 }, items)
    expect(quizReduce(rev, { type: 'advance' }, items)[0]).toBe(rev)
    const [cor] = quizReduce(s0, { type: 'pick', k: 1 }, items)
    expect(quizReduce(cor, { type: 'continue' }, items)[0]).toBe(cor)
    expect(quizReduce(cor, { type: 'advance' }, items)[0]).toMatchObject({ i: 1, phase: 'answering' })
  })
  it('the last item finishes once with the totals', () => {
    const [s, fx] = run(initialQuiz(), { type: 'pick', k: 1 }, { type: 'advance' }, { type: 'pick', k: 0 }, { type: 'continue' })
    expect(s).toMatchObject({ phase: 'done', correct: 1 })
    expect(fx).toEqual([{ kind: 'finish', correct: 1, total: 2 }])
    expect(quizReduce(s, { type: 'continue' }, items)).toEqual([s, []])
    expect(quizReduce(s, { type: 'advance' }, items)).toEqual([s, []])
  })
  it('replay bumps replayKey and replayEnd clears replaying', () => {
    const [s] = quizReduce(initialQuiz(), { type: 'replay' }, items)
    expect(s).toMatchObject({ replaying: true, replayKey: 1 })
    const [s2] = quizReduce(s, { type: 'replay' }, items)
    expect(s2.replayKey).toBe(2)
    expect(quizReduce(s2, { type: 'replayEnd' }, items)[0].replaying).toBe(false)
    const [next] = run(s2, { type: 'pick', k: 1 }, { type: 'advance' })
    expect(next.replaying).toBe(false)
    const [done] = run(initialQuiz(), { type: 'pick', k: 1 }, { type: 'advance' }, { type: 'pick', k: 2 }, { type: 'advance' })
    expect(quizReduce(done, { type: 'replay' }, items)[0]).toBe(done)
  })
  it('optionState marks the right answer and the picked one', () => {
    const item = items[0]!
    expect([0, 1, 2, 3].map((k) => optionState(initialQuiz(), item, k))).toEqual(['idle', 'idle', 'idle', 'idle'])
    const [rev] = quizReduce(initialQuiz(), { type: 'pick', k: 3 }, items)
    expect([0, 1, 2, 3].map((k) => optionState(rev, item, k))).toEqual(['idle', 'correct', 'idle', 'picked'])
    const [cor] = quizReduce(initialQuiz(), { type: 'pick', k: 1 }, items)
    expect([0, 1, 2, 3].map((k) => optionState(cor, item, k))).toEqual(['idle', 'correct', 'idle', 'idle'])
  })
})
