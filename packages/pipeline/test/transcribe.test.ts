import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { TranscribeJson } from '../src/types'
import { transcribeJobName, transcribeWithAws, wordsFromTranscribe } from '../src/steps/transcribe'
import { FIXTURES, stringify, transcribeFixtureFromDialogue } from '../scripts/gen-fixtures'

const read = (f: string) => readFile(resolve(FIXTURES, f), 'utf8')
const fixture = async (lang: 'de' | 'en') => TranscribeJson.parse(JSON.parse(await read(`transcribe-60s-${lang}.json`)))

/** Trimmed from https://docs.aws.amazon.com/transcribe/latest/dg/how-input.html#how-it-works-output */
const AWS_DOC_EXAMPLE = {
  jobName: 'my-first-transcription-job', accountId: '111122223333', status: 'COMPLETED',
  results: {
    transcripts: [{ transcript: 'Welcome to Amazon Transcribe.' }],
    items: [
      { id: 0, type: 'pronunciation', alternatives: [{ confidence: '0.998', content: 'Welcome' }], start_time: '0.0', end_time: '0.42', speaker_label: 'spk_0' },
      { id: 1, type: 'pronunciation', alternatives: [{ confidence: '0.999', content: 'to' }], start_time: '0.42', end_time: '0.54' },
      { id: 2, type: 'pronunciation', alternatives: [{ confidence: '1.0', content: 'Amazon' }], start_time: '0.54', end_time: '1.1' },
      { id: 3, type: 'pronunciation', alternatives: [{ confidence: '0.989', content: 'Transcribe' }], start_time: '1.1', end_time: '1.71' },
      { id: 4, type: 'punctuation', alternatives: [{ confidence: '0.0', content: '.' }] },
    ],
    speaker_labels: { segments: [], channel_label: 'ch_0' },
    audio_segments: [{ id: 0, transcript: 'Welcome to Amazon Transcribe.', start_time: '0.0', end_time: '1.71', items: [0, 1, 2, 3, 4] }],
  },
}

describe('TranscribeJson', () => {
  it('accepts both fixtures and the AWS doc example', async () => {
    expect((await fixture('de')).results.items.length).toBeGreaterThan(100)
    expect((await fixture('en')).results.items.length).toBeGreaterThan(100)
    const doc = TranscribeJson.parse(AWS_DOC_EXAMPLE)
    expect(doc.results.transcripts[0]!.transcript).toBe('Welcome to Amazon Transcribe.')
    expect((doc.results as Record<string, unknown>).audio_segments).toBeDefined()
  })
})

describe('wordsFromTranscribe', () => {
  it('attaches punctuation items to the preceding word', () => {
    const words = wordsFromTranscribe(TranscribeJson.parse(AWS_DOC_EXAMPLE))
    expect(words.map((w) => w.text)).toEqual(['Welcome', 'to', 'Amazon', 'Transcribe.'])
    const leading = TranscribeJson.parse({ results: { transcripts: [{ transcript: '' }], items: [{ type: 'punctuation', alternatives: [{ content: '.' }] }, { type: 'pronunciation', start_time: '0.1', end_time: '0.3', alternatives: [{ content: 'Ja' }] }] } })
    expect(wordsFromTranscribe(leading).map((w) => w.text)).toEqual(['Ja'])
  })
  it('parses start/end as numbers and keeps speaker labels', () => {
    const words = wordsFromTranscribe(TranscribeJson.parse(AWS_DOC_EXAMPLE))
    expect(words[0]).toEqual({ start: 0, end: 0.42, text: 'Welcome', speaker: 'spk_0' })
    expect(words[1]).toEqual({ start: 0.42, end: 0.54, text: 'to' })
    expect(typeof words[3]!.end).toBe('number')
  })
})

describe('transcribeJobName', () => {
  it('matches ^[0-9a-zA-Z._-]+$ and embeds the slug', () => {
    const name = transcribeJobName('demo-de', new Date('2026-09-15T12:34:56Z'))
    expect(name).toBe('demo-de-20260915-123456')
    expect(name).toMatch(/^[0-9a-zA-Z._-]+$/)
    expect(transcribeJobName('weird slug/ü', new Date('2026-09-15T12:34:56Z'))).toMatch(/^[0-9a-zA-Z._-]+$/)
  })
})

