import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { createAi } from '../src/ai/index'
import { fakeSend, nova, QUIZ_CUES } from './novaFake'

const ENV = ['NOVA_LITE_MODEL_ID', 'LINGO_AI_MODEL', 'LINGO_AI_REASONING', 'BEDROCK_REGION', 'LINGO_AI_CACHE_DIR'] as const
let saved: Record<string, string | undefined>
let dir: string
beforeEach(async () => { saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]])); dir = await mkdtemp(join(tmpdir(), 'lingo-ai-')) })
afterEach(async () => {
  for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }
  await rm(dir, { recursive: true, force: true })
})

describe('createAi', () => {
  it('createAi reads NOVA_LITE_MODEL_ID / BEDROCK_REGION / LINGO_AI_CACHE_DIR and defaults to us.amazon.nova-pro-v1:0, us-east-1, data/.cache/ai', async () => {
    for (const k of ENV) delete process.env[k]
    const d = createAi({ send: fakeSend(nova('gloss-v3-ok')) }).config
    expect(d.model).toBe('us.amazon.nova-pro-v1:0')
    expect(d.region).toBe('us-east-1')
    expect(d.cacheDir.endsWith(['pipeline', 'data', '.cache', 'ai'].join(sep))).toBe(true)

    process.env.NOVA_LITE_MODEL_ID = 'eu.amazon.nova-lite-v1:0'
    process.env.BEDROCK_REGION = 'eu-central-1'
    process.env.LINGO_AI_CACHE_DIR = dir
    const send = fakeSend(nova('gloss-v3-ok'))
    const a = createAi({ send, log: () => {} })
    expect(a.config).toEqual({ model: 'eu.amazon.nova-lite-v1:0', region: 'eu-central-1', cacheDir: dir, reasoning: 'off' })
    await a.gloss({ word: 'warte', lemma: 'warten', cue: 'Ich warte.', lang: 'de', native: 'en', level: 'A1' })
    expect(send.mock.calls[0]![0].modelId).toBe('eu.amazon.nova-lite-v1:0')

    // explicit options win over the environment
    expect(createAi({ send, model: 'm', region: 'r', cacheDir: '/c', prices: { input: 1, output: 1 } }).config).toEqual({ model: 'm', region: 'r', cacheDir: '/c', reasoning: 'off' })
  })

  it('cost() reflects gloss and quiz calls of one instance and is independent between instances', async () => {
    const a = createAi({ send: fakeSend(nova('gloss-v3-ok')), model: 'us.amazon.nova-lite-v1:0', cacheDir: join(dir, 'a'), log: () => {} })
    const b = createAi({ send: fakeSend(nova('quiz-ok')), model: 'us.amazon.nova-lite-v1:0', quiz: 'model', cacheDir: join(dir, 'b'), log: () => {} })
    await a.gloss({ word: 'warte', lemma: 'warten', cue: 'Ich warte seit zwei Stunden auf dich.', lang: 'de', native: 'en', level: 'A2' })
    await a.gloss({ word: 'warte', lemma: 'warten', cue: 'Ich warte seit zwei Stunden auf dich.', lang: 'de', native: 'en', level: 'A2' })
    await b.quiz(QUIZ_CUES, 'de', 'en')
    expect(a.cost()).toEqual({ calls: 1, cachedCalls: 1, inputTokens: 287, outputTokens: 61, usd: 0.000032 })
    expect(b.cost()).toEqual({ calls: 1, cachedCalls: 0, inputTokens: 2480, outputTokens: 290, usd: 0.000218 })
  })

  it('createAi throws for a model without a price unless prices are passed', () => {
    expect(() => createAi({ send: fakeSend(nova('gloss-v3-ok')), model: 'us.amazon.nova-unknown-v9:0' })).toThrow(/no price/)
    expect(() => createAi({ send: fakeSend(nova('gloss-v3-ok')), model: 'us.amazon.nova-unknown-v9:0', prices: { input: 1, output: 2 } })).not.toThrow()
  })

  it('createAi throws when reasoning is on for a model other than Nova 2 Lite', () => {
    expect(() => createAi({ send: fakeSend(nova('gloss-v3-ok')), model: 'us.amazon.nova-pro-v1:0', reasoning: 'low' })).toThrow(/reasoning/)
    expect(createAi({ send: fakeSend(nova('gloss-v3-ok')), model: 'us.amazon.nova-2-lite-v1:0', reasoning: 'low' }).config.reasoning).toBe('low')
    process.env.LINGO_AI_MODEL = 'us.amazon.nova-2-lite-v1:0'
    process.env.LINGO_AI_REASONING = 'medium'
    expect(createAi({ send: fakeSend(nova('gloss-v3-ok')) }).config).toMatchObject({ model: 'us.amazon.nova-2-lite-v1:0', reasoning: 'medium' })
    process.env.LINGO_AI_REASONING = 'high'
    expect(() => createAi({ send: fakeSend(nova('gloss-v3-ok')) })).toThrow(/LINGO_AI_REASONING/)
  })
})
