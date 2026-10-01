import { canPop, initialNav, navReduce, routeKey, top } from '../src/nav/stack'

describe('nav stack', () => {
  it('initialNav starts at home', () => {
    expect(initialNav()).toEqual({ stack: [{ name: 'home' }] })
    expect(initialNav({ name: 'firstRun' }).stack).toEqual([{ name: 'firstRun' }])
  })
  it('push adds a route and pop returns to the previous one', () => {
    const a = navReduce(initialNav(), { type: 'push', route: { name: 'clip', slug: 'x' } })
    expect(top(a)).toEqual({ name: 'clip', slug: 'x' })
    expect(canPop(a)).toBe(true)
    const b = navReduce(a, { type: 'pop' })
    expect(top(b)).toEqual({ name: 'home' })
  })
  it('pop on a single route is a no-op and canPop is false', () => {
    const s = initialNav()
    expect(canPop(s)).toBe(false)
    expect(navReduce(s, { type: 'pop' }).stack).toEqual(s.stack)
  })
  it('replace swaps the top route and keeps the rest', () => {
    const s = navReduce(navReduce(initialNav(), { type: 'push', route: { name: 'clip', slug: 'x' } }), { type: 'push', route: { name: 'player', slug: 'x', challenge: false } })
    const r = navReduce(s, { type: 'replace', route: { name: 'summary', slug: 'x' } })
    expect(r.stack).toEqual([{ name: 'home' }, { name: 'clip', slug: 'x' }, { name: 'summary', slug: 'x' }])
    expect(s.stack).toHaveLength(3) // pure
  })
  it('reset leaves exactly one route', () => {
    const s = navReduce(initialNav(), { type: 'push', route: { name: 'settings' } })
    expect(navReduce(s, { type: 'reset', route: { name: 'firstRun' } }).stack).toEqual([{ name: 'firstRun' }])
  })
  it('pushing the route already on top changes nothing', () => {
    const s = navReduce(initialNav(), { type: 'push', route: { name: 'words', filter: 'all' } })
    expect(navReduce(s, { type: 'push', route: { name: 'words', filter: 'due' } })).toBe(s)
    expect(navReduce(s, { type: 'push', route: { name: 'settings' } }).stack).toHaveLength(3)
  })
  it('routeKey is stable per screen and slug and ignores the words filter', () => {
    expect(routeKey({ name: 'home' })).toBe('home')
    expect(routeKey({ name: 'clip', slug: 'a' })).toBe('clip:a')
    expect(routeKey({ name: 'player', slug: 'a', challenge: true })).toBe('player:a')
    expect(routeKey({ name: 'summary', slug: 'a' })).toBe('summary:a')
    expect(routeKey({ name: 'quiz', slug: 'a' })).toBe('quiz:a')
    expect(routeKey({ name: 'words', filter: 'due' })).toBe(routeKey({ name: 'words', filter: 'learned' }))
    expect(routeKey({ name: 'words', filter: 'all' })).toBe('words')
    for (const n of ['settings', 'pair', 'about', 'plus', 'firstRun'] as const) expect(routeKey({ name: n })).toBe(n)
  })
})
