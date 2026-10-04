import type { ToolConfiguration } from '@aws-sdk/client-bedrock-runtime'
import { type ClozeContext, distractorIssue, QUIZ_MAX_PER_WINDOW, quizEligible, QuizPlan, quizCounts, quizPlanIssues, quizThird, quizWindow, type Lang, type Pos, type QuizSpread, type PreparedQuizItem, type QuizCounts, type QuizHighlight, type QuizPlanItem, type QuizSet } from '@lingo/contracts'
import { cacheKey, normalizeCue, type CacheEntry } from './cache'
import { askWithRetry, type AiDeps } from './call'
import { languageName } from './lang'
import { fnv1a, seededShuffle } from './seed'

/** Bump whenever quizSystemPrompt() or the tool spec changes: it is part of the cache key (a sha256 snapshot test enforces it). */
export const QUIZ_PROMPT_VERSION = 4 // v2: pos per highlight; v3: same-pos distractors, spread over the clip; v4: cloze grammar and no second true answer (LING-002 Gate C)
export const QUIZ_TOOL = 'plan_quiz'

/** = prepare.ts's call shape (built by quizInput() in ./glossClip): only status-ok cards, gloss = the card's first headword. */
export type QuizCueInput = { index: number; text: string; native: string; highlights: Array<{ word: string; lemma: string; pos: Pos; gloss: string; number?: 'sg' | 'pl'; gender?: 'der' | 'die' | 'das' }> }

/** Flatten in cue order, dedupe by lemma (case-insensitive) keeping the first, so two forms of one lemma never meet; id = position. */
export function flattenHighlights(cues: QuizCueInput[]): QuizHighlight[] {
  const out: QuizHighlight[] = []
  const seen = new Set<string>()
  for (const c of [...cues].sort((a, b) => a.index - b.index)) {
    for (const h of c.highlights) {
      const k = h.lemma.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ id: out.length, cueIndex: c.index, word: h.word, lemma: h.lemma, pos: h.pos, gloss: h.gloss, cue: c.text, ...(h.number ? { number: h.number } : {}), ...(h.gender ? { gender: h.gender } : {}) })
    }
  }
  return out
}

/** LING-002 plan §3.2, verbatim. */
export function quizSystemPrompt(lang: Lang, native: string, counts: QuizCounts): string {
  const T = languageName(lang), N = languageName(native)
  return [
    `You are a ${T} teacher choosing vocabulary quiz items from one video clip's subtitles for a learner who speaks ${N}.`,
    `You receive JSON {"highlights":[{"id","cueIndex","word","pos","gloss","cue"}],"cueRange":{"cueMin","cueMax"},"window"}: the words the learner saw highlighted, each with the index of its subtitle line, its part of speech, its ${N} gloss and the line itself, plus the clip's range of line indexes.`,
    `Call the tool ${QUIZ_TOOL} exactly once with "items":`,
    `- ${counts.meaning} items with "kind":"meaning": the learner sees the word and picks its gloss among 4. "distractorIds" = 3 OTHER highlight ids with the SAME "pos" whose glosses are plausible but clearly different in meaning (never a synonym of the correct gloss).`,
    `- ${counts.cloze} items with "kind":"cloze": the learner sees the line with the word blanked and picks the word among 4. "distractorIds" = 3 OTHER highlight ids with the SAME "pos" whose words would fit the line grammatically but not in meaning (never a word that also makes the line true, never a word already in the line). The words around the blank must not give the answer away: a distractor fits the article before the blank ("a"/"an", der/die/das) and has the same number (singular/plural) as the answer; and a word that also works as a modifier of the word after the blank ("a ____ game": tennis, baseball) is not a distractor.`,
    'Only test a highlight that has at least 3 other highlights of its "pos". Spread the items over the whole clip: cover the first, middle and last third of the cueRange, and put at most 2 items (meaning and cloze together) within any "window" consecutive cueIndex values. Give fewer items only if these rules leave no choice.',
    'Rules: never repeat a highlightId within one kind; a highlight may appear once as "meaning" and once as "cloze"; prefer lines where the blank cannot be guessed without knowing the word. Output only the tool call.',
  ].join('\n')
}