describe('fixtures', () => {
  it('regenerating from dialogue-*.txt reproduces the committed transcribe JSON byte for byte', async () => {
    for (const lang of ['de', 'en'] as const) {
      const regenerated = stringify(transcribeFixtureFromDialogue(await read(`dialogue-${lang}.txt`), lang))
      expect(regenerated).toBe(await read(`transcribe-60s-${lang}.json`))
    }
  })
  it('German fixture is 55–75 s, 120–170 words, contains Berlin, a digit token and a fast run', async () => {
    const t = await fixture('de')
    const words = wordsFromTranscribe(t)
    const total = words.at(-1)!.end
    expect(total).toBeGreaterThanOrEqual(55); expect(total).toBeLessThanOrEqual(75)
    expect(words.length).toBeGreaterThanOrEqual(120); expect(words.length).toBeLessThanOrEqual(170)
    expect(words.some((w) => w.text.startsWith('Berlin'))).toBe(true)
    expect(words.some((w) => /^\d+/.test(w.text))).toBe(true)
    const nein = words.filter((w) => w.text === 'Nein!')
    expect(nein.length).toBe(2)
    expect(nein[1]!.start - nein[0]!.end).toBeLessThan(0.1) // fast run: 20 ms gap + 50 ms sentence pause
    expect(t.results.transcripts[0]!.transcript).not.toContain('[fast]')
  })
  it('English fixture likewise (London, 2015)', async () => {
    const t = await fixture('en')
    const words = wordsFromTranscribe(t)
    const total = words.at(-1)!.end
    expect(total).toBeGreaterThanOrEqual(55); expect(total).toBeLessThanOrEqual(75)
    expect(words.length).toBeGreaterThanOrEqual(120); expect(words.length).toBeLessThanOrEqual(170)
    expect(words.some((w) => w.text.startsWith('London'))).toBe(true)
    expect(words.some((w) => w.text === '2015.')).toBe(true)
    const no = words.filter((w) => w.text === 'No!')
    expect(no.length).toBe(2)
    expect(no[1]!.start - no[0]!.end).toBeLessThan(0.1)
  })
})

