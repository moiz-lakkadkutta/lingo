import { estimateBatch, PRICES } from '../src/batch/estimate'
import { fsOf, manifestOf } from './helpers/batch'

describe('estimateBatch', () => {
  it('charges Transcribe only for clips without transcript.json (and not for clips with cues)', () => {
    const m = manifestOf({}, {}) // 12 × 240 s
    m.clips[1] = { ...m.clips[1]!, cues: 'cues/clip-2.de.vtt' }
    const e = estimateBatch(m, fsOf('/w/clip-1/transcript.json'), { work: '/w', phases: ['draft'] })
    expect(e.transcribe.slugs).toEqual(m.clips.slice(2).map((c) => c.slug))
    expect(e.transcribe.minutes).toBeCloseTo(40, 6)
    expect(e.transcribe.usd).toBeCloseTo(40 * PRICES.transcribePerMinute, 6)
  })
  it('multiplies Translate by natives and by phases', () => {
    const one = estimateBatch(manifestOf(), fsOf(), { work: '/w', phases: ['draft'] })
    const two = estimateBatch(manifestOf(), fsOf(), { work: '/w', phases: ['draft', 'final'] })
    const natives = estimateBatch(manifestOf({}, { rest: { natives: ['en', 'tr'] } }), fsOf(), { work: '/w', phases: ['draft'] })
    const chars = 12 * 240 * PRICES.speechCharsPerSecond
    expect(one.translate.chars).toBe(chars)
    expect(two.translate.chars).toBe(2 * chars)
    expect(natives.translate.chars).toBe(chars + 11 * 240 * PRICES.speechCharsPerSecond)
    expect(two.translate.usd).toBeCloseTo((2 * chars * PRICES.translatePerMillionChars) / 1e6, 6)
  })
  it('charges Bedrock only in the final phase and sums a total', () => {
    expect(estimateBatch(manifestOf(), fsOf(), { work: '/w', phases: ['draft'] }).bedrock.usd).toBe(0)
    const e = estimateBatch(manifestOf(), fsOf(), { work: '/w', phases: ['draft', 'final'] })
    expect(e.bedrock.usd).toBeCloseTo(12 * PRICES.bedrockPerClipUpperBound, 6)
    expect(e.totalUsd).toBeCloseTo(e.transcribe.usd + e.translate.usd + e.bedrock.usd, 9)
  })
  it('matches the plan for the committed 12 rows (58.9 new Transcribe min when rows 3 and 7 are reused)', () => {
    // docs/plans/LING-008.md §2.11: 4 217 s total; rows 3 (transcript on the human's machine) and 7 (--cues) do not transcribe.
    const durations = [360, 420, 226, 434, 289, 259, 459, 360, 420, 330, 270, 390]
    const m = manifestOf()
    m.clips = m.clips.map((c, i) => ({ ...c, expectedDurationS: durations[i]! }))
    m.clips[6] = { ...m.clips[6]!, cues: 'cues/x.en.vtt' }
    const e = estimateBatch(m, fsOf('/w/clip-3/transcript.json'), { work: '/w', phases: ['draft', 'final'] })
    expect(e.transcribe.slugs.length).toBe(10)
    expect(e.transcribe.minutes.toFixed(1)).toBe('58.9')
    expect(e.transcribe.usd.toFixed(2)).toBe('1.41')
    expect(e.translate.usd.toFixed(2)).toBe('1.90')
    // Bedrock at the Nova Pro v1 default (decision 0009): 12 × $0.05 = $0.60; was $3.4 at the Nova Lite bound.
    expect(e.bedrock.usd.toFixed(2)).toBe('0.60')
    expect(e.totalUsd.toFixed(1)).toBe('3.9')
  })
})