/** Nova's inputSchema top level may contain only type, properties, required. */
export function quizToolConfig(): ToolConfiguration {
  return {
    tools: [{ toolSpec: {
      name: QUIZ_TOOL,
      description: 'Record which highlights become quiz items and which other highlights serve as their distractors.',
      inputSchema: { json: {
        type: 'object',
        properties: { items: { type: 'array', items: { type: 'object',
          properties: {
            kind: { type: 'string', description: '"meaning" or "cloze"' },
            highlightId: { type: 'integer', description: 'id of the highlight being tested' },
            distractorIds: { type: 'array', items: { type: 'integer' }, description: 'exactly 3 other highlight ids' },
          },
          required: ['kind', 'highlightId', 'distractorIds'] } } },
        required: ['items'],
      } },
    } }],
    toolChoice: { tool: { name: QUIZ_TOOL } },
  }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** cue with '\n' → ' ', first whole-word (letter-bounded, case-sensitive) occurrence of word → '____'. Throws if the word is not found. */
export function clozePrompt(cue: string, word: string): string {
  const text = cue.replace(/[ \t]*\n[ \t]*/g, ' ')
  const re = new RegExp(`(^|[^\\p{L}])${escapeRe(word)}(?=[^\\p{L}]|$)`, 'u')
  if (!re.test(text)) throw new Error(`cloze: "${word}" not found as a whole word in "${text}"`)
  return text.replace(re, '$1____')
}

/**
 * Pure. Meaning items in plan order, then cloze items; options shuffled with a seed from (lang, native, kind, cueIndex, word).
 * An item that cannot be built (e.g. the word is not a whole word of its cue) throws, or, when `onDrop` is given, is left out and reported.
 */
export function buildQuizItems(plan: QuizPlan, H: QuizHighlight[], lang: Lang, native: string, onDrop?: (item: QuizPlanItem, reason: string) => void): PreparedQuizItem[] {
  const build = (it: QuizPlanItem): PreparedQuizItem => {
    const h = H[it.highlightId]!
    const field = it.kind === 'meaning' ? 'gloss' : 'word'
    const correct = h[field]
    const options = seededShuffle([correct, ...it.distractorIds.map((id) => H[id]![field])], fnv1a(`${lang}|${native}|${it.kind}|${h.cueIndex}|${h.word}`))
    const answer = options.indexOf(correct)
    // invariant: the answer is the highlight's own gloss/word, never a sibling's
    if (answer < 0 || options[answer] !== H[it.highlightId]![field]) throw new Error(`answer invariant broken for ${it.kind} item "${h.word}"`)
    return { kind: it.kind, prompt: it.kind === 'meaning' ? h.word : clozePrompt(h.cue, h.word), options, answer, cueIndex: h.cueIndex }
  }
  const out: PreparedQuizItem[] = []
  for (const it of [...plan.items.filter((i) => i.kind === 'meaning'), ...plan.items.filter((i) => i.kind === 'cloze')]) {
    if (!onDrop) { out.push(build(it)); continue }
    try { out.push(build(it)) } catch (e) { onDrop(it, e instanceof Error ? e.message : String(e)) }
  }
  return out
}

/**
 * Deterministic plan (quiz v3). Targets: only highlights with ≥ 3 same-pos peers (quizEligible), visited thirds-interleaved (first of each
 * third, then the second of each, …) so items cover the whole clip; meaning and cloze items are picked alternately, a highlight not yet
 * used by the other kind first. Distractors: the next same-pos highlights cyclically that pass distractorIssue() and repeat no option.
 * With `spread`, an item is only placed where its 10-cue window (quizWindow) still has room (≤ 2 items). An item that cannot reach 3
 * distractors or a free window is skipped, so the plan may have fewer items than `counts`.
 */
export function fallbackPlan(H: QuizHighlight[], counts: QuizCounts, spread?: QuizSpread, opts: ClozeContext & { onSkip?: (kind: 'meaning' | 'cloze', h: QuizHighlight, reason: string) => void } = {}): QuizPlan {
  const ctx: ClozeContext = { ...(opts.lang ? { lang: opts.lang } : {}), ...(opts.clipCues ? { clipCues: opts.clipCues } : {}) }
  const skippedOnce = new Set<string>()
  const E = quizEligible(H)
  const order = spread ? interleaveThirds(E, spread) : E
  const w = spread ? quizWindow(spread) : 0
  const placed: number[] = []
  const fits = (c: number) => !spread || [...Array(w).keys()].every((k) => placed.filter((p) => p >= c - k && p <= c - k + w - 1).length < QUIZ_MAX_PER_WINDOW)
  const distractors = (kind: 'meaning' | 'cloze', h: QuizHighlight): number[] | undefined => {
    const key = (x: QuizHighlight) => (kind === 'meaning' ? x.gloss : x.word).trim().toLowerCase()
    const seen = new Set([key(h)])
    const out: number[] = []
    for (let step = 1; step < H.length && out.length < 3; step++) {
      const d = H[(h.id + step) % H.length]!
      if (seen.has(key(d)) || d.lemma.toLowerCase() === h.lemma.toLowerCase() || distractorIssue(kind, h, d, ctx)) continue
      seen.add(key(d))
      out.push(d.id)
    }
    return out.length === 3 ? out : undefined
  }
  const items: QuizPlanItem[] = []
  const used = { meaning: new Set<number>(), cloze: new Set<number>() }
  const pick = (kind: 'meaning' | 'cloze'): boolean => {
    const other = kind === 'meaning' ? used.cloze : used.meaning
    const candidates = [...order.filter((h) => !other.has(h.id)), ...order.filter((h) => other.has(h.id))]
    for (const h of candidates) {
      if (used[kind].has(h.id) || !fits(h.cueIndex)) continue
      const ds = distractors(kind, h)
      if (!ds) {
        if (!skippedOnce.has(`${kind}|${h.id}`)) { skippedOnce.add(`${kind}|${h.id}`); opts.onSkip?.(kind, h, 'fewer than 3 distractors pass the rules (part of speech, grammar around the blank, no second true answer)') }
        continue
      }
      used[kind].add(h.id); placed.push(h.cueIndex)
      items.push({ kind, highlightId: h.id, distractorIds: ds })
      return true
    }
    return false
  }
  let more = true
  while (more) {
    more = false
    for (const kind of ['meaning', 'cloze'] as const) if (used[kind].size < counts[kind] && pick(kind)) more = true
  }
  return { items: [...items.filter((i) => i.kind === 'meaning'), ...items.filter((i) => i.kind === 'cloze')] }
}

function interleaveThirds(E: QuizHighlight[], spread: QuizSpread): QuizHighlight[] {
  const thirds: QuizHighlight[][] = [[], [], []]
  for (const h of [...E].sort((a, b) => a.cueIndex - b.cueIndex)) thirds[quizThird(h.cueIndex, spread)]!.push(h)
  const out: QuizHighlight[] = []
  for (let i = 0; out.length < E.length; i++) for (const t of thirds) if (t[i]) out.push(t[i]!)
  return out
}

/** The clip's cue range from the quiz input (every cue of the clip is passed, with or without highlights). */
export const spreadOf = (cues: QuizCueInput[]): QuizSpread => ({ cueMin: Math.min(...cues.map((c) => c.index)), cueMax: Math.max(...cues.map((c) => c.index)) })

export type QuizDeps = AiDeps
export type QuizFn = (cues: QuizCueInput[], lang: Lang, native: string) => Promise<QuizSet>

const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e))

