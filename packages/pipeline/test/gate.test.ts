import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { assertGate, qualityGate } from '../src/gate'
import { MIN_GAP_S, segment, wrap2 } from '../src/segment'
import { wordsFromTranscribe } from '../src/steps/transcribe'
import { TranscribeJson } from '../src/types'
import { FIXTURES } from '../scripts/gen-fixtures'

describe('qualityGate', () => {
  it('flags cps > 20, > 2 lines, line > 42, < 1 s, > 7 s, gap < 84 ms, non-monotonic', () => {
    const findings = qualityGate([
      { index: 0, startS: 0, endS: 2, text: 'a'.repeat(42) }, // 21 cps
      { index: 1, startS: 2.05, endS: 3.2, text: 'eins\nzwei\ndrei' }, // 3 lines, gap 0.05 before it
      { index: 2, startS: 3.5, endS: 5, text: 'b'.repeat(43) }, // 43 chars → cps 28.7 too, lineLength 43
      { index: 3, startS: 5.5, endS: 6.4, text: 'Ja.' }, // 0.9 s
      { index: 4, startS: 7, endS: 14.5, text: 'lang' }, // 7.5 s
      { index: 5, startS: 6.9, endS: 8.5, text: 'zurück' }, // starts before cue 4
    ])
    expect(findings).toEqual([
      { cueIndex: 0, problem: 'cps', value: 21 },
      { cueIndex: 0, problem: 'gap', value: 0.05 },
      { cueIndex: 1, problem: 'lines', value: 3 },
      { cueIndex: 2, problem: 'cps', value: 28.667 },
      { cueIndex: 2, problem: 'lineLength', value: 43 },
      { cueIndex: 3, problem: 'tooShort', value: 0.9 },
      { cueIndex: 4, problem: 'tooLong', value: 7.5 },
      { cueIndex: 4, problem: 'gap', value: -7.6 },
      { cueIndex: 5, problem: 'order', value: 6.9 },
    ])
  })
  it('returns [] for the segmented German fixture', async () => {
    for (const lang of ['de', 'en'] as const) {
      const segs = segment(wordsFromTranscribe(TranscribeJson.parse(JSON.parse(await readFile(resolve(FIXTURES, `transcribe-60s-${lang}.json`), 'utf8'))))).map((s) => ({ ...s, text: wrap2(s.text) }))
      expect(qualityGate(segs)).toEqual([])
    }
  })
})
describe('assertGate', () => {
  it('throws with every finding listed', () => {
    expect(() => assertGate([{ index: 0, startS: 0, endS: 2, text: 'a'.repeat(42) }, { index: 1, startS: 2.5, endS: 3.2, text: 'Ja.' }])).toThrow(/cue 0 cps=21.*cue 1 tooShort=0.7/)
    expect(() => assertGate([{ index: 0, startS: 0, endS: 2, text: 'Ja.' }])).not.toThrow()
  })
})

describe('gap threshold', () => {
  it('is 0.084 s (2 frames at 23.976 fps): 83 ms is flagged, 84 ms passes', () => {
    expect(MIN_GAP_S).toBe(0.084)
    expect(qualityGate([{ index: 0, startS: 0, endS: 1, text: 'Ja.' }, { index: 1, startS: 1.083, endS: 2.2, text: 'Nein.' }])).toEqual([{ cueIndex: 0, problem: 'gap', value: 0.083 }])
    expect(qualityGate([{ index: 0, startS: 0, endS: 1, text: 'Ja.' }, { index: 1, startS: 1.084, endS: 2.2, text: 'Nein.' }])).toEqual([])
  })
})
