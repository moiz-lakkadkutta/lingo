import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkVtt, cuesToVtt, loadCuesVtt, NATIVE_LINT_LIMITS } from '../src/vtt'
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
  it('checkVtt with NATIVE_LINT_LIMITS accepts a 56-char line at 25 cps and flags 57 chars and 27 cps', () => {
    expect(NATIVE_LINT_LIMITS).toEqual({ cps: 26, lines: 2, lineLength: 56, minDuration: 1 })
    const ok = checkVtt(cuesToVtt([{ index: 0, startS: 0, endS: 2.24, text: 'a'.repeat(56) }], 'en'), 'en', NATIVE_LINT_LIMITS)
    expect(ok.findings).toEqual([])
    const long = checkVtt(cuesToVtt([{ index: 0, startS: 0, endS: 3, text: 'a'.repeat(57) }], 'en'), 'en', NATIVE_LINT_LIMITS)
    expect(long.findings).toEqual([{ id: 'c0', problem: 'lineLength', value: 57 }])
    const fast = checkVtt(cuesToVtt([{ index: 0, startS: 0, endS: 2, text: 'a'.repeat(27) + '\n' + 'b'.repeat(27) }], 'en'), 'en', NATIVE_LINT_LIMITS)
    expect(fast.findings).toEqual([{ id: 'c0', problem: 'cps', value: 27 }])
    // the target limits are still the default
    expect(checkVtt(cuesToVtt([{ index: 0, startS: 0, endS: 3, text: 'a'.repeat(43) }], 'de'), 'de').findings).toEqual([{ id: 'c0', problem: 'lineLength', value: 43 }])
  })
})

describe('loadCuesVtt', () => {
  it('loadCuesVtt returns cues in time order with ms timestamps, keeps a written line break and skips NOTE blocks', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lingo-vtt-'))
    try {
      const path = join(dir, 'de.vtt')
      await writeFile(path, [
        'WEBVTT', '',
        'NOTE edited by hand: c1 condensed', '',
        'c1', '00:00:04.000 --> 00:00:06.500', 'Die Kosten waren', 'nie das Problem.', '',
        'c0', '00:00:00.400 --> 00:00:02.770', '-Genau.', '-Aber was ist mit den Kosten?', '',
        'c2', '00:01:01.500 --> 00:01:03.125', 'Ein Satz auf einer Zeile, den prepare() umbricht, nicht loadCuesVtt.', '',
      ].join('\n'))
      const cues = await loadCuesVtt(path, 'de')
      expect(cues).toEqual([
        { index: 0, startS: 0.4, endS: 2.77, text: '-Genau.\n-Aber was ist mit den Kosten?' },
        { index: 1, startS: 4, endS: 6.5, text: 'Die Kosten waren\nnie das Problem.' },
        { index: 2, startS: 61.5, endS: 63.125, text: 'Ein Satz auf einer Zeile, den prepare() umbricht, nicht loadCuesVtt.' },
      ])
      await writeFile(path, 'WEBVTT\n\nNOTE nothing here\n')
      await expect(loadCuesVtt(path, 'de')).rejects.toThrow(/no cues/)
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
})

describe('cuesToVtt NOTE (BY-SA licence line, docs/content.md §5)', () => {
  const cues = [{ index: 0, startS: 0.4, endS: 2.77, text: 'Ich warte.' }]
  it('cuesToVtt puts a single-line NOTE after the header and parseVtt skips it', async () => {
    const vtt = cuesToVtt(cues, 'de', 'CC BY-SA 4.0 https://creativecommons.org/licenses/by-sa/4.0\n— ZDF Terra X Redaktion.')
    expect(vtt.startsWith('WEBVTT\n\nNOTE CC BY-SA 4.0 https://creativecommons.org/licenses/by-sa/4.0 — ZDF Terra X Redaktion.\n\nc0\n')).toBe(true)
    const { cues: parsed, findings } = checkVtt(vtt, 'de')
    expect(parsed.map((c) => c.text)).toEqual(['Ich warte.']); expect(findings).toEqual([])
    const dir = await mkdtemp(join(tmpdir(), 'lingo-vtt-note-'))
    try {
      const path = join(dir, 'de.vtt'); await writeFile(path, vtt)
      expect((await loadCuesVtt(path, 'de')).map((s) => s.text)).toEqual(['Ich warte.'])
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
  it('without a note the output is unchanged', () => {
    expect(cuesToVtt(cues, 'de', undefined)).toBe(cuesToVtt(cues, 'de'))
    expect(cuesToVtt(cues, 'de', '  ')).toBe(cuesToVtt(cues, 'de'))
  })
  it('rejects a note containing -->', () => {
    expect(() => cuesToVtt(cues, 'de', 'a --> b')).toThrow(/-->/)
  })
})
