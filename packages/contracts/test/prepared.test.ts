import { PreparedClip, PreparedCue } from '../src/index'

const cue = { index: 0, startMs: 400, endMs: 2400, text: 'Ich warte seit zwei Stunden auf dich.', native: { en: 'I HAVE BEEN WAITING FOR TWO HOURS.' }, tokens: [{ word: 'Ich', lemma: 'ich', rank: 1, name: false, sentenceInitial: true }] }
const clip = {
  version: 1 as const, slug: 'demo-de', sourceLang: 'de' as const, natives: ['en'], level: 'A1' as const, coverageRank: 900, durationS: 66.2,
  cues: [cue], highlights: [{ cueIndex: 0, word: 'warte', lemma: 'warten', rank: 1500, gloss: 'wait', grammar: 'verb', example: 'Ich warte.' }], quiz: [],
  tracks: { manifest: 'master.m3u8', vtt: { de: 'vtt/de.vtt', en: 'vtt/en.vtt' } }, publishedBase: null,
  source: { uri: 's3://bucket/demo-de.mp4', transcribeJob: null }, generated: { at: '2026-09-15T12:00:00.000Z', pipeline: 'lingo-pipeline@0.1.0', lemmatizer: 'table' }, warnings: [],
}

describe('PreparedClip', () => {
  it('accepts a minimal valid clip and rejects a cue with endMs ≤ startMs (refine) and a non-slug', () => {
    expect(PreparedClip.parse(clip)).toEqual(clip)
    expect(PreparedCue.safeParse({ ...cue, endMs: 400 }).success).toBe(false)
    expect(PreparedCue.safeParse({ ...cue, endMs: 300 }).success).toBe(false)
    expect(PreparedClip.safeParse({ ...clip, slug: 'Demo DE' }).success).toBe(false)
    expect(PreparedClip.safeParse({ ...clip, cues: [{ ...cue, endMs: 400 }] }).success).toBe(false)
  })
  it('accepts an optional asr confidence in 0–1 on a token, and a token without it (older clip.json files)', () => {
    const tok = cue.tokens[0]!
    expect(PreparedCue.parse({ ...cue, tokens: [{ ...tok, asr: 0.158 }] }).tokens[0]!.asr).toBe(0.158)
    expect(PreparedCue.parse(cue).tokens[0]!.asr).toBeUndefined()
    expect(PreparedCue.safeParse({ ...cue, tokens: [{ ...tok, asr: 1.5 }] }).success).toBe(false)
  })
  it('accepts the optional cost block LING-002 fills', () => {
    expect(PreparedClip.parse({ ...clip, cost: { calls: 3, cachedCalls: 1, inputTokens: 1200, outputTokens: 300, usd: 0.002 } }).cost?.calls).toBe(3)
    expect(PreparedClip.safeParse({ ...clip, cost: { calls: 'x' } }).success).toBe(false)
  })
  it('keeps optional generated.timings (ms per prepare step) and rejects negative or non-numeric values', () => {
    const timings = { media: 1200, transcribe: 45000, translate: 800 }
    expect(PreparedClip.parse({ ...clip, generated: { ...clip.generated, timings } }).generated.timings).toEqual(timings)
    expect(PreparedClip.parse(clip).generated.timings).toBeUndefined()
    expect(PreparedClip.safeParse({ ...clip, generated: { ...clip.generated, timings: { media: -1 } } }).success).toBe(false)
    expect(PreparedClip.safeParse({ ...clip, generated: { ...clip.generated, timings: { media: 'fast' } } }).success).toBe(false)
  })
  it('accepts a clip prepared without AI: highlights without gloss/grammar/example, no quiz, generated.ai false', () => {
    const { quiz: _quiz, ...noQuiz } = clip
    const noAi = { ...noQuiz, highlights: [{ cueIndex: 0, word: 'warte', lemma: 'warten', rank: 1500 }], generated: { ...clip.generated, ai: false } }
    const parsed = PreparedClip.parse(noAi)
    expect(parsed.quiz).toBeUndefined()
    expect(parsed.highlights[0]!.gloss).toBeUndefined()
    expect(parsed.generated.ai).toBe(false)
    expect(PreparedClip.safeParse({ ...noAi, generated: { ...clip.generated, ai: 'no' } }).success).toBe(false)
    expect(PreparedClip.safeParse({ ...noAi, highlights: [{ cueIndex: 0, word: 'warte', lemma: 'warten', rank: 1500, gloss: 3 }] }).success).toBe(false)
  })
})
