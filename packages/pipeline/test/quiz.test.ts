import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PreparedQuizItem, QuizPlan, quizCounts, quizEligible, quizPlanIssues, quizThird, spreadIssues, type QuizHighlight } from '@lingo/contracts'
import { createAi } from '../src/ai/index'
import { buildQuizItems, clozePrompt, fallbackPlan, flattenHighlights, QUIZ_PROMPT_VERSION, quizSystemPrompt, spreadOf } from '../src/ai/quiz'
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
    expect(H[1]).toEqual({ id: 1, cueIndex: 0, word: 'Stunden', lemma: 'Stunde', pos: 'noun', gloss: 'hours', cue: 'Ich warte seit zwei\nStunden auf dich.' })
    expect(H[9]!.cueIndex).toBe(4)
    expect(flattenHighlights([QUIZ_CUES[2]!, QUIZ_CUES[0]!]).map((h) => h.cueIndex)).toEqual([0, 0, 2, 2])
  })

  it('returns { items: [] } and makes no call when fewer than 4 highlights', async () => {
    const send = fakeSend(nova('quiz-ok'))
    const a = ai(send)
    expect(await a.quiz(QUIZ_CUES.slice(0, 1).concat(QUIZ_CUES.slice(5)), 'de', 'en')).toEqual({ items: [] })
    expect(send).not.toHaveBeenCalled()
    expect(a.cost()).toEqual({ calls: 0, cachedCalls: 0, inputTokens: 0, outputTokens: 0, usd: 0 })
    expect(logs).toEqual(['quiz: no items for pos verb: 1 highlight < 4 (needs 3 same-pos distractors)', 'quiz: no items for pos noun: 1 highlight < 4 (needs 3 same-pos distractors)', 'quiz: skipped, 0 testable highlights < 4'])
  })

  it('builds 6 meaning + 4 cloze items from a valid plan: prompts, 4 distinct options, answer index points at the correct gloss/word, cueIndex = the highlight cue', async () => {
    const send = fakeSend(nova('quiz-ok'))
    const { items, fallback } = await ai(send).quiz(QUIZ_CUES, 'de', 'en')
    expect(fallback).toBeUndefined()
    expect(send).toHaveBeenCalledTimes(1)
    const input = send.mock.calls[0]![0]
    expect(input.toolConfig?.toolChoice).toEqual({ tool: { name: 'plan_quiz' } })
    expect(input.inferenceConfig).toEqual({ maxTokens: 1500, temperature: 0 })
    expect(input.system).toEqual([{ text: quizSystemPrompt('de', 'en', { meaning: 6, cloze: 4 }) }])
    expect(JSON.parse(userTexts(send)[0]!).highlights[0]).toEqual({ id: 0, cueIndex: 0, word: 'warte', pos: 'verb', gloss: 'wait', cue: 'Ich warte seit zwei Stunden auf dich.' })
    expect(JSON.parse(userTexts(send)[0]!)).toMatchObject({ cueRange: { cueMin: 0, cueMax: 5 }, window: 1 })
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
    expect(items[9]!.prompt).toBe('Ich ____ immer alles.')
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

  it('retries once with issues when the plan breaks the rules (fixture quiz-bad), then falls back to fallbackPlan and logs it', async () => {
    const send = fakeSend(nova('quiz-bad'), nova('quiz-bad'))
    const a = ai(send)
    const { items, fallback } = await a.quiz(QUIZ_CUES, 'de', 'en')
    expect(fallback).toBe(true)
    expect(send).toHaveBeenCalledTimes(2)
    expect(userTexts(send, 1)[1]).toMatch(/^Your previous tool call was rejected: .*is already in the line of "Bahnhof"; 3 items within cues 1–1/)
    expect(userTexts(send, 1)[1]).toMatch(/Call plan_quiz again with a corrected answer\.$/)
    expect(items).toEqual(buildQuizItems(fallbackPlan(H, quizCounts(quizEligible(H).length), spreadOf(QUIZ_CUES)), H, 'de', 'en'))
    expect(items).toHaveLength(9)
    expect(logs.some((l) => l.startsWith('quiz: fallback builder used: '))).toBe(true)
    expect(a.cost().calls).toBe(2)
    expect(await readdir(join(dir, 'quiz')).catch(() => [])).toEqual([])
  })

  it('fallbackPlan tests only highlights with 3 same-pos peers, uses same-pos distractors, and keeps the window rule (QUIZ_CUES: 5 meaning + 4 cloze)', () => {
    const spread = spreadOf(QUIZ_CUES)
    const plan = fallbackPlan(H, { meaning: 6, cloze: 4 }, spread)
    expect(plan.items.filter((i) => i.kind === 'meaning')).toHaveLength(5)
    expect(plan.items.filter((i) => i.kind === 'cloze')).toHaveLength(4)
    for (const it of plan.items) {
      expect(['adverb']).not.toContain(H[it.highlightId]!.pos) // morgen, immer: only 2 adverbs
      for (const d of it.distractorIds) expect(H[d]!.pos).toBe(H[it.highlightId]!.pos)
    }
    expect(quizPlanIssues(plan, H, { meaning: 6, cloze: 4 }, { spread, min: { meaning: 5, cloze: 4 } })).toEqual([])
    // only 3 distinct glosses among 4 highlights: no meaning item can reach 3 distractors; cloze words are distinct
    const h = (id: number, word: string, gloss: string): QuizHighlight => ({ id, cueIndex: id, word, lemma: word, pos: 'noun', gloss, cue: `x ${word} y` })
    const four = [h(0, 'apple', 'x'), h(1, 'house', 'y'), h(2, 'river', 'y'), h(3, 'cloud', 'z')]
    const p = fallbackPlan(four, { meaning: 4, cloze: 4 })
    expect(p.items.filter((i) => i.kind === 'meaning')).toEqual([])
    expect(p.items.map((i) => [i.highlightId, i.distractorIds])).toEqual([[0, [1, 2, 3]], [1, [2, 3, 0]], [2, [3, 0, 1]], [3, [0, 1, 2]]])
  })

  it('fallbackPlan spreads items over the thirds of a 120-cue clip and keeps at most 2 items in any 10 cues', () => {
    // 12 nouns crowded at the start (cues 0–11), 3 in the middle, 3 at the end
    const cues = [...Array(12).keys(), 50, 55, 60, 100, 105, 110]
    const big: QuizHighlight[] = cues.map((c, id) => ({ id, cueIndex: c, word: `wort${String.fromCharCode(97 + id)}x${id}`, lemma: `wort${id}`, pos: 'noun', gloss: ['Haus', 'Baum', 'Tisch', 'Lampe', 'Fenster', 'Garten', 'Wolke', 'Brücke', 'Stuhl', 'Kerze', 'Spiegel', 'Teller', 'Gabel', 'Löffel', 'Kissen', 'Decke', 'Vogel', 'Fluss'][id]!, cue: `x wort${String.fromCharCode(97 + id)}x${id} y` }))
    const spread = { cueMin: 0, cueMax: 119 }
    const plan = fallbackPlan(big, { meaning: 6, cloze: 4 }, spread)
    expect(plan.items).toHaveLength(10)
    const itemCues = plan.items.map((i) => big[i.highlightId]!.cueIndex)
    expect(new Set(itemCues.map((c) => quizThird(c, spread))).size).toBe(3)
    expect(spreadIssues(itemCues, big, spread)).toEqual([])
    expect(itemCues.filter((c) => c < 12).length).toBeLessThanOrEqual(4) // ≤ 2 per 10-cue window over cues 0–11
  })

  it('a model plan that ignores the pos or the spread rules gets one retry with the issue, then the fallback', async () => {
    const bad = structuredClone(nova('quiz-ok'))
    const input = bad.output!.message!.content![0]!.toolUse!.input as { items: Array<{ distractorIds: number[] }> }
    input.items[0]!.distractorIds = [5, 4, 6] // morgen (adverb) for suche (verb)
    const send = fakeSend(bad, bad)
    const { items } = await ai(send).quiz(QUIZ_CUES, 'de', 'en')
    expect(send).toHaveBeenCalledTimes(2)
    expect(userTexts(send, 1)[1]).toMatch(/distractor 5 has pos adverb, the answer "suche" is a verb/)
    expect(items).toEqual(buildQuizItems(fallbackPlan(H, quizCounts(quizEligible(H).length), spreadOf(QUIZ_CUES)), H, 'de', 'en'))
    expect(logs.some((l) => l.startsWith('quiz: fallback builder used: '))).toBe(true)
  })

  it('a pos with fewer than 4 highlights gets no items and is logged', async () => {
    const send = fakeSend(nova('quiz-ok'))
    const { items } = await ai(send).quiz(QUIZ_CUES, 'de', 'en')
    expect(logs).toContain('quiz: no items for pos adverb: 2 highlights < 4 (needs 3 same-pos distractors)')
    expect(items.some((i) => i.prompt === 'morgen' || i.prompt === 'immer')).toBe(false)
  })

  it('falls back (not throws) when send rejects with a ValidationException', async () => {
    const send = vi.fn(async () => { throw Object.assign(new Error('malformed input'), { name: 'ValidationException' }) })
    const { items } = await createAi({ send, cacheDir: dir, log: (m) => logs.push(m) }).quiz(QUIZ_CUES, 'de', 'en')
    expect(send).toHaveBeenCalledTimes(1)
    expect(items).toEqual(buildQuizItems(fallbackPlan(H, quizCounts(quizEligible(H).length), spreadOf(QUIZ_CUES)), H, 'de', 'en'))
    expect(logs).toContain('quiz: fallback builder used: ValidationException: malformed input')
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
    expect({ version: QUIZ_PROMPT_VERSION, sha }).toEqual({ version: 4, sha: 'a28fb253e43b452c9f36312ed3d2a65d97e4d2677b8310207b22e3be928c529a' })
  })

  it('drops an item it cannot build (word not found as a whole word in its cue) instead of failing the clip, and logs why', async () => {
    const cues = QUIZ_CUES.map((c) => (c.index === 3 ? { ...c, text: 'Ich vergessen immer alles.' } : c))
    const send = fakeSend(nova('quiz-ok'))
    const { items } = await ai(send).quiz(cues, 'de', 'en')
    expect(items).toHaveLength(9)
    expect(items.filter((i) => i.kind === 'cloze')).toHaveLength(3)
    expect(items.some((i) => i.kind === 'meaning' && i.prompt === 'vergesse')).toBe(true)
    expect(logs.some((l) => l.startsWith('quiz: dropped cloze item "vergesse": cloze: "vergesse" not found'))).toBe(true)
    // the pure builder still throws when no onDrop is given
    expect(() => buildQuizItems(okPlan(), flattenHighlights(cues), 'de', 'en')).toThrow(/not found/)
  })

  it('flattenHighlights dedupes by lemma', () => {
    const cues = [{ index: 0, text: 'Ich warte hier.', native: '', highlights: [{ word: 'warte', lemma: 'warten', pos: 'verb' as const, gloss: 'wait' }] },
      { index: 1, text: 'Wir warten dort.', native: '', highlights: [{ word: 'warten', lemma: 'warten', pos: 'verb' as const, gloss: 'wait' }, { word: 'dort', lemma: 'dort', pos: 'adverb' as const, gloss: 'there' }] }]
    expect(flattenHighlights(cues).map((h) => h.word)).toEqual(['warte', 'dort'])
  })
})

