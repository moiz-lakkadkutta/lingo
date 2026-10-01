import type { ToolConfiguration } from '@aws-sdk/client-bedrock-runtime'
import { QuizPlan, quizCounts, quizPlanIssues, type Lang, type PreparedQuizItem, type QuizCounts, type QuizHighlight, type QuizPlanItem, type QuizSet } from '@lingo/contracts'
import { cacheKey, normalizeCue, type CacheEntry } from './cache'
import { askWithRetry, type AiDeps } from './call'
import { languageName } from './lang'
import { fnv1a, seededShuffle } from './seed'

/** Bump whenever quizSystemPrompt() or the tool spec changes: it is part of the cache key (a sha256 snapshot test enforces it). */
export const QUIZ_PROMPT_VERSION = 1
export const QUIZ_TOOL = 'plan_quiz'

/** = prepare.ts's call shape. */
export type QuizCueInput = { index: number; text: string; native: string; highlights: Array<{ word: string; gloss: string }> }

/** Flatten in cue order, dedupe by word.toLowerCase() keeping the first; id = position. */
export function flattenHighlights(cues: QuizCueInput[]): QuizHighlight[] {
  const out: QuizHighlight[] = []
  const seen = new Set<string>()
  for (const c of [...cues].sort((a, b) => a.index - b.index)) {
    for (const h of c.highlights) {
      const k = h.word.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ id: out.length, cueIndex: c.index, word: h.word, gloss: h.gloss, cue: c.text })
    }
  }
  return out
}

/** LING-002 plan §3.2, verbatim. */
export function quizSystemPrompt(lang: Lang, native: string, counts: QuizCounts): string {
  const T = languageName(lang), N = languageName(native)
  return [
    `You are a ${T} teacher choosing vocabulary quiz items from one video clip's subtitles for a learner who speaks ${N}.`,
    `You receive JSON {"highlights":[{"id","word","gloss","cue"}]}: the words the learner saw highlighted, each with its ${N} gloss and the subtitle line it appeared in.`,
    `Call the tool ${QUIZ_TOOL} exactly once with "items":`,
    `- exactly ${counts.meaning} items with "kind":"meaning": the learner sees the word and picks its gloss among 4. "distractorIds" = 3 OTHER highlight ids whose glosses are plausible but clearly different in meaning (prefer the same part of speech; never a synonym of the correct gloss).`,
    `- exactly ${counts.cloze} items with "kind":"cloze": the learner sees the line with the word blanked and picks the word among 4. "distractorIds" = 3 OTHER highlight ids whose words would fit the line grammatically but not in meaning (prefer the same part of speech; never a word that also makes the line true).`,
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

/** Pure. Meaning items in plan order, then cloze items; options shuffled with a seed from (lang, native, kind, cueIndex, word). */
export function buildQuizItems(plan: QuizPlan, H: QuizHighlight[], lang: Lang, native: string): PreparedQuizItem[] {
  const build = (it: QuizPlanItem): PreparedQuizItem => {
    const h = H[it.highlightId]!
    const field = it.kind === 'meaning' ? 'gloss' : 'word'
    const correct = h[field]
    const options = seededShuffle([correct, ...it.distractorIds.map((id) => H[id]![field])], fnv1a(`${lang}|${native}|${it.kind}|${h.cueIndex}|${h.word}`))
    return { kind: it.kind, prompt: it.kind === 'meaning' ? h.word : clozePrompt(h.cue, h.word), options, answer: options.indexOf(correct), cueIndex: h.cueIndex }
  }
  return [...plan.items.filter((i) => i.kind === 'meaning'), ...plan.items.filter((i) => i.kind === 'cloze')].map(build)
}

/**
 * Deterministic plan: meaning = H[0..counts.meaning), cloze = H[0..counts.cloze); distractors for H[i] = the next ids cyclically,
 * skipping any whose gloss (meaning) / word (cloze) duplicates one already chosen or the correct one; an item that cannot reach 3 is dropped.
 */
export function fallbackPlan(H: QuizHighlight[], counts: QuizCounts): QuizPlan {
  const items: QuizPlanItem[] = []
  for (const kind of ['meaning', 'cloze'] as const) {
    const key = (h: QuizHighlight) => (kind === 'meaning' ? h.gloss : h.word).trim().toLowerCase()
    for (let i = 0; i < Math.min(counts[kind], H.length); i++) {
      const seen = new Set([key(H[i]!)])
      const distractorIds: number[] = []
      for (let step = 1; step < H.length && distractorIds.length < 3; step++) {
        const j = (i + step) % H.length
        const k = key(H[j]!)
        if (seen.has(k)) continue
        seen.add(k)
        distractorIds.push(j)
      }
      if (distractorIds.length === 3) items.push({ kind, highlightId: i, distractorIds })
    }
  }
  return { items }
}

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
    const counts = quizCounts(H.length)
    if (counts.meaning === 0) { d.log(`quiz: skipped, ${H.length} highlights < 4`); return { items: [] } }
    const identity = { kind: 'quiz', v: QUIZ_PROMPT_VERSION, model: d.model, lang, native, highlights: H.map((h) => [h.cueIndex, h.word, h.gloss, normalizeCue(h.cue)]) }
    const key = cacheKey(identity)
    const check = (p: QuizPlan) => quizPlanIssues(p, H, counts)
    let plan: QuizPlan | undefined
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
          payload: { highlights: H.map((h) => ({ id: h.id, word: h.word, gloss: h.gloss, cue: normalizeCue(h.cue) })) },
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
        plan = fallbackPlan(H, counts)
        d.log(`quiz: fallback builder used: ${reason}`)
      }
    }
    return { items: buildQuizItems(plan, H, lang, native) }
  }
}
