import { firstRunReduce, initialFirstRun, type FirstRunState } from '../src/screens/firstRun/machine'
import { learner } from './fixtures'

const at = (o: Partial<FirstRunState>): FirstRunState => ({ panel: 'learning', learning: 'de', native: 'en', answers: [], level: null, ...o })
describe('first-run machine', () => {
  it('starts on learning with the learner values and native different from learning', () => {
    expect(initialFirstRun(learner({ learning: 'de', native: 'tr' }))).toEqual(at({ native: 'tr' }))
    expect(initialFirstRun(learner({ learning: 'en', native: 'en' }))).toEqual(at({ learning: 'en', native: 'de' }))
  })
  it('choosing a language moves to speak and keeps native different', () => {
    expect(firstRunReduce(at({}), { type: 'learning', lang: 'en' })).toEqual([at({ panel: 'speak', learning: 'en', native: 'de' }), []])
    expect(firstRunReduce(at({ native: 'tr' }), { type: 'learning', lang: 'en' })[0]).toMatchObject({ learning: 'en', native: 'tr' })
  })
  it('choosing what I speak saves the profile and starts placement', () => {
    expect(firstRunReduce(at({ panel: 'speak', answers: ['yes'] }), { type: 'speak', code: 'uk' })).toEqual([at({ panel: 'placement', native: 'uk' }), [{ kind: 'profile', learning: 'de', native: 'uk' }]])
  })
  it('the sixth answer places the level, saves it and moves to pair', () => {
    let s = at({ panel: 'placement' })
    for (let i = 0; i < 5; i++) {
      const [n, fx] = firstRunReduce(s, { type: 'answer', a: 'yes' })
      expect(fx).toEqual([]); expect(n.panel).toBe('placement'); s = n
    }
    const [done, fx] = firstRunReduce(s, { type: 'answer', a: 'no' })
    expect(done).toMatchObject({ panel: 'pair', level: 'B1' })
    expect(fx).toEqual([{ kind: 'level', level: 'B1' }])
  })
  it('skip saves A2 and moves to pair', () => {
    expect(firstRunReduce(at({ panel: 'placement', answers: ['yes'] }), { type: 'skip' })).toEqual([at({ panel: 'pair', answers: ['yes'], level: 'A2' }), [{ kind: 'level', level: 'A2' }]])
  })
  it('back walks one panel back and clears answers; back on the first panel is unhandled', () => {
    expect(firstRunReduce(at({}), { type: 'back' })).toEqual([at({}), [{ kind: 'unhandledBack' }]])
    expect(firstRunReduce(at({ panel: 'speak' }), { type: 'back' })[0].panel).toBe('learning')
    expect(firstRunReduce(at({ panel: 'placement', answers: ['yes'] }), { type: 'back' })[0]).toMatchObject({ panel: 'speak', answers: [] })
    expect(firstRunReduce(at({ panel: 'pair', answers: ['yes'], level: 'B1' }), { type: 'back' })[0]).toMatchObject({ panel: 'placement', answers: [], level: null })
  })
  it('finish on pair emits done', () => {
    const s = at({ panel: 'pair', level: 'A2' })
    expect(firstRunReduce(s, { type: 'finish' })).toEqual([s, [{ kind: 'done' }]])
    const l = at({})
    expect(firstRunReduce(l, { type: 'finish' })).toEqual([l, []])
    expect(firstRunReduce(l, { type: 'answer', a: 'yes' })).toEqual([l, []])
  })
})