describe('quiz v2 distractor rules (LING-002-gate-c §6)', () => {
  const hq = (id: number, word: string, lemma: string, gloss: string, cue: string, cueIndex = id): QuizHighlight => ({ id, cueIndex, word, lemma, pos: 'noun', gloss, cue })
  const base = [
    hq(0, 'sale', 'sale', 'Verkauf', 'to fix up that scavenger sale?'),
    hq(1, 'sal', 'sal', 'Sal', 'the scavenger sal.'),
    hq(2, 'roast', 'roast', 'Grillfest', 'Or a weenie roast.'),
    hq(3, 'weenie', 'weenie', 'Würstchen', 'Or a weenie roast.', 2),
    hq(4, 'racket', 'racket', 'Schläger', 'my tennis racket.'),
    hq(5, 'tennis', 'tennis', 'Tennisschläger', 'my tennis racket.', 4),
    hq(6, 'tacks', 'tack', 'Reißzwecken', 'Got any more tacks?'),
    hq(7, 'expense', 'expense', 'Kosten', 'not much expense,'),
    hq(8, 'rackets', 'racket', 'Schläger', 'two rackets.'),
  ]
  const one = (kind: 'meaning' | 'cloze', highlightId: number, distractorIds: number[]) => quizPlanIssues({ items: [{ kind, highlightId, distractorIds }] }, base, kind === 'meaning' ? { meaning: 1, cloze: 0 } : { meaning: 0, cloze: 1 })

  it('quizPlanIssues rejects a cloze distractor at edit distance 1 or with the same lemma as the answer (sal/sale)', () => {
    expect(one('cloze', 0, [1, 6, 7]).join(' ')).toMatch(/"sal".*too close/)
    expect(one('cloze', 4, [8, 6, 7]).join(' ')).toMatch(/"rackets".*too close/)
    expect(one('cloze', 0, [4, 6, 7])).toEqual([])
  })

  it('quizPlanIssues rejects a cloze distractor that already appears in the cue (Or a ____ roast. / roast)', () => {
    expect(one('cloze', 3, [2, 6, 7]).join(' ')).toMatch(/"roast".*already in the line/)
    expect(one('cloze', 3, [0, 6, 7])).toEqual([])
  })

  it('quizPlanIssues rejects a meaning distractor whose gloss contains the answer gloss (Schläger / Tennisschläger)', () => {
    expect(one('meaning', 4, [5, 6, 7]).join(' ')).toMatch(/"Tennisschläger".*overlaps/)
    expect(one('meaning', 4, [0, 6, 7])).toEqual([])
  })

  it('fallbackPlan honours the new distractor rules', () => {
    const plan = fallbackPlan(base, { meaning: 6, cloze: 4 })
    expect(plan.items.length).toBeGreaterThan(0)
    expect(quizPlanIssues(plan, base, { meaning: plan.items.filter((i) => i.kind === 'meaning').length, cloze: plan.items.filter((i) => i.kind === 'cloze').length })).toEqual([])
  })

  it('the answer of every meaning item is the gloss of its own highlight (invariant), never a sibling gloss', () => {
    const plan = fallbackPlan(base, { meaning: 6, cloze: 4 })
    for (const it of buildQuizItems(plan, base, 'en', 'de')) {
      const src = base.find((h) => (it.kind === 'meaning' ? h.word === it.prompt : clozePrompt(h.cue, h.word) === it.prompt))!
      expect(it.options[it.answer]).toBe(it.kind === 'meaning' ? src.gloss : src.word)
    }
  })

  it('fallbackPlan honours the cloze checks: "go to a ____ game." never offers "tennis" (noun modifier) and is skipped and logged when fewer than 3 distractors pass', () => {
    const q = (id: number, cueIndex: number, word: string, cue: string): QuizHighlight => ({ id, cueIndex, word, lemma: word, pos: 'noun', gloss: ['Baseball (Sport)', 'Tennis (Sport)', 'Faulenzer', 'Schläger', 'Wagen', 'Kosten'][id]!, cue, number: 'sg' })
    const lines = ["Wonder if she'd like to go to a baseball game.", "I'll get my tennis racket.", 'you loafer. What are you doing', 'Good picture, wagon train.', 'not much expense,']
    const E = [q(0, 0, 'baseball', lines[0]!), q(1, 1, 'tennis', lines[1]!), q(2, 2, 'loafer', lines[2]!), q(3, 1, 'racket', lines[1]!), q(4, 3, 'wagon', lines[3]!), q(5, 4, 'expense', lines[4]!)]
    const skipped: string[] = []
    const plan = fallbackPlan(E, { meaning: 0, cloze: 6 }, undefined, { lang: 'en', clipCues: lines, onSkip: (kind, h, reason) => skipped.push(`${kind} ${h.word}: ${reason}`) })
    const baseballCloze = plan.items.find((i) => i.kind === 'cloze' && i.highlightId === 0)
    expect(baseballCloze).toBeUndefined()
    expect(skipped.some((l) => l.startsWith('cloze baseball: fewer than 3 distractors'))).toBe(true)
    for (const it of plan.items) expect(quizPlanIssues({ items: [it] }, E, { meaning: 0, cloze: 1 }, { lang: 'en', clipCues: lines })).toEqual([])
  })
})
