import { alignNative } from '../src/steps/translate'

describe('alignNative (docs/decisions/0007 M4)', () => {
  it('translates a two-speaker cue line by line and keeps the hyphens', async () => {
    const translate = vi.fn(async (t: string) => `[${t}]`)
    const out = await alignNative([{ index: 0, startS: 0, endS: 2, text: '-Genau.\n-Aber was?' }], 'de', ['en'], translate)
    expect(translate.mock.calls.map((c) => c[0])).toEqual(['Genau.', 'Aber was?'])
    expect(translate).toHaveBeenCalledWith('Genau.', 'de', 'en')
    expect(out[0]!.en).toBe('-[Genau.]\n-[Aber was?]')
  })
  it('wraps a long single-line translation into two lines of ≤ 56', async () => {
    const long = 'This translation runs a good deal longer than the German line it came from, about a hundred chars.'
    expect(long.length).toBeGreaterThan(84)
    expect(long.length).toBeLessThanOrEqual(112)
    const translate = vi.fn(async () => long)
    const out = await alignNative([{ index: 0, startS: 0, endS: 5, text: 'Ein Satz,\nder umbrochen ist.' }], 'de', ['en', 'de'], translate)
    expect(translate).toHaveBeenCalledTimes(1)
    expect(translate).toHaveBeenCalledWith('Ein Satz, der umbrochen ist.', 'de', 'en')
    const lines = out[0]!.en!.split('\n')
    expect(lines.length).toBe(2)
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(56)
    expect(lines.join(' ')).toBe(long)
    expect(out[0]!.de).toBeUndefined()
  })
})
