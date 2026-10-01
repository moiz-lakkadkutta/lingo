import { createHash } from 'node:crypto'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime'
import { AiSchemaError, createAi } from '../src/ai/index'
import { GLOSS_PROMPT_VERSION, glossSystemPrompt } from '../src/ai/gloss'
import { fakeSend, nova, novaList, userTexts } from './novaFake'

const sdk = vi.hoisted(() => ({ constructed: 0 }))
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: class { constructor() { sdk.constructed++ } async send() { throw new Error('no network in tests') } },
  ConverseCommand: class { constructor(public input: unknown) {} },
}))

const MODEL = 'us.amazon.nova-lite-v1:0'
const CUE = 'Ich warte seit zwei\nStunden auf dich.'
const args = ['warte', 'warten', CUE, 'de', 'en', 'A2'] as const

let dir: string
let logs: string[]
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'lingo-gloss-')); logs = [] })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })
const ai = (send: ReturnType<typeof fakeSend>) => createAi({ send, model: MODEL, cacheDir: dir, log: (m) => logs.push(m), now: () => new Date('2026-10-01T12:00:00Z') })
const cacheFiles = async () => readdir(join(dir, 'gloss')).catch(() => [] as string[])

describe('gloss', () => {
  it('sends system prompt, user JSON {word, lemma, cue}, toolChoice explain_word and temperature 0 to the configured model', async () => {
    const send = fakeSend(nova('gloss-ok'))
    await ai(send).gloss(...args)
    expect(send).toHaveBeenCalledTimes(1)
    const input = send.mock.calls[0]![0]
    expect(input.modelId).toBe(MODEL)
    expect(input.system).toEqual([{ text: glossSystemPrompt('de', 'en', 'A2', 'warte', 'warten') }])
    expect(input.messages).toHaveLength(1)
    expect(input.messages![0]!.role).toBe('user')
    expect(userTexts(send)).toHaveLength(1)
    expect(JSON.parse(userTexts(send)[0]!)).toEqual({ word: 'warte', lemma: 'warten', cue: 'Ich warte seit zwei Stunden auf dich.' })
    expect(input.toolConfig?.toolChoice).toEqual({ tool: { name: 'explain_word' } })
    expect(input.toolConfig?.tools?.map((t) => t.toolSpec?.name)).toEqual(['explain_word'])
    const schema = input.toolConfig!.tools![0]!.toolSpec!.inputSchema!.json as Record<string, unknown>
    expect(Object.keys(schema).sort()).toEqual(['properties', 'required', 'type'])
    expect(input.inferenceConfig).toEqual({ maxTokens: 300, temperature: 0 })
    const prompt = glossSystemPrompt('de', 'en', 'A2', 'warte', 'warten')
    expect(prompt).toContain('You are a German teacher')
    expect(prompt).toContain('The learner speaks English.')
    expect(prompt).toContain('separable verb: an|rufen')
    expect(glossSystemPrompt('en', 'de', 'B1', 'gave', 'give')).toContain('phrasal verb: give up')
  })

  it('returns the toolUse input as a Gloss and records usage in the ledger', async () => {
    const a = ai(fakeSend(nova('gloss-ok')))
    expect(await a.gloss(...args)).toEqual({ gloss: 'wait', grammar: 'verb, warten, wartete, hat gewartet; takes auf + accusative', example: 'Wir warten auf den Bus.' })
    expect(a.cost()).toEqual({ calls: 1, cachedCalls: 0, inputTokens: 287, outputTokens: 61, usd: 0.000032 })
    expect(logs).toEqual(['ai gloss warten attempt=1 in=287 out=61 ms=812 usd=0.000032 stop=tool_use'])
  })

  it('serves the second identical request from the cache: one send call, cachedCalls 1', async () => {
    const send = fakeSend(nova('gloss-ok'))
    const a = ai(send)
    const first = await a.gloss(...args)
    expect(await a.gloss(...args)).toEqual(first)
    expect(send).toHaveBeenCalledTimes(1)
    expect(a.cost()).toMatchObject({ calls: 1, cachedCalls: 1 })
    expect(logs.at(-1)).toBe('ai gloss warten cached')
    // a fresh instance on the same cache directory also hits
    const send2 = fakeSend(nova('gloss-ok'))
    await ai(send2).gloss('warte', 'warten', 'Ich  warte seit zwei Stunden auf dich.', 'de', 'en', 'A2')
    expect(send2).not.toHaveBeenCalled()
  })

  it('a different cue for the same lemma is a cache miss', async () => {
    const send = fakeSend(nova('gloss-ok'))
    const a = ai(send)
    await a.gloss(...args)
    await a.gloss('warte', 'warten', 'Warte hier auf mich.', 'de', 'en', 'A2')
    expect(send).toHaveBeenCalledTimes(2)
    expect(a.cost()).toMatchObject({ calls: 2, cachedCalls: 0 })
    expect(await cacheFiles()).toHaveLength(2)
  })

  it('retries once with the validation issues and the rejected answer in the user message, then succeeds (fixture gloss-bad-then-ok)', async () => {
    const send = fakeSend(...novaList('gloss-bad-then-ok'))
    const a = ai(send)
    expect((await a.gloss(...args)).gloss).toBe('wait')
    expect(send).toHaveBeenCalledTimes(2)
    const retry = userTexts(send, 1)
    expect(retry).toHaveLength(2)
    expect(retry[0]).toBe(userTexts(send, 0)[0])
    expect(retry[1]).toMatch(/^Your previous tool call was rejected: gloss must be a translation, not a copy of the word/)
    expect(retry[1]).toContain('Previous answer: {"gloss":"warten"')
    expect(retry[1]).toMatch(/Call explain_word again with a corrected answer\.$/)
    expect(a.cost()).toMatchObject({ calls: 2, inputTokens: 287 + 402, outputTokens: 58 + 61 })
    expect(logs.map((l) => l.split(' ').slice(0, 4).join(' '))).toEqual(['ai gloss warten attempt=1', 'ai gloss warten attempt=2'])
    expect(await cacheFiles()).toHaveLength(1)
  })

  it('throws AiSchemaError with the issues after two rejected answers and caches nothing', async () => {
    const bad = novaList('gloss-bad-then-ok')[0]!
    const send = fakeSend(bad, bad)
    const a = ai(send)
    const err = await a.gloss(...args).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AiSchemaError)
    expect((err as AiSchemaError).kind).toBe('gloss')
    expect((err as AiSchemaError).issues[0]).toMatch(/not a copy of the word/)
    expect((err as AiSchemaError).lastOutput).toMatchObject({ gloss: 'warten' })
    expect(send).toHaveBeenCalledTimes(2)
    expect(a.cost().calls).toBe(2)
    expect(await cacheFiles()).toEqual([])
  })

  it('treats a response without a toolUse block (stopReason max_tokens) as a rejected answer', async () => {
    const truncated = { output: { message: { role: 'assistant', content: [{ text: '{"gloss": "wa' }] } }, stopReason: 'max_tokens', usage: { inputTokens: 287, outputTokens: 300, totalTokens: 587 }, metrics: { latencyMs: 2000 } } as unknown as ConverseCommandOutput
    const send = fakeSend(truncated, nova('gloss-ok'))
    expect((await ai(send).gloss(...args)).gloss).toBe('wait')
    expect(userTexts(send, 1)[1]).toContain('no tool call in the response (stopReason=max_tokens)')
    expect(userTexts(send, 1)[1]).toContain('Previous answer: null')
  })

  it('GLOSS_PROMPT_VERSION must be bumped when the system prompt changes (sha256 snapshot of glossSystemPrompt("de","en","A2","warte","warten"))', () => {
    const sha = createHash('sha256').update(glossSystemPrompt('de', 'en', 'A2', 'warte', 'warten')).digest('hex')
    // If this fails because you edited the prompt: bump GLOSS_PROMPT_VERSION and update both values here.
    expect({ version: GLOSS_PROMPT_VERSION, sha }).toEqual({ version: 1, sha: '89399c1ab361bada103e1bf212ee689db14df2e040e40ccea2ddff8a2fd6fc72' })
  })

  it('never constructs a BedrockRuntimeClient when send is injected', async () => {
    const a = ai(fakeSend(nova('gloss-ok')))
    await a.gloss(...args)
    await a.quiz([], 'de', 'en')
    expect(sdk.constructed).toBe(0)
  })
})
