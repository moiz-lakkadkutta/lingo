import { fnv1a, seededShuffle } from '../src/ai/seed'

describe('seed', () => {
  it('seededShuffle is a permutation, deterministic for a seed, and differs between seeds; fnv1a matches known vectors ("" → 0x811c9dc5, "a" → 0xe40c292c)', () => {
    expect(fnv1a('')).toBe(0x811c9dc5)
    expect(fnv1a('a')).toBe(0xe40c292c)
    expect(fnv1a('foobar')).toBe(0xbf9cf968)
    const arr = Array.from({ length: 10 }, (_, i) => i)
    const frozen = Object.freeze([...arr])
    const a = seededShuffle(frozen, 42)
    expect([...a].sort((x, y) => x - y)).toEqual(arr)
    expect(frozen).toEqual(arr)
    expect(seededShuffle(frozen, 42)).toEqual(a)
    expect(seededShuffle(frozen, 43)).not.toEqual(a)
    expect(seededShuffle([], 1)).toEqual([])
    expect(seededShuffle(['x'], 1)).toEqual(['x'])
  })
})