describe('overlapping-speaker fixture (docs/decisions/0007 M3)', () => {
  type Item = { type: string; start_time?: string; end_time?: string; speaker_label?: string; alternatives: Array<{ content: string }> }
  type Run = { start_time: string; end_time: string; speaker_label: string; items: Array<{ start_time: string; end_time: string; speaker_label: string }> }
  const overlap = async () => JSON.parse(await read('transcribe-overlap-de.json')) as { jobName: string; results: { items: Item[]; speaker_labels?: { channel_label: string; speakers: number; segments: Run[] } } }
  it('regenerating dialogue-overlap-de.txt reproduces transcribe-overlap-de.json byte for byte', async () => {
    const regenerated = stringify(transcribeFixtureFromDialogue(await read('dialogue-overlap-de.txt'), 'de', 'overlap'))
    expect(regenerated).toBe(await read('transcribe-overlap-de.json'))
    expect((await overlap()).jobName).toBe('fixture-overlap-de')
  })
  it('overlap fixture: speaker_label on every item, speaker_labels with 2 speakers and one segment per run, one item starting before the previous item ends', async () => {
    const t = await overlap()
    const items = t.results.items
    expect(items.every((i) => i.speaker_label === 'spk_0' || i.speaker_label === 'spk_1')).toBe(true)
    const sl = t.results.speaker_labels!
    expect(sl.channel_label).toBe('ch_0'); expect(sl.speakers).toBe(2)
    const pron = items.filter((i) => i.type === 'pronunciation')
    const runs: string[] = []
    for (const i of pron) if (runs.at(-1) !== i.speaker_label) runs.push(i.speaker_label!)
    expect(sl.segments.map((s) => s.speaker_label)).toEqual(runs)
    expect(sl.segments.flatMap((s) => s.items).length).toBe(pron.length)
    for (const s of sl.segments) { expect(s.start_time).toBe(s.items[0]!.start_time); expect(s.end_time).toBe(s.items.at(-1)!.end_time) }
    const overlapping = pron.filter((p, k) => k > 0 && parseFloat(p.start_time!) < parseFloat(pron[k - 1]!.end_time!))
    expect(overlapping.map((p) => [p.alternatives[0]!.content, p.speaker_label])).toEqual([['Das', 'spk_1']])
    expect(wordsFromTranscribe(TranscribeJson.parse(t)).every((w) => w.speaker === 'spk_0' || w.speaker === 'spk_1')).toBe(true)
  })
  it('speaker offsets: [B+0.05] starts 50 ms after the previous word ends, [B-0.12] 120 ms before', () => {
    const t = transcribeFixtureFromDialogue('[A] Genau. [B+0.05] Aber was? [A] Das war alle. [B-0.12] Das glaube ich.', 'de', 'x')
    const words = wordsFromTranscribe(t)
    const at = (w: string) => words.findIndex((x) => x.text === w)
    const ms = (n: number) => Math.round(n * 1000)
    expect(ms(words[at('Aber')]!.start) - ms(words[at('Genau.')]!.end)).toBe(50)
    expect(ms(words[at('alle.')]!.end) - ms(words[at('alle.') + 1]!.start)).toBe(120)
    expect(words.map((w) => w.speaker)).toEqual(['spk_0', 'spk_1', 'spk_1', 'spk_0', 'spk_0', 'spk_0', 'spk_1', 'spk_1', 'spk_1'])
    expect(t.results.transcripts[0]!.transcript).toBe('Genau. Aber was? Das war alle. Das glaube ich.')
  })
  it('the 60-second fixtures carry no speaker_label and no speaker_labels section', async () => {
    for (const lang of ['de', 'en'] as const) {
      const raw = await read(`transcribe-60s-${lang}.json`)
      expect(raw).not.toContain('speaker_label')
      expect((await fixture(lang)).results).not.toHaveProperty('speaker_labels')
    }
  })
})

describe('transcribeWithAws polling', () => {
  it('throws a clear error when the job is still running after maxWaitMs (mocked client, no AWS)', async () => {
    const sent: string[] = []
    const client = { send: vi.fn(async (cmd: { constructor: { name: string } }) => { sent.push(cmd.constructor.name); return { TranscriptionJob: { TranscriptionJobStatus: 'IN_PROGRESS' } } }) }
    let t = 0
    const now = () => t
    const sleep = async (ms: number) => { t += ms }
    await expect(transcribeWithAws('s3://b/x.mp4', 'de', 'job-1', { client, pollMs: 5000, maxWaitMs: 60_000, now, sleep })).rejects.toThrow(/job-1 .*not finish within 1 min.*IN_PROGRESS/)
    expect(sent[0]).toBe('StartTranscriptionJobCommand')
    expect(sent.filter((n) => n === 'GetTranscriptionJobCommand').length).toBe(13) // t = 0, 5 s, …, 60 s
  })
  it('defaults to a 30 min limit', async () => {
    let t = 0
    const client = { send: async () => ({ TranscriptionJob: { TranscriptionJobStatus: 'QUEUED' } }) }
    await expect(transcribeWithAws('s3://b/x.mp4', 'en', 'job-2', { client, now: () => t, sleep: async (ms) => { t += ms } })).rejects.toThrow(/not finish within 30 min/)
    expect(t).toBeGreaterThanOrEqual(30 * 60_000); expect(t).toBeLessThan(30 * 60_000 + 10_000)
  })
  it('returns the transcript when the job completes before the limit', async () => {
    let calls = 0
    const client = { send: async () => (++calls < 3 ? {} : { TranscriptionJob: { TranscriptionJobStatus: 'COMPLETED', Transcript: { TranscriptFileUri: 'https://example.invalid/t.json' } } }) }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(AWS_DOC_EXAMPLE)))
    try {
      const r = await transcribeWithAws('s3://b/x.mp4', 'en', 'job-3', { client, pollMs: 1, now: () => 0, sleep: async () => {} })
      expect(r.results.transcripts[0]!.transcript).toBe('Welcome to Amazon Transcribe.')
    } finally { fetchSpy.mockRestore() }
  })
})
