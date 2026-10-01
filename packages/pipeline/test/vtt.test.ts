import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { checkVtt, cuesToVtt } from '../src/vtt'
import { segment, wrap2 } from '../src/segment'
import { wordsFromTranscribe } from '../src/steps/transcribe'
import { TranscribeJson } from '../src/types'
import { FIXTURES } from '../scripts/gen-fixtures'

const fixtureSegs = async (lang: 'de' | 'en') => segment(wordsFromTranscribe(TranscribeJson.parse(JSON.parse(await readFile(resolve(FIXTURES, `transcribe-60s-${lang}.json`), 'utf8'))))).map((s) => ({ ...s, text: wrap2(s.text) }))

describe('cuesToVtt', () => {
  it('serialises ids c0…, HH:MM:SS.mmm timestamps and two-line text', () => {
    const vtt = cuesToVtt([{ index: 0, startS: 0.4, endS: 2.77, text: 'Ich warte.' }, { index: 1, startS: 61.5, endS: 3725.125, text: 'Erste Zeile\nzweite Zeile' }], 'de')
    expect(vtt).toBe('WEBVTT\n\nc0\n00:00:00.400 --> 00:00:02.770\nIch warte.\n\nc1\n00:01:01.500 --> 01:02:05.125\nErste Zeile\nzweite Zeile\n')
  })
})
describe('checkVtt', () => {
  it("round-trips through the kit's parseVtt with identical id, start, end, text", async () => {
    for (const lang of ['de', 'en'] as const) {
      const segs = await fixtureSegs(lang)
      const { cues } = checkVtt(cuesToVtt(segs, lang), lang)
      // the kit's parseTimestamp computes sec + ms/1000 (float noise: 2.97 → 2.9699999999999998), so compare at the VTT's own precision (ms)
      const ms = (n: number) => Math.round(n * 1000)
      expect(cues.map((c) => ({ id: c.id, start: ms(c.start), end: ms(c.end), text: c.text }))).toEqual(segs.map((s) => ({ id: `c${s.index}`, start: ms(s.startS), end: ms(s.endS), text: s.text })))
      for (const [i, c] of cues.entries()) { expect(Math.abs(c.start - segs[i]!.startS)).toBeLessThan(1e-9); expect(Math.abs(c.end - segs[i]!.endS)).toBeLessThan(1e-9) }
      expect(cues.every((c) => c.trackId === lang)).toBe(true)
    }
  })
  it('reports a finding for a 21 cps cue and none for the fixture cues', async () => {
    const fast = checkVtt(cuesToVtt([{ index: 0, startS: 0, endS: 2, text: 'a'.repeat(42) }], 'de'), 'de')
    expect(fast.findings).toEqual([{ id: 'c0', problem: 'cps', value: 21 }])
    const short = checkVtt(cuesToVtt([{ index: 0, startS: 0, endS: 0.9, text: 'Ja.' }], 'de'), 'de')
    expect(short.findings.map((f) => f.problem)).toEqual(['duration'])
    for (const lang of ['de', 'en'] as const) expect(checkVtt(cuesToVtt(await fixtureSegs(lang), lang), lang).findings).toEqual([])
  })
})
