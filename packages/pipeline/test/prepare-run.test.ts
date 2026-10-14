import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepare, runJsonPath, type RunJson } from '../src/prepare'
import { fixtureDeps } from '../src/fixtureDeps'
import { AiSchemaError } from '../src/ai/errors'
import { TranscribeJson } from '../src/types'

/** LING-008 batch 1: a failed clip still says how long each step took and what it cost so far (work/<slug>/run.json). */
let workRoot: string
beforeAll(async () => { workRoot = await mkdtemp(join(tmpdir(), 'lingo-run-')) })
afterAll(async () => { await rm(workRoot, { recursive: true, force: true }) })
const readRun = async (slug: string) => JSON.parse(await readFile(runJsonPath(join(workRoot, slug)), 'utf8')) as RunJson
const nonNegative = (t: Record<string, number>) => Object.values(t).every((v) => Number.isFinite(v) && v >= 0)
const ledger = { calls: 4, cachedCalls: 1, inputTokens: 4000, outputTokens: 900, usd: 0.0123 }

describe('prepare run.json and generated.timings', () => {
  it('success: clip.json carries generated.timings, run.json is ok with the same steps and the spend', async () => {
    const d = { ...fixtureDeps('de', { durationS: 90 }), cost: () => ledger }
    const chars: number[] = []
    const translate = d.translate
    d.translate = async (t, f, to, o) => { chars.push([...t].length); return translate(t, f, to, o) }
    const r = await prepare({ slug: 'ok-de', source: 's3://unused', lang: 'de', natives: ['en'], workRoot, publish: false }, d)
    const timings = r.clip.generated.timings!
    expect(Object.keys(timings)).toEqual(['media', 'transcribe', 'segment', 'gate', 'translate', 'lemmatize', 'highlights', 'ai', 'vtt', 'package'])
    expect(nonNegative(timings)).toBe(true)
    expect(JSON.parse(await readFile(r.files.clipJson, 'utf8')).generated.timings).toEqual(timings)
    const run = await readRun('ok-de')
    expect(run).toMatchObject({ slug: 'ok-de', ok: true, cost: { transcribeMinutes: 1.5, translateChars: chars.reduce((a, b) => a + b, 0), bedrockUsd: 0.0123, bedrock: ledger } })
    expect(run.cost.translateChars).toBeGreaterThan(0)
    expect(run).not.toHaveProperty('failedStep')
    expect(Object.keys(run.timings)).toEqual([...Object.keys(timings), 'clip'])
    expect(run.totalMs).toBeGreaterThanOrEqual(0)
  })

  it('gate failure: run.json names the gate step and the error, with Transcribe minutes and no Translate or Bedrock spend', async () => {
    const d = fixtureDeps('de', { durationS: 120 })
    const sentence = 'Ich habe dreimal angerufen und niemand hat abgenommen, also bin ich hierher gekommen.'
    d.transcribe = async () => TranscribeJson.parse({ results: { transcripts: [{ transcript: sentence }], items: sentence.split(' ').map((w, i) => ({ type: 'pronunciation', start_time: (i * 0.02).toFixed(2), end_time: (i * 0.02 + 0.015).toFixed(3), alternatives: [{ content: w }] })) } })
    await expect(prepare({ slug: 'gate-de', source: 's3://unused', lang: 'de', natives: ['en'], workRoot, publish: false }, d)).rejects.toThrow(/cps/)
    const run = await readRun('gate-de')
    expect(run.ok).toBe(false)
    expect(run.failedStep).toBe('gate')
    expect(run.error).toMatch(/cps/)
    expect(Object.keys(run.timings)).toEqual(['media', 'transcribe', 'segment', 'gate'])
    expect(nonNegative(run.timings)).toBe(true)
    expect(run.cost).toEqual({ transcribeMinutes: 2, translateChars: 0, bedrockUsd: 0 })
    expect(existsSync(join(workRoot, 'gate-de', 'clip.json'))).toBe(false)
  })

  it('AI failure: run.json names the ai step and keeps the Bedrock spend so far', async () => {
    const d = { ...fixtureDeps('en', { durationS: 60 }), cost: () => ledger }
    d.quiz = async () => { throw new AiSchemaError('quiz', ['items: too few'], null) }
    await expect(prepare({ slug: 'ai-en', source: 's3://unused', lang: 'en', natives: ['de'], workRoot, publish: false }, d)).rejects.toThrow(AiSchemaError)
    const run = await readRun('ai-en')
    expect(run).toMatchObject({ ok: false, failedStep: 'ai', cost: { transcribeMinutes: 1, bedrockUsd: 0.0123, bedrock: ledger } })
    expect(run.error).toMatch(/quiz answer rejected twice/)
    expect(run.cost.translateChars).toBeGreaterThan(0)
    expect(Object.keys(run.timings).at(-1)).toBe('ai')
  })

  it('a --cues re-run with the mezzanine on disk records no Transcribe minutes and a cues step', async () => {
    const d = fixtureDeps('de', { durationS: 90 })
    const first = await prepare({ slug: 'cues-de', source: 's3://unused', lang: 'de', natives: ['en'], workRoot, publish: false }, d)
    await mkdir(join(workRoot, 'cues-de'), { recursive: true })
    await writeFile(join(workRoot, 'cues-de', 'mezz.mp4'), '')
    const r = await prepare({ slug: 'cues-de', source: 's3://unused', lang: 'de', natives: ['en'], workRoot, publish: false, cues: first.files.vtt.de! }, d)
    expect(Object.keys(r.clip.generated.timings!)).toEqual(['media', 'cues', 'gate', 'translate', 'lemmatize', 'highlights', 'ai', 'vtt', 'package'])
    expect((await readRun('cues-de')).cost.transcribeMinutes).toBe(0)
  })
})
