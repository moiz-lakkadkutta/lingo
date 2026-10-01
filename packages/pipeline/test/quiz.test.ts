import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PreparedQuizItem, QuizPlan, quizCounts, type QuizHighlight } from '@lingo/contracts'
import { createAi } from '../src/ai/index'
import { buildQuizItems, clozePrompt, fallbackPlan, flattenHighlights, QUIZ_PROMPT_VERSION, quizSystemPrompt } from '../src/ai/quiz'
import { fakeSend, nova, QUIZ_CUES, userTexts } from './novaFake'

let dir: string
let logs: string[]
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'lingo-quiz-')); logs = [] })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })
const ai = (send: ReturnType<typeof fakeSend>) => createAi({ send, model: 'us.amazon.nova-lite-v1:0', cacheDir: dir, log: (m) => logs.push(m), now: () => new Date('2026-10-01T12:00:00Z') })
const H = flattenHighlights(QUIZ_CUES)
const okPlan = () => QuizPlan.parse((nova('quiz-ok').output!.message!.content![0]!.toolUse!.input))

describe('quiz', () => {
  it('flattenHighlights keeps cue order, assigns ids from 0 and dedupes words case-insensitively', () => {
    expect(H.map((h) => h.word)).toEqual(['warte', 'Stunden', 'suche', 'Schlüssel', 'rufe', 'morgen', 'vergesse', 'immer', 'Zug', 'Bahnhof'])
    expect(H.map((h) => h.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(H[1]).toEqual({ id: 1, cueIndex: 0, word: 'Stunden', gloss: 'hours', cue: 'Ich warte seit zwei\nStunden auf dich.' })
    expect(H[9]!.cueIndex).toBe(4)
    expect(flattenHighlights([QUIZ_CUES[2]!, QUIZ_CUES[0]!]).map((h) => h.cueIndex)).toEqual([0, 0, 2, 2])
  })

  it('returns { items: [] } and makes no call when fewer than 4 highlights', async () => {
    const send = fakeSend(nova('quiz-ok'))
    const a = ai(send)
    expect(await a.quiz(QUIZ_CUES.slice(0, 1).concat(QUIZ_CUES.slice(5)), 'de', 'en')).toEqual({ items: [] })
    expect(send).not.toHaveBeenCalled()
    expect(a.cost()).toEqual({ calls: 0, cachedCalls: 0, inputTokens: 0, outputTokens: 0, usd: 0 })
    expect(logs).toEqual(['quiz: skipped, 2 highlights < 4'])
  })

  it('builds 6 meaning + 4 cloze items from a valid plan: prompts, 4 distinct options, answer index points at the correct gloss/word, cueIndex = the highlight cue', async () => {
    const send = fakeSend(nova('quiz-ok'))
    const { items } = await ai(send).quiz(QUIZ_CUES, 'de', 'en')
    expect(send).toHaveBeenCalledTimes(1)
    const input = send.mock.calls[0]![0]
    expect(input.toolConfig?.toolChoice).toEqual({ tool: { name: 'plan_quiz' } })
    expect(input.inferenceConfig).toEqual({ maxTokens: 1500, temperature: 0 })
    expect(input.system).toEqual([{ text: quizSystemPrompt('de', 'en', { meaning: 6, cloze: 4 }) }])
    expect(JSON.parse(userTexts(send)[0]!).highlights[0]).toEqual({ id: 0, word: 'warte', gloss: 'wait', cue: 'Ich warte seit zwei Stunden auf dich.' })
    expect(items.map((i) => i.kind)).toEqual(['meaning', 'meaning', 'meaning', 'meaning', 'meaning', 'meaning', 'cloze', 'cloze', 'cloze', 'cloze'])
    const plan = okPlan()
    items.forEach((item, n) => {
      const h = H[plan.items[n]!.highlightId]!
      expect(new Set(item.options.map((o) => o.toLowerCase())).size).toBe(4)
      expect(item.cueIndex).toBe(h.cueIndex)
      if (item.kind === 'meaning') {
        expect(item.prompt).toBe(h.word)
        expect(item.options[item.answer]).toBe(h.gloss)
        expect(item.options.sort()).toEqual([h.gloss, ...plan.items[n]!.distractorIds.map((d) => H[d]!.gloss)].sort())
      } else {
        expect(item.prompt).toBe(clozePrompt(h.cue, h.word))
        expect(item.prompt).toContain('____')
        expect(item.options[item.answer]).toBe(h.word)
      }
    })
    expect(items[6]!.prompt).toBe('Ich ____ seit zwei Stunden auf dich.')
    expect(items[9]!.prompt).toBe('Ich suche meinen ____.')
  })

  it('clozePrompt blanks only the first whole-word occurrence, keeps punctuation and joins lines with a space', () => {
    expect(clozePrompt('Ich warte seit zwei\nStunden auf dich.', 'Stunden')).toBe('Ich warte seit zwei ____ auf dich.')
    expect(clozePrompt('Warte, warte, ich warte!', 'warte')).toBe('Warte, ____, ich warte!')
    expect(clozePrompt('Er wartet. Ich warte.', 'warte')).toBe('Er wartet. Ich ____.')
    expect(clozePrompt('Am Bahnhof, nicht im Zug.', 'Zug')).toBe('Am Bahnhof, nicht im ____.')
    expect(clozePrompt('Größe (1.5) zählt.', 'Größe')).toBe('____ (1.5) zählt.')
    expect(clozePrompt('Ist das a.m. oder p.m.?', 'a.m.')).toBe('Ist das ____ oder p.m.?')
    expect(() => clozePrompt('Ich wartete.', 'warte')).toThrow()
  })

  it('option order is deterministic for the same input and differs between items', () => {
    const a = buildQuizItems(okPlan(), H, 'de', 'en')
    expect(buildQuizItems(okPlan(), H, 'de', 'en')).toEqual(a)
    expect(new Set(a.map((i) => i.answer)).size).toBeGreaterThan(1)
    expect(new Set(a.map((i) => i.options.join('|'))).size).toBe(a.length)
    // seed includes lang/native: another pair may reorder
    const other = buildQuizItems(okPlan(), H, 'de', 'tr')
    expect(other.map((i) => [...i.options].sort())).toEqual(a.map((i) => [...i.options].sort()))
  })

  it('builds items with exactly the PreparedQuizItem keys and no feedback text', () => {
    for (const item of buildQuizItems(okPlan(), H, 'de', 'en')) {
      expect(Object.keys(item).sort()).toEqual(['answer', 'cueIndex', 'kind', 'options', 'prompt'])
      expect(PreparedQuizItem.strict().parse(item)).toEqual(item)
    }
  })

  it('retries once with issues when the plan has the wrong counts (fixture quiz-bad), then falls back to fallbackPlan and logs it', async () => {
    const send = fakeSend(nova('quiz-bad'), nova('quiz-bad'))
    const a = ai(send)
    const { items } = await a.quiz(QUIZ_CUES, 'de', 'en')
    expect(send).toHaveBeenCalledTimes(2)
    expect(userTexts(send, 1)[1]).toMatch(/^Your previous tool call was rejected: expected exactly 6 "meaning" items, got 5/)
    expect(userTexts(send, 1)[1]).toMatch(/Call plan_quiz again with a corrected answer\.$/)
    expect(items).toEqual(buildQuizItems(fallbackPlan(H, quizCounts(H.length)), H, 'de', 'en'))
    expect(items).toHaveLength(10)
    expect(logs.some((l) => l.startsWith('quiz: fallback builder used: expected exactly 6 "meaning" items, got 5'))).toBe(true)
    expect(a.cost().calls).toBe(2)
    expect(await readdir(join(dir, 'quiz')).catch(() => [])).toEqual([])
  })

  it('fallbackPlan uses the first M/C highlights with cyclic distinct distractors and drops an item that cannot reach 3', () => {
    const plan = fallbackPlan(H, { meaning: 6, cloze: 4 })
    expect(plan.items.filter((i) => i.kind === 'meaning').map((i) => [i.highlightId, i.distractorIds])).toEqual([[0, [1, 2, 3]], [1, [2, 3, 4]], [2, [3, 4, 5]], [3, [4, 5, 6]], [4, [5, 6, 7]], [5, [6, 7, 8]]])
    expect(plan.items.filter((i) => i.kind === 'cloze').map((i) => i.highlightId)).toEqual([0, 1, 2, 3])
    const h = (id: number, word: string, gloss: string): QuizHighlight => ({ id, cueIndex: id, word, gloss, cue: `x ${word} y` })
    // cyclic wrap + skipping a gloss already chosen
    const five = [h(0, 'a', 'x'), h(1, 'b', 'y'), h(2, 'c', 'Y'), h(3, 'd', 'z'), h(4, 'e', 'w')]
    expect(fallbackPlan(five, { meaning: 5, cloze: 0 }).items.map((i) => i.distractorIds)).toEqual([[1, 3, 4], [3, 4, 0], [3, 4, 0], [4, 0, 1], [0, 1, 3]])
    // only 3 distinct glosses among 4 highlights: no meaning item can reach 3 distractors; cloze words are distinct
    const four = [h(0, 'a', 'x'), h(1, 'b', 'y'), h(2, 'c', 'y'), h(3, 'd', 'z')]
    const p = fallbackPlan(four, { meaning: 4, cloze: 4 })
    expect(p.items.filter((i) => i.kind === 'meaning')).toEqual([])
    expect(p.items.map((i) => [i.highlightId, i.distractorIds])).toEqual([[0, [1, 2, 3]], [1, [2, 3, 0]], [2, [3, 0, 1]], [3, [0, 1, 2]]])
  })

  it('falls back (not throws) when send rejects with a ValidationException', async () => {
    const send = vi.fn(async () => { throw Object.assign(new Error('temperature out of range'), { name: 'ValidationException' }) })
    const { items } = await createAi({ send, cacheDir: dir, log: (m) => logs.push(m) }).quiz(QUIZ_CUES, 'de', 'en')
    expect(send).toHaveBeenCalledTimes(1)
    expect(items).toEqual(buildQuizItems(fallbackPlan(H, quizCounts(H.length)), H, 'de', 'en'))
    expect(logs).toContain('quiz: fallback builder used: ValidationException: temperature out of range')
  })

  it('caches the plan, not the items; a cached plan rebuilds identical items', async () => {
    const send = fakeSend(nova('quiz-ok'))
    const first = await ai(send).quiz(QUIZ_CUES, 'de', 'en')
    const files = await readdir(join(dir, 'quiz'))
    expect(files).toHaveLength(1)
    const entry = JSON.parse(await readFile(join(dir, 'quiz', files[0]!), 'utf8'))
    expect(entry.output).toEqual(okPlan())
    expect(entry.kind).toBe('quiz')
    const send2 = fakeSend(nova('quiz-ok'))
    const a2 = ai(send2)
    expect(await a2.quiz(QUIZ_CUES, 'de', 'en')).toEqual(first)
    expect(send2).not.toHaveBeenCalled()
    expect(a2.cost()).toMatchObject({ calls: 0, cachedCalls: 1 })
    expect(logs.at(-1)).toBe('ai quiz clip cached')
  })

  it('QUIZ_PROMPT_VERSION must be bumped when the system prompt changes (sha256 snapshot)', () => {
    const sha = createHash('sha256').update(quizSystemPrompt('de', 'en', { meaning: 6, cloze: 4 })).digest('hex')
    // If this fails because you edited the prompt: bump QUIZ_PROMPT_VERSION and update both values here.
    expect({ version: QUIZ_PROMPT_VERSION, sha }).toEqual({ version: 1, sha: 'dc3d9a9bf072185a9a56d3a204fdbe0af9d7a14346eecf1d98a397639955ff23' })
  })
})
