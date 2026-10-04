import { DEFAULT_LEVEL, PLACEMENT, SCORE, placeLevel, type Answer } from '../src/screens/firstRun/placement'

const all = (a: Answer): Answer[] => Array(6).fill(a)
describe('placement', () => {
  it('each language has six items in the order A1, A2, A2, B1, B1, B2', () => {
    for (const lang of ['de', 'en'] as const) expect(PLACEMENT[lang].map((i) => i.level)).toEqual(['A1', 'A2', 'A2', 'B1', 'B1', 'B2'])
    expect(PLACEMENT.de[0]!.text).toBe('Ich trinke morgens gern Kaffee.')
    expect(PLACEMENT.en[5]!.text).toBe('The negotiations broke down\nwithout reaching an agreement.')
    expect(DEFAULT_LEVEL).toBe('A2')
    expect(SCORE).toEqual({ yes: 1, mostly: 0.5, no: 0 })
  })
  it('every line is at most two lines of 42 characters', () => {
    for (const lang of ['de', 'en'] as const) for (const i of PLACEMENT[lang]) {
      const lines = i.text.split('\n')
      expect(lines.length).toBeLessThanOrEqual(2)
      for (const l of lines) expect(l.length).toBeLessThanOrEqual(42)
    }
  })
  it('all yes places B2 and all no places A1', () => {
    expect(placeLevel(PLACEMENT.de, all('yes'))).toBe('B2')
    expect(placeLevel(PLACEMENT.de, all('no'))).toBe('A1')
  })
  it('a band passes at a mean of 0.75 and placement stops at the first band that does not pass', () => {
    // A1 yes; A2 yes+mostly = 0.75 passes; B1 mostly+mostly = 0.5 fails; B2 yes is never reached
    expect(placeLevel(PLACEMENT.en, ['yes', 'yes', 'mostly', 'mostly', 'mostly', 'yes'])).toBe('A2')
    expect(placeLevel(PLACEMENT.en, ['yes', 'mostly', 'mostly', 'yes', 'yes', 'yes'])).toBe('A1')
    expect(placeLevel(PLACEMENT.en, ['yes', 'yes', 'yes', 'yes', 'mostly', 'no'])).toBe('B1')
    expect(() => placeLevel(PLACEMENT.en, ['yes'])).toThrow()
  })
  it('mostly on A1 alone places A1', () => {
    expect(placeLevel(PLACEMENT.de, ['mostly', 'yes', 'yes', 'yes', 'yes', 'yes'])).toBe('A1')
  })
})