/**
 * < 4 highlights → { items: [] } without a call. Else cache → call → QuizPlan + quizPlanIssues → retry ONCE with feedback →
 * on second failure or a transport error use fallbackPlan (logged). The cache stores the plan, not the items.
 */
export function makeQuiz(d: QuizDeps): QuizFn {
  return async (cues, lang, native) => {
    const H = flattenHighlights(cues)
    const E = quizEligible(H)
    for (const [pos, n] of Object.entries(H.reduce<Record<string, number>>((a, h) => ({ ...a, [h.pos]: (a[h.pos] ?? 0) + 1 }), {}))) {
      if (n < 4 && n > 0) d.log(`quiz: no items for pos ${pos}: ${n} highlight${n === 1 ? '' : 's'} < 4 (needs 3 same-pos distractors)`)
    }
    const counts = quizCounts(E.length)
    if (counts.meaning === 0) { d.log(`quiz: skipped, ${E.length} testable highlights < 4`); return { items: [] } }
    const spread = spreadOf(cues)
    const cloze: ClozeContext = { lang, clipCues: cues.map((c) => c.text) }
    const reachable = fallbackPlan(H, counts, spread, { ...cloze, onSkip: (kind, h, reason) => d.log(`quiz: skipped ${kind} item "${h.word}": ${reason}`) })
    const min = { meaning: reachable.items.filter((i) => i.kind === 'meaning').length, cloze: reachable.items.filter((i) => i.kind === 'cloze').length }
    if (min.meaning + min.cloze === 0) { d.log('quiz: skipped, no item satisfies the distractor and spread rules'); return { items: [] } }
    const identity = { kind: 'quiz', v: QUIZ_PROMPT_VERSION, model: d.model, ...(d.reasoning && d.reasoning !== 'off' ? { reasoning: d.reasoning } : {}), lang, native, spread, highlights: H.map((h) => [h.cueIndex, h.word, h.lemma, h.pos, h.gloss, normalizeCue(h.cue)]) }
    const key = cacheKey(identity)
    const check = (p: QuizPlan) => quizPlanIssues(p, H, counts, { spread, min, ...cloze })
    let plan: QuizPlan | undefined
    let usedFallback = false
    const hit = await d.cache.get('quiz', key, QuizPlan)
    if (hit) {
      if (!check(hit.output).length) { d.ledger.hit(); d.log('ai quiz clip cached'); plan = hit.output }
      else await d.cache.delete('quiz', key)
    }
    if (!plan) {
      let reason: string
      try {
        const r = await askWithRetry(d, {
          kind: 'quiz', label: 'clip', system: quizSystemPrompt(lang, native, counts),
          payload: { highlights: H.map((h) => ({ id: h.id, cueIndex: h.cueIndex, word: h.word, pos: h.pos, gloss: h.gloss, cue: normalizeCue(h.cue) })), cueRange: spread, window: quizWindow(spread) },
          toolName: QUIZ_TOOL, toolConfig: quizToolConfig(), maxTokens: 1500, schema: QuizPlan, check,
        })
        if (r.ok) {
          plan = r.output
          const entry: CacheEntry<QuizPlan> = { v: 1, kind: 'quiz', identity, model: d.model, output: r.output, usage: r.usage, at: d.now().toISOString() }
          await d.cache.set('quiz', key, entry)
        }
        reason = r.ok ? '' : r.issues.join('; ')
      } catch (e) {
        reason = errText(e)
      }
      if (!plan) {
        usedFallback = true
        plan = reachable
        d.log(`quiz: fallback builder used: ${reason}`)
      }
    }
    const items = buildQuizItems(plan, H, lang, native, (it, reason) => d.log(`quiz: dropped ${it.kind} item "${H[it.highlightId]?.word ?? it.highlightId}": ${reason}`))
    return usedFallback ? { items, fallback: true } : { items }
  }
}
