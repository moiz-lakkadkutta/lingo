import { sm2 } from '../src/lib/sm2'
describe('SM-2', () => {
  it('1 day, then 6, then × ease', () => {
    let c = { ease: 2.5, intervalD: 0, reps: 0, lapses: 0 }
    c = sm2(c, 'good'); expect(c.intervalD).toBe(1)
    c = sm2(c, 'good'); expect(c.intervalD).toBe(6)
    c = sm2(c, 'good'); expect(c.intervalD).toBe(15)
  })
  it('again lapses and lowers ease, never below 1.3', () => {
    const c = sm2({ ease: 1.4, intervalD: 20, reps: 5, lapses: 0 }, 'again')
    expect(c).toEqual({ ease: 1.3, intervalD: 1, reps: 0, lapses: 1 })
  })
  it('hard grows slowly, easy grows fast and raises ease', () => {
    expect(sm2({ ease: 2.5, intervalD: 10, reps: 3, lapses: 0 }, 'hard')).toMatchObject({ intervalD: 12, ease: 2.35 })
    expect(sm2({ ease: 2.5, intervalD: 10, reps: 3, lapses: 0 }, 'easy')).toMatchObject({ intervalD: 33, ease: 2.65 })
  })
})
