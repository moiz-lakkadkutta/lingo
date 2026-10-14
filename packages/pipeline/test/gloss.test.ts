import { createHash } from 'node:crypto'
import { access, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ConverseCommandInput, ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime'
import { currentTemperature, resetTemperature, TEMPERATURE, TEMPERATURE_FLOOR } from '../src/ai/call'
import type { BedrockSend } from '../src/ai/client'
import { createAi } from '../src/ai/index'
import { GLOSS_PROMPT_VERSION, glossSystemPrompt, glossToolConfig, markTarget, type GlossRequest } from '../src/ai/gloss'
import { fakeSend, nova, novaList, userTexts } from './novaFake'

const sdk = vi.hoisted(() => ({ constructed: 0 }))
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: class { constructor() { sdk.constructed++ } async send() { throw new Error('no network in tests') } },
  ConverseCommand: class { constructor(public input: unknown) {} },
}))

const MODEL = 'us.amazon.nova-lite-v1:0'
const CUE = 'Ich warte seit zwei\nStunden auf dich.'
const REQ: GlossRequest = { word: 'warte', lemma: 'warten', cue: CUE, lang: 'de', native: 'en', level: 'A2' }

let dir: string
let logs: string[]
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'lingo-gloss-')); logs = [] })
afterEach(async () => { resetTemperature(); await rm(dir, { recursive: true, force: true }) })
const ai = (send: BedrockSend) => createAi({ send, model: MODEL, cacheDir: dir, log: (m) => logs.push(m), now: () => new Date('2026-10-01T12:00:00Z') })
const cacheFiles = async () => readdir(join(dir, 'gloss')).catch(() => [] as string[])
const withCard = (input: Record<string, unknown>, usage = { inputTokens: 287, outputTokens: 61, totalTokens: 348 }) =>
  ({ output: { message: { role: 'assistant', content: [{ toolUse: { toolUseId: 't', name: 'explain_word', input } }] } }, stopReason: 'tool_use', usage, metrics: { latencyMs: 1 } }) as unknown as ConverseCommandOutput
const OK_CARD = { sense: 'bleiben, bis jemand kommt oder etwas passiert', pos: 'verb', gloss: ['to wait'], register: 'neutral', past: 'wartete', participle: 'hat gewartet', example: 'Wir warten auf den Bus.' }

