import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { createAi } from '../src/ai/index'
import { fakeSend, nova, QUIZ_CUES } from './novaFake'

const ENV = ['NOVA_LITE_MODEL_ID', 'BEDROCK_REGION', 'LINGO_AI_CACHE_DIR'] as const
let saved: Record<string, string | undefined>
let dir: string
beforeEach(async () => { saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]])); dir = await mkdtemp(join(tmpdir(), 'lingo-ai-')) })
afterEach(async () => {
  for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }
  await rm(dir, { recursive: true, force: true })
})

describe('createAi', () => {
  it('createAi reads NOVA_LITE_MODEL_ID / BEDROCK_REGION / LINGO_AI_CACHE_DIR and defaults to us.amazon.nova-lite-v1:0, us-east-1, data/.cache/ai', async () => {
    for (const k of ENV) delete process.env[k]
    const d = createAi({ send: fakeSend(nova('gloss-v3-ok')) }).config
    expect(d.model).toBe('us.amazon.nova-lite-v1:0')
    expect(d.region).toBe('us-east-1')
    expect(d.cacheDir.endsWith(['pipeline', 'data', '.cache', 'ai'].join(sep))).toBe(true)

    process.env.NOVA_LITE_MODEL_ID = 'eu.amazon.nova-lite-v1:0'
    process.env.BEDROCK_REGION = 'eu-central-1'
    process.env.LINGO_AI_CACHE_DIR = dir
    const send = fakeSend(nova('gloss-v3-ok'))
    const a = createAi({ send, log: () => {} })
    expect(a.config).toEqual({ model: 'eu.amazon.nova-lite-v1:0', region: 'eu-central-1', cacheDir: dir })
    await a.gloss({ word: 'warte', lemma: 'warten', cue: 'Ich warte.', lang: 'de', native: 'en', level: 'A1' })
    expect(send.mock.calls[0]![0].modelId).toBe('eu.amazon.nova-lite-v1:0')

    // explicit options win over the environment
    expect(createAi({ send, model: 'm', region: 'r', cacheDir: '/c' }).config).toEqual({ model: 'm', region: 'r', cacheDir: '/c' })
  })

  it('cost() reflects gloss and quiz calls of one instance and is independent between instances', async () => {
    const a = createAi({ send: fakeSend(nova('gloss-v3-ok')), cacheDir: join(dir, 'a'), log: () => {} })
    const b = createAi({ send: fakeSend(nova('quiz-ok')), cacheDir: join(dir, 'b'), log: () => {} })
    await a.gloss({ word: 'warte', lemma: 'warten', cue: 'Ich warte seit zwei Stunden auf dich.', lang: 'de', native: 'en', level: 'A2' })
    await a.gloss({ word: 'warte', lemma: 'warten', cue: 'Ich warte seit zwei Stunden auf dich.', lang: 'de', native: 'en', level: 'A2' })
    await b.quiz(QUIZ_CUES, 'de', 'en')
    expect(a.cost()).toEqual({ calls: 1, cachedCalls: 1, inputTokens: 287, outputTokens: 61, usd: 0.000032 })
    expect(b.cost()).toEqual({ calls: 1, cachedCalls: 0, inputTokens: 2480, outputTokens: 290, usd: 0.000218 })
  })
})
