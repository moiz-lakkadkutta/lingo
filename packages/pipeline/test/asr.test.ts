import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { alignConfidence, asrSuspectReasons, asrSuspects, confidenceItems, levenshtein, MIN_HIGHLIGHT_CONFIDENCE } from '../src/asr'
import { prepare } from '../src/prepare'
import { fixtureDeps } from '../src/fixtureDeps'
import { TranscribeJson } from '../src/types'

const item = (content: string, start: number, conf: string, type: 'pronunciation' | 'punctuation' = 'pronunciation') =>
  type === 'punctuation' ? { type, alternatives: [{ content, confidence: '0.0' }] } : { type, start_time: start.toFixed(2), end_time: (start + 0.3).toFixed(2), alternatives: [{ content, confidence: conf }] }

describe('asr', () => {
  const t = TranscribeJson.parse({ results: { transcripts: [{ transcript: '' }], items: [
    item('Help', 0.1, '0.99'), item('with', 0.5, '0.98'), item('the', 0.9, '0.97'), item('scavenger', 1.3, '0.95'), item('sal', 1.8, '0.158'), item('.', 0, '', 'punctuation'),
    item('Old-timer', 5.1, '0.519'), item('indeed', 5.5, '0.9'),
  ] } })

  it('confidenceItems keeps pronunciation items only, stripped and lowercased, with numeric confidence', () => {
    const items = confidenceItems(t)
    expect(items.map((i) => i.text)).toEqual(['help', 'with', 'the', 'scavenger', 'sal', 'old-timer', 'indeed'])
    expect(items[4]).toMatchObject({ text: 'sal', conf: 0.158 })
    expect(MIN_HIGHLIGHT_CONFIDENCE).toBe(0.4)
  })

  it('alignConfidence gives each cue token the confidence of the Transcribe word with the same text inside the cue time span', () => {
    const cues = [{ index: 0, startS: 0.1, endS: 2.1 }, { index: 1, startS: 5.0, endS: 6.0 }]
    const raw = [
      { word: 'Help', sentenceInitial: true, cueIndex: 0 }, { word: 'with', sentenceInitial: false, cueIndex: 0 }, { word: 'the', sentenceInitial: false, cueIndex: 0 },
      { word: 'scavenger', sentenceInitial: false, cueIndex: 0 }, { word: 'sal', sentenceInitial: false, cueIndex: 0 },
      { word: 'Old-timer', sentenceInitial: true, cueIndex: 1 }, { word: 'indeed', sentenceInitial: false, cueIndex: 1 },
    ]
    expect(alignConfidence(raw, cues, confidenceItems(t))).toEqual([0.99, 0.98, 0.97, 0.95, 0.158, 0.519, 0.9])
  })

  it('alignConfidence leaves a token undefined when no Transcribe word matches (corrected VTT text)', () => {
    const cues = [{ index: 0, startS: 0.1, endS: 2.1 }, { index: 1, startS: 5.0, endS: 6.0 }]
    const raw = [
      { word: 'Help', sentenceInitial: true, cueIndex: 0 }, { word: 'the', sentenceInitial: false, cueIndex: 0 }, { word: 'scavenger', sentenceInitial: false, cueIndex: 0 },
      { word: 'sale', sentenceInitial: false, cueIndex: 0 }, // corrected by a human: no Transcribe word "sale"
      { word: 'indeed', sentenceInitial: true, cueIndex: 1 }, { word: 'Help', sentenceInitial: false, cueIndex: 1 }, // "help" is outside cue 1's span
    ]
    expect(alignConfidence(raw, cues, confidenceItems(t))).toEqual([0.99, 0.97, 0.95, undefined, 0.9, undefined])
  })

  const rank = (l: string) => ({ sale: 2121, sal: 4972, sail: 3000, scavenger: 10858, the: 3, a: 4, boat: 900 } as Record<string, number>)[l]
  const cue = (index: number, words: string) => ({ index, tokens: words.split(' ').map((w) => ({ word: w, lemma: w.toLowerCase() })) })

  it('asrSuspects flags a one-off lemma at edit distance 1 from a more frequent clip lemma after the same word (scavenger sal / scavenger sale)', () => {
    const cues = [cue(12, 'that scavenger sale'), cue(30, 'the sale'), cue(42, 'the scavenger sal')]
    expect([...asrSuspects(cues, rank)]).toEqual(['42|sal'])
    expect(asrSuspectReasons(cues, rank).get('42|sal')).toBe('one-off near-spelling of "sale" after "scavenger"')
    expect(levenshtein('sal', 'sale')).toBe(1)
    expect(levenshtein('kitten', 'sitting')).toBe(3)
  })

  it('asrSuspects does not flag a real one-off word without a near-spelled twin, nor a twin after a different word', () => {
    expect(asrSuspects([cue(0, 'a boat'), cue(1, 'the sale'), cue(2, 'the sale')], rank).size).toBe(0)
    // sail once after "a", sale twice but never after "a"
    expect(asrSuspects([cue(0, 'a sail'), cue(1, 'the sale'), cue(2, 'the sale')], rank).size).toBe(0)
    // the twin must be more frequent than the one-off in the frequency list (lower rank)
    expect(asrSuspects([cue(0, 'the sal'), cue(1, 'the sale'), cue(2, 'the sale')], (l) => (l === 'sal' ? 100 : rank(l))).size).toBe(0)
  })

  describe('prepare', () => {
    let root: string
    beforeAll(async () => { root = await mkdtemp(join(tmpdir(), 'lingo-asr-')) })
    afterAll(async () => { await rm(root, { recursive: true, force: true }) })

    it('prepare writes an asr warning for every skipped highlight and asr confidences into clip.json tokens', async () => {
      const deps = fixtureDeps('de')
      const plain = await prepare({ slug: 'asr-plain', source: 's3://unused', lang: 'de', natives: ['en'], workRoot: root, publish: false, ai: false }, deps)
      const target = plain.clip.highlights[0]!
      expect(plain.clip.cues.flatMap((c) => c.tokens).every((tk) => typeof tk.asr === 'number')).toBe(true)
      // lower the confidence of the first highlight's Transcribe word
      const base = await deps.transcribe('', 'de', 'job')
      const low = { ...base, results: { ...base.results, items: base.results.items.map((i) => (i.type === 'pronunciation' && i.alternatives[0]!.content.replace(/[^\p{L}'’-]/gu, '') === target.word ? { ...i, alternatives: [{ ...i.alternatives[0]!, confidence: '0.2' }] } : i)) } }
      const r = await prepare({ slug: 'asr-low', source: 's3://unused', lang: 'de', natives: ['en'], workRoot: root, publish: false, ai: false }, { ...deps, transcribe: async () => low })
      expect(r.clip.highlights.some((h) => h.cueIndex === target.cueIndex && h.word === target.word)).toBe(false)
      expect(r.clip.warnings).toContain(`asr: skipped highlight "${target.word}" (cue ${target.cueIndex}): confidence 0.20`)
      const tok = r.clip.cues[target.cueIndex]!.tokens.find((tk) => tk.word === target.word)!
      expect(tok.asr).toBe(0.2)
      // the level is unchanged: the token still counts
      expect(r.clip.level).toBe(plain.clip.level)
    })

    it('voa01: piqued (0.075) is never a highlight', async () => {
      const r = await prepare({ slug: 'voa01', source: 's3://unused', lang: 'en', natives: ['de'], workRoot: root, publish: false, ai: false }, fixtureDeps('en', { transcript: 'real/voa01' }))
      expect(r.clip.highlights.map((h) => h.lemma)).not.toContain('pique')
      expect(r.clip.highlights.map((h) => h.word.toLowerCase())).not.toContain('piqued')
      const piqued = r.clip.cues.flatMap((c) => c.tokens).find((tk) => tk.word.toLowerCase() === 'piqued')
      expect(piqued?.asr).toBeLessThan(MIN_HIGHLIGHT_CONFIDENCE)
    })
  })
})