describe('gloss v3', () => {
  it('marks the first whole-word occurrence of the target in the line with [[…]] and joins line breaks', () => {
    expect(markTarget('Just a minute, Jeff.\nI\'ll get my tennis racket.', 'racket')).toBe('Just a minute, Jeff. I\'ll get my tennis [[racket]].')
    expect(markTarget('the rackets and the racket', 'racket')).toBe('the rackets and the [[racket]]')
    expect(markTarget('old-timer, an old-timer', 'old-timer')).toBe('[[old-timer]], an old-timer')
    expect(() => markTarget('the rackets', 'racket')).toThrow(/not found/)
  })

  it('sends {line, word, lemma} with the marked line, toolChoice explain_word and the v3 tool schema (sense first, example last)', async () => {
    const send = fakeSend(nova('gloss-v3-ok'))
    const r = await ai(send).gloss(REQ)
    expect(r.status).toBe('ok')
    expect(send).toHaveBeenCalledTimes(1)
    const input = send.mock.calls[0]![0]
    expect(input.modelId).toBe(MODEL)
    expect(input.system).toEqual([{ text: glossSystemPrompt('de', 'en', 'A2', 'warten') }])
    expect(userTexts(send)).toHaveLength(1)
    expect(JSON.parse(userTexts(send)[0]!)).toEqual({ line: 'Ich [[warte]] seit zwei Stunden auf dich.', word: 'warte', lemma: 'warten' })
    expect(input.toolConfig?.toolChoice).toEqual({ tool: { name: 'explain_word' } })
    expect(input.toolConfig).toEqual(glossToolConfig('de', 'en'))
    const schema = input.toolConfig!.tools![0]!.toolSpec!.inputSchema!.json as { properties: Record<string, unknown>; required: string[] }
    expect(Object.keys(schema).sort()).toEqual(['properties', 'required', 'type'])
    const props = Object.keys(schema.properties)
    expect(props[0]).toBe('sense')
    expect(props.at(-1)).toBe('example')
    expect(schema.required).toEqual(['sense', 'pos', 'gloss', 'register', 'example'])
    expect(input.inferenceConfig).toEqual({ maxTokens: 500, temperature: 0 })
    // the native line is never sent to the model
    const withNative = fakeSend(nova('gloss-v3-ok'))
    await ai(withNative).gloss({ ...REQ, cue: 'Warte hier.', word: 'Warte', nativeCue: 'Wait here.' })
    expect(JSON.stringify(withNative.mock.calls[0]![0].messages)).not.toContain('Wait here')
  })

  it('renders the card into the app Gloss and records usage in the ledger', async () => {
    const a = ai(fakeSend(nova('gloss-v3-ok')))
    const r = await a.gloss(REQ)
    expect(r).toMatchObject({ status: 'ok', gloss: { gloss: 'to wait', grammar: 'verb: warten, wartete, hat gewartet', example: 'Wir warten auf den Bus.' }, attempts: 1, cached: false })
    expect(a.cost()).toEqual({ calls: 1, cachedCalls: 0, inputTokens: 287, outputTokens: 61, usd: 0.000032 })
    expect(logs).toEqual(['ai gloss warten attempt=1 in=287 out=61 ms=812 usd=0.000032 stop=tool_use'])
  })

  it('GLOSS_PROMPT_VERSION must be bumped when the system prompt or the tool schema changes (sha256 snapshot of both)', () => {
    const sha = createHash('sha256').update(glossSystemPrompt('de', 'en', 'A2', 'warten')).update(JSON.stringify(glossToolConfig('de', 'en'))).digest('hex')
    // If this fails because you edited the prompt or the tool: bump GLOSS_PROMPT_VERSION and update both values here.
    expect({ version: GLOSS_PROMPT_VERSION, sha }).toEqual({ version: 7, sha: 'd51dc9a2c2d95bf071195c042880e7299c9fe9b118ce95152d04711588de7633' })
  })

  it('the en and de prompts carry their own FORMS and EXAMPLES blocks and no few-shot word from the English gold set', () => {
    const en = glossSystemPrompt('en', 'de', 'A2', 'racket')
    const de = glossSystemPrompt('de', 'en', 'A2', 'warten')
    expect(en).toContain('ONE word of a English subtitle line. The learner speaks German')
    expect(en).toContain('"go" → "went", "gone"')
    expect(en).toContain('[[coat]]')
    expect(en).not.toContain('Regenschirm')
    expect(en).not.toContain('The glosses below are')
    expect(de).toContain('participle with its auxiliary')
    expect(de).toContain('[[Regenschirm]]')
    expect(de).not.toContain('[[coat]]')
    expect(glossSystemPrompt('en', 'tr', 'A2', 'racket')).toContain('The glosses below are German; yours must be in Turkish.')
    const gold = ['tennis', 'racket', 'sale', 'scavenger', 'swell', 'wagon', 'sal', 'old-timer', 'refreshment', 'tack', 'activity', 'acquaint', 'roast', 'weenie', 'expense', 'baseball', 'comfortably', 'inexpensive', 'loafer', 'supervise', 'scavenger sale', 'get acquainted', 'weenie roast', 'wagon train']
    const fewShotWords = [...en.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]!.toLowerCase()).filter((w) => w !== 'this')
    expect(fewShotWords).toEqual(['look forward to', 'pick up', 'coat', 'nifty', 'tidied'])
    for (const w of fewShotWords) expect(gold).not.toContain(w)
  })

  it('caches the card, not the rendered gloss: a renderer change re-renders a cached card without a Bedrock call', async () => {
    const send = fakeSend(nova('gloss-v3-ok'))
    await ai(send).gloss(REQ)
    const [file] = await cacheFiles()
    const entry = JSON.parse(await readFile(join(dir, 'gloss', file!), 'utf8'))
    expect(entry.output).toEqual(OK_CARD)
    expect(entry.attempts).toBe(1)
    const again = await ai(send).gloss(REQ)
    expect(send).toHaveBeenCalledTimes(1)
    expect(again).toMatchObject({ status: 'ok', cached: true, gloss: { grammar: 'verb: warten, wartete, hat gewartet' } })
    // a different learner language renders other labels from a different entry; the same card in en → "verb: …"
    expect(logs.at(-1)).toBe('ai gloss warten cached')
  })

  it('a different cue, word, level or native is a cache miss; the same request on a fresh instance is a hit', async () => {
    const send = fakeSend(nova('gloss-v3-ok'))
    const a = ai(send)
    await a.gloss(REQ)
    await a.gloss({ ...REQ, cue: 'Ich warte hier auf dich.' })
    await a.gloss({ ...REQ, level: 'B1' })
    await a.gloss({ ...REQ, native: 'tr' })
    await a.gloss(REQ)
    expect(send).toHaveBeenCalledTimes(4)
    expect(a.cost()).toMatchObject({ calls: 4, cachedCalls: 1 })
    const send2 = fakeSend(nova('gloss-v3-ok'))
    await ai(send2).gloss({ ...REQ, cue: 'Ich  warte seit zwei Stunden auf dich.' })
    expect(send2).not.toHaveBeenCalled()
  })

  it('retries once with the validation issues and the rejected answer in the user message, then succeeds', async () => {
    const send = fakeSend(...novaList('gloss-v3-bad-then-ok'))
    const a = ai(send)
    const r = await a.gloss(REQ)
    expect(r).toMatchObject({ status: 'ok', attempts: 2 })
    expect(send).toHaveBeenCalledTimes(2)
    const retry = userTexts(send, 1)
    expect(retry).toHaveLength(2)
    expect(retry[0]).toBe(userTexts(send, 0)[0])
    expect(retry[1]).toMatch(/^Your previous tool call was rejected: G-COPY: gloss "warten" copies the word/)
    expect(retry[1]).toContain('Previous answer: {"sense"')
    expect(retry[1]).toMatch(/Call explain_word again with a corrected answer\.$/)
    expect(a.cost()).toMatchObject({ calls: 2, inputTokens: 287 + 402, outputTokens: 58 + 61 })
    expect(await cacheFiles()).toHaveLength(1)
  })

  it('returns status rejected (not a throw) after two rejected answers, with the issues and the last output', async () => {
    const bad = novaList('gloss-v3-bad-then-ok')[0]!
    const send = fakeSend(bad, bad)
    const a = ai(send)
    const r = await a.gloss(REQ)
    expect(r.status).toBe('rejected')
    if (r.status !== 'rejected') return
    expect(r.issues[0]).toMatch(/^G-COPY:/)
    expect(r.lastOutput).toMatchObject({ gloss: ['warten'] })
    expect(send).toHaveBeenCalledTimes(2)
    expect(await cacheFiles()).toEqual([])
  })

  it('returns status rejected without a call when the word is not in the line', async () => {
    const send = fakeSend(nova('gloss-v3-ok'))
    const r = await ai(send).gloss({ ...REQ, word: 'wartet' })
    expect(r).toMatchObject({ status: 'rejected', issues: [expect.stringMatching(/^MARK: /)] })
    expect(send).not.toHaveBeenCalled()
  })

  it('returns status soft when the retry answer has only soft issues, and logs a WARNING', async () => {
    const card = (example: string) => withCard({ sense: 'etwas jemandem reichen', pos: 'verb', gloss: ['to give'], register: 'neutral', past: 'gab', participle: 'hat gegeben', example })
    const send = fakeSend(card('Er gab mir das Buch.'), card('Er gab mir gestern das Buch.'))
    const a = ai(send)
    const req: GlossRequest = { word: 'gibt', lemma: 'geben', cue: 'Sie gibt nie auf.', lang: 'de', native: 'en', level: 'A2' }
    const r = await a.gloss(req)
    expect(r).toMatchObject({ status: 'soft', gloss: { example: 'Er gab mir gestern das Buch.' } })
    expect(r.issues[0]).toMatch(/^X-USES: /)
    expect(userTexts(send, 1)[1]).toContain('X-USES: example must use the word "gibt" or its base form "geben"')
    expect(logs.some((l) => l.startsWith('WARNING ai gloss geben accepted on retry with a soft issue: X-USES'))).toBe(true)
    // cached and served again as soft
    expect(await a.gloss(req)).toMatchObject({ status: 'soft', cached: true })
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('sends the previous cue as "previous" context (line breaks joined), never its native line', async () => {
    const send = fakeSend(nova('gloss-v3-ok'))
    await ai(send).gloss({ ...REQ, prevCue: 'Wo bist du\ndenn?', prevNativeCue: 'Where are you?' })
    expect(JSON.parse(userTexts(send)[0]!)).toEqual({ previous: 'Wo bist du denn?', line: 'Ich [[warte]] seit zwei Stunden auf dich.', word: 'warte', lemma: 'warten' })
    expect(JSON.stringify(send.mock.calls[0]![0].messages)).not.toContain('Where are you')
    expect(glossSystemPrompt('de', 'en', 'A2', 'warten')).toMatch(/"previous".*context only/s)
  })

  it('the first cue (no previous cue) sends no context', async () => {
    const send = fakeSend(nova('gloss-v3-ok'))
    await ai(send).gloss(REQ)
    expect(JSON.parse(userTexts(send)[0]!)).not.toHaveProperty('previous')
  })

  it('a different previous cue is a cache miss; the same previous cue is a hit', async () => {
    const send = fakeSend(nova('gloss-v3-ok'))
    const a = ai(send)
    await a.gloss({ ...REQ, prevCue: 'Wo bist du?' })
    await a.gloss({ ...REQ, prevCue: 'Komm schon!' })
    await a.gloss(REQ)
    expect(send).toHaveBeenCalledTimes(3)
    await a.gloss({ ...REQ, prevCue: 'Wo  bist du?' })
    expect(send).toHaveBeenCalledTimes(3)
  })

  it('a gloss that matches a word of the previous line is not an issue (the previous line is context only)', async () => {
    const send = fakeSend(withCard(OK_CARD))
    const r = await ai(send).gloss({ ...REQ, prevCue: 'Bitte wait, to wait!', prevNativeCue: 'Please wait, to wait!' })
    expect(r.status).toBe('ok')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('a hint changes the cache key and is sent as a second user text block', async () => {
    const send = fakeSend(nova('gloss-v3-ok'))
    const a = ai(send)
    await a.gloss(REQ)
    const hint = 'Another word of this line, "Stunden", was glossed "hours". Gloss only [[warte]].'
    await a.gloss({ ...REQ, hint })
    expect(send).toHaveBeenCalledTimes(2)
    expect(userTexts(send, 1)).toEqual([userTexts(send, 0)[0], hint])
    await a.gloss({ ...REQ, hint })
    expect(send).toHaveBeenCalledTimes(2)
    expect(await cacheFiles()).toHaveLength(2)
  })

  it('drops empty-string optional fields before parsing (Nova returns "" for unused fields)', async () => {
    const send = fakeSend(withCard({ ...OK_CARD, article: '', plural: '', comparative: '', separable: '' }))
    const r = await ai(send).gloss(REQ)
    expect(r.status).toBe('ok')
    if (r.status === 'rejected') return
    expect(r.card).toEqual(OK_CARD)
  })

  it('treats a response without a toolUse block (stopReason max_tokens) as a rejected answer', async () => {
    const truncated = { output: { message: { role: 'assistant', content: [{ text: '{"sense": "wa' }] } }, stopReason: 'max_tokens', usage: { inputTokens: 287, outputTokens: 500, totalTokens: 787 }, metrics: { latencyMs: 2000 } } as unknown as ConverseCommandOutput
    const send = fakeSend(truncated, nova('gloss-v3-ok'))
    expect((await ai(send).gloss(REQ)).status).toBe('ok')
    expect(userTexts(send, 1)[1]).toContain('no tool call in the response (stopReason=max_tokens)')
    expect(userTexts(send, 1)[1]).toContain('Previous answer: null')
  })

  it('re-validates a cache hit: a stale entry that now fails the card checks is deleted and asked again', async () => {
    await ai(fakeSend(nova('gloss-v3-ok'))).gloss(REQ)
    const [file] = await cacheFiles()
    const path = join(dir, 'gloss', file!)
    const entry = JSON.parse(await readFile(path, 'utf8'))
    await writeFile(path, JSON.stringify({ ...entry, output: { ...entry.output, gloss: ['Warten'] } }))
    const failing: BedrockSend = vi.fn(async () => { throw Object.assign(new Error('boom'), { name: 'InternalServerException' }) })
    await expect(ai(failing).gloss(REQ)).rejects.toThrow('boom')
    await expect(access(path)).rejects.toThrow()
    expect(failing).toHaveBeenCalledTimes(1)
    const send = fakeSend(nova('gloss-v3-ok'))
    expect((await ai(send).gloss(REQ)).status).toBe('ok')
    expect(JSON.parse(await readFile(path, 'utf8')).output.gloss).toEqual(['to wait'])
  })

  it('never constructs a BedrockRuntimeClient when send is injected', async () => {
    const a = ai(fakeSend(nova('gloss-v3-ok')))
    await a.gloss(REQ)
    await a.quiz([], 'de', 'en')
    expect(sdk.constructed).toBe(0)
  })

  it('retries once with temperature 0.00001 when Bedrock rejects temperature 0, and keeps it for the rest of the process', async () => {
    expect(TEMPERATURE).toBe(0)
    expect(currentTemperature()).toBe(0)
    const temps: Array<number | undefined> = []
    const send: BedrockSend = vi.fn(async (input: ConverseCommandInput) => {
      temps.push(input.inferenceConfig?.temperature)
      if (input.inferenceConfig?.temperature === 0) throw Object.assign(new Error('1 validation error detected: Value at \'inferenceConfig.temperature\' failed to satisfy constraint: Member must have value greater than or equal to 1.0E-5'), { name: 'ValidationException' })
      return nova('gloss-v3-ok')
    })
    const a = ai(send)
    expect((await a.gloss(REQ)).status).toBe('ok')
    expect(temps).toEqual([0, TEMPERATURE_FLOOR])
    expect(currentTemperature()).toBe(0.00001)
    expect(logs.some((l) => l.includes('temperature 0 rejected'))).toBe(true)
    expect(a.cost().calls).toBe(1)
    await createAi({ send, model: MODEL, cacheDir: dir, log: () => {} }).gloss({ ...REQ, cue: 'Warte hier auf mich.', word: 'Warte' })
    expect(temps).toEqual([0, 0.00001, 0.00001])
    resetTemperature()
    const other: BedrockSend = vi.fn(async () => { throw Object.assign(new Error('malformed toolConfig'), { name: 'ValidationException' }) })
    await expect(ai(other).gloss({ ...REQ, cue: 'Noch eine Zeile mit warte.' })).rejects.toThrow('malformed toolConfig')
    expect(other).toHaveBeenCalledTimes(1)
  })

  it('reasoning low sends reasoningConfig in additionalModelRequestFields and raises gloss maxTokens to 2000', async () => {
    const send = fakeSend(withCard(OK_CARD))
    await createAi({ send, model: 'us.amazon.nova-2-lite-v1:0', reasoning: 'low', cacheDir: dir, log: () => {} }).gloss(REQ)
    const input = send.mock.calls[0]![0]
    expect(input.additionalModelRequestFields).toEqual({ reasoningConfig: { type: 'enabled', maxReasoningEffort: 'low' } })
    expect(input.inferenceConfig?.maxTokens).toBe(2000)
    const off = fakeSend(withCard(OK_CARD))
    await createAi({ send: off, model: 'us.amazon.nova-2-lite-v1:0', cacheDir: join(dir, 'off'), log: () => {} }).gloss(REQ)
    expect(off.mock.calls[0]![0].additionalModelRequestFields).toBeUndefined()
    expect(off.mock.calls[0]![0].inferenceConfig?.maxTokens).toBe(500)
  })

  it('reasoning is part of the cache key', async () => {
    const send = fakeSend(withCard(OK_CARD))
    const mk = (reasoning: 'off' | 'low') => createAi({ send, model: 'us.amazon.nova-2-lite-v1:0', reasoning, cacheDir: dir, log: () => {} })
    await mk('off').gloss(REQ)
    await mk('low').gloss(REQ)
    expect(send).toHaveBeenCalledTimes(2)
    await mk('low').gloss(REQ)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('G-NONWORD: an invented German gloss is retried once with the issue, then rejected (en → de, injected lexicon)', async () => {
    const roast = { word: 'roast', lemma: 'roast', cue: 'Or a weenie roast.', lang: 'en' as const, native: 'de', level: 'A2' as const }
    const bad = { sense: 'an outdoor party where food is cooked', pos: 'noun', gloss: ['Bratfest'], register: 'neutral', plural: 'roasts', example: 'We had a roast in the park.' }
    const good = { ...bad, gloss: ['Grillfest'] }
    const lexicon = async () => ({ inFreq: (s: string) => ['fest', 'grillfest'].includes(s.toLowerCase()), lookup: () => undefined })
    const mk = (send: BedrockSend) => createAi({ send, model: MODEL, cacheDir: dir, log: () => {}, germanLexicon: lexicon })
    const retry = fakeSend(withCard(bad), withCard(good))
    const r = await mk(retry).gloss(roast)
    expect(r).toMatchObject({ status: 'ok', attempts: 2 })
    expect(userTexts(retry, 1).at(-1)).toContain('G-NONWORD: "Bratfest"')
    const twice = fakeSend(withCard(bad))
    const r2 = await createAi({ send: twice, model: MODEL, cacheDir: join(dir, 'b'), log: () => {}, germanLexicon: lexicon }).gloss(roast)
    expect(r2.status).toBe('rejected')
    expect(r2.issues.join(' ')).toContain('G-NONWORD')
  })

  it('a fixed expression is marked as one span and sent with phrase: true and its note; a phrase card needs no forms', async () => {
    const card = { sense: 'a sale of collected second-hand things', pos: 'phrase', gloss: ['Wohltätigkeitsbasar'], register: 'neutral', example: 'The scavenger sale made a lot of money.' }
    const send = fakeSend(withCard(card))
    const r = await createAi({ send, model: MODEL, cacheDir: dir, log: () => {}, germanLexicon: false }).gloss({ word: 'scavenger sale', lemma: 'scavenger sale', cue: 'on Friday to fix up\nthat scavenger sale?', lang: 'en', native: 'de', level: 'A2', phrase: { note: 'a sale of collected things' } })
    expect(r).toMatchObject({ status: 'ok', gloss: { gloss: 'Wohltätigkeitsbasar', grammar: 'Redewendung' } })
    expect(JSON.parse(userTexts(send)[0]!)).toEqual({ line: 'on Friday to fix up that [[scavenger sale]]?', word: 'scavenger sale', lemma: 'scavenger sale', phrase: true, note: 'a sale of collected things' })
    expect(glossSystemPrompt('en', 'de', 'A2', 'x')).toMatch(/"phrase" is true.*gloss the whole expression as a unit/s)
  })

  it('puts a more precise compound gloss first ("Nadel, Pinnnadel" → "Pinnnadel"); the prompt asks for the most specific word first', async () => {
    const tacks = { sense: 'a short pin', pos: 'noun', gloss: ['Nadel', 'Pinnnadel'], register: 'neutral', plural: 'tacks', example: 'I need more tacks for the board.' }
    const send = fakeSend(withCard(tacks))
    const r = await createAi({ send, model: MODEL, cacheDir: dir, log: () => {}, germanLexicon: false }).gloss({ word: 'tacks', lemma: 'tack', cue: 'Got any more tacks?', lang: 'en', native: 'de', level: 'A2' })
    expect(r).toMatchObject({ status: 'ok', gloss: { gloss: 'Pinnnadel' } })
    expect(glossSystemPrompt('en', 'de', 'A2', 'x')).toMatch(/most specific and precise/)
  })
})
