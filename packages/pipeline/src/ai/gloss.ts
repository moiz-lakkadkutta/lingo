import type { ToolConfiguration } from '@aws-sdk/client-bedrock-runtime'
import { germanGlossWords, Gloss, GlossCard, glossCardIssues, isSoftCardIssue, pruneCard, type CardContext, type Lang, type Level } from '@lingo/contracts'
import { cacheKey, normalizeCue, type CacheEntry } from './cache'
import { askWithRetry, type AiDeps } from './call'
import { cardToGloss } from './grammar'
import type { GermanLexiconFn } from './germanWords'
import { languageName } from './lang'

/**
 * Gloss prompt v3 (docs/plans/LING-002-gate-c.md §3, docs/decisions/0009 decision 3): the line with the target marked [[…]], a structured
 * card (sense first, example last), few-shot examples per target language; code renders the grammar note (./grammar.ts).
 * Nova tool use (enums, ≤ 2 nesting levels, long strings last): https://docs.aws.amazon.com/nova/latest/userguide/tool-use-definition.html
 */
/** Bump whenever glossSystemPrompt() or glossToolConfig() changes: it is part of the cache key (a sha256 snapshot test enforces it). */
export const GLOSS_PROMPT_VERSION = 6 // v3: marked target, structured card, few-shot (LING-002 Gate C); v4: referent first, spelling, all forms; v5: second gloss only if exact, plural in this sense (eval 2026-10-03); v6: previous cue as context
export const GLOSS_TOOL = 'explain_word'

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Line breaks → space, then the first whole-word (letter-bounded, case-sensitive) occurrence of word wrapped in [[…]]. Throws if absent. */
export function markTarget(cue: string, word: string): string {
  const text = normalizeCue(cue)
  const re = new RegExp(`(^|[^\\p{L}])(${escapeRe(word)})(?=[^\\p{L}]|$)`, 'u')
  if (!re.test(text)) throw new Error(`"${word}" not found as a whole word in "${text}"`)
  return text.replace(re, '$1[[$2]]')
}

const FORMS: Record<Lang, string> = {
  en: 'nouns → plural in this sense (e.g. "rackets"; "none" when the word has no plural in this sense, e.g. a sport or a mass noun); verbs → past and participle ("go" → "went", "gone"); adjectives → comparative ("nifty" → "niftier", "useful" → "more useful", "good" → "better"). Do not use {N} words in these fields.',
  de: 'nouns → article (der, die or das) and plural ("Stunden"; "none" if it has none); verbs → past = 3rd person singular Präteritum ("wartete"), participle with its auxiliary ("hat gewartet", "ist gegangen"), separable = the prefix of a separable verb ("an" for anrufen); adjectives → comparative ("schneller", "besser"; "none" if it has none). Do not use {N} words in these fields.',
}

const EXAMPLES: Record<Lang, string> = {
  en: [
    'Examples (input → tool call):',
    '{"line":"Grab your winter [[coat]], it\'s cold outside.","word":"coat","lemma":"coat"}',
    '→ {"sense":"a warm piece of clothing worn over other clothes","pos":"noun","gloss":["Mantel"],"register":"neutral","plural":"coats","example":"My coat is too warm for spring."}',
    '(Not "Wintermantel": "winter" is another word of the line.)',
    '{"line":"That\'s a [[nifty]] little gadget.","word":"nifty","lemma":"nifty"}',
    '→ {"sense":"clever and useful","pos":"adjective","gloss":["praktisch","raffiniert"],"register":"informal","comparative":"niftier","example":"This is a nifty way to save time."}',
    '{"line":"We [[tidied]] up before the guests came.","word":"tidied","lemma":"tidy"}',
    '→ {"sense":"to make a place neat (with \\"up\\")","pos":"verb","gloss":["aufräumen"],"register":"neutral","past":"tidied","participle":"tidied","example":"Please tidy your room before dinner."}',
  ].join('\n'),
  de: [
    'Examples (input → tool call):',
    '{"line":"Ich hole schnell meinen [[Regenschirm]] aus dem Auto.","word":"Regenschirm","lemma":"Regenschirm"}',
    '→ {"sense":"ein Schirm, der vor Regen schützt","pos":"noun","gloss":["umbrella"],"register":"neutral","article":"der","plural":"Regenschirme","example":"Hast du einen Regenschirm dabei?"}',
    '{"line":"Der Film war echt [[spannend]].","word":"spannend","lemma":"spannend"}',
    '→ {"sense":"so interessant, dass man mitfiebert","pos":"adjective","gloss":["exciting","thrilling"],"register":"neutral","comparative":"spannender","example":"Das Buch ist spannender als der Film."}',
    '{"line":"Ich [[rufe]] dich morgen an.","word":"rufe","lemma":"rufen"}',
    '→ {"sense":"mit jemandem telefonieren (anrufen)","pos":"verb","gloss":["to call","to phone"],"register":"neutral","past":"rief an","participle":"hat angerufen","separable":"an","example":"Kannst du mich heute Abend anrufen?"}',
  ].join('\n'),
}
/** The language the few-shot glosses are written in (en targets: German glosses; de targets: English glosses). */
const EXAMPLE_GLOSS_LANG: Record<Lang, string> = { en: 'de', de: 'en' }

function examplesBlock(lang: Lang, native: string): string {
  const ex = EXAMPLES[lang]
  if (EXAMPLE_GLOSS_LANG[lang] === native) return ex
  return `The glosses below are ${languageName(EXAMPLE_GLOSS_LANG[lang]!)}; yours must be in ${languageName(native)}.\n${ex}`
}

/** LING-002-gate-c §3.5, plus the v4 changes recorded in docs/decisions/0009 (Eval results). */
export function glossSystemPrompt(lang: Lang, native: string, level: Level, lemma: string): string {
  const T = languageName(lang), N = languageName(native)
  return [
    `You write one entry of a learner's dictionary for ONE word of a ${T} subtitle line. The learner speaks ${N}; their level is about ${level} (CEFR, approximate).`,
    '',
    'Input JSON: {"previous": the subtitle line before it (absent for the first line), "line": the subtitle line with the target word marked like [[this]], "word": the marked word exactly as it appears, "lemma": its dictionary form}.',
    'The "previous" line is context only: use it to tell what the marked word refers to (a thing or a person named there, an event), but never gloss or translate its words.',
    '',
    'Work on the marked word only. The other words of the line are context: use them to decide which sense the marked word has here, but never translate them into the gloss. When the marked word is part of a compound or fixed phrase ("tennis racket", "weenie roast", "get acquainted"), gloss only the marked part, in the sense it has inside that phrase.',
    '',
    `Call ${GLOSS_TOOL} exactly once. Fill the fields in this order:`,
    `- sense: the dictionary sense of the marked word in this line, as a short ${T} definition (at most 12 words). First decide from the line what the word refers to here (a person, a thing, an event, an action). Pick the sense this line needs, including old-fashioned, informal or slang senses. Describe the word, not the line.`,
    '- pos: the part of speech of the marked word in this line.',
    `- gloss: 1 or 2 ${N} translations of the marked word in that sense, most common first; add a second one only if it means exactly the same here. Each is a dictionary headword: one word, or two only when ${N} has no single word for it. Each is a real, correctly spelled ${N} word, with all its accents and special letters. No articles, no sentences, no explanations, no words that translate other words of the line. If the translation is spelled like the ${T} word, add a 1–3-word ${N} clarifier in parentheses, e.g. "Tennis (Sport)".`,
    '- register: neutral, informal, formal, dated or slang, for the marked word in this sense.',
    `- grammar fields: all of those for its pos and no others, with word forms in ${T}: ${FORMS[lang].replace('{N}', N)}`,
    `- example: one new ${T} sentence at level ${level} that uses the marked word (or another form of "${lemma}") in the same sense. Not the given line, no names of people, at most 12 words. The sentence must be in ${T}, never in ${N}.`,
    '',
    examplesBlock(lang, native),
    '',
    'Output only the tool call.',
  ].join('\n')
}

/** Flat schema, ≤ 2 levels, enums where possible; property order = generation order (sense first, example last). Top level: type, properties, required. */
export function glossToolConfig(lang: Lang, native: string): ToolConfiguration {
  const T = languageName(lang), N = languageName(native)
  return {
    tools: [{ toolSpec: {
      name: GLOSS_TOOL,
      description: 'Record the learner\'s dictionary entry for the marked word.',
      inputSchema: { json: {
        type: 'object',
        properties: {
          sense: { type: 'string', description: `Dictionary sense of the marked word in this line, a short definition in ${T}, at most 12 words` },
          pos: { type: 'string', enum: ['noun', 'verb', 'adjective', 'adverb', 'other'] },
          gloss: { type: 'array', items: { type: 'string' }, description: `1 or 2 ${N} headword translations of the marked word only` },
          register: { type: 'string', enum: ['neutral', 'informal', 'formal', 'dated', 'slang'] },
          article: { type: 'string', enum: ['der', 'die', 'das'], description: 'German nouns only' },
          plural: { type: 'string', description: `nouns: the plural form in ${T}; "none" if it has no plural` },
          past: { type: 'string', description: `verbs: past tense in ${T}` },
          participle: { type: 'string', description: `verbs: past participle in ${T}` },
          separable: { type: 'string', description: 'German separable verbs: the prefix, e.g. "an"' },
          comparative: { type: 'string', description: `adjectives: the comparative in ${T}; "none" if it has none` },
          example: { type: 'string', description: `One new ${T} sentence using the marked word in this sense, at most 12 words` },
        },
        required: ['sense', 'pos', 'gloss', 'register', 'example'],
      } },
    } }],
    toolChoice: { tool: { name: GLOSS_TOOL } },
  }
}

export interface GlossRequest {
  word: string; lemma: string; cue: string; nativeCue?: string; lang: Lang; native: string; level: Level; hint?: string
  /** the cue before (context only; sent as "previous", part of the cache key); absent for the first cue */
  prevCue?: string
  /** its Translate line: accepted for callers, never sent to the model and never used by the validators (0009 decision 4) */
  prevNativeCue?: string
}
export type GlossOutcome =
  | { status: 'ok' | 'soft'; card: GlossCard; gloss: Gloss; issues: string[]; /** 1 or 2 when asked now; the stored value on a cache hit */ attempts: number; cached: boolean }
  | { status: 'rejected'; issues: string[]; lastOutput: unknown; attempts: number; cached: false }
export type GlossFn = (r: GlossRequest) => Promise<GlossOutcome>
export type GlossDeps = AiDeps

export const GLOSS_MAX_TOKENS = 500

const hardIssues = (issues: string[]) => issues.filter((i) => !isSoftCardIssue(i))

/** All checks of a card in its context: glossCardIssues() plus the rendered Gloss must fit the app's limits. */
export async function cardIssues(card: GlossCard, ctx: CardContext, germanLexicon?: GermanLexiconFn): Promise<string[]> {
  const lexicon = ctx.native === 'de' && germanLexicon ? await germanLexicon(germanGlossWords(card.gloss)) : undefined
  const issues = glossCardIssues(card, lexicon ? { ...ctx, lexicon } : ctx)
  const g = Gloss.safeParse(cardToGloss(pruneCard(card, ctx.lang), ctx.lang, ctx.native, ctx.lemma))
  if (!g.success) issues.push(`G-LEN: the rendered gloss is too long (${g.error.issues.map((i) => i.message).join(', ')})`)
  return issues
}

/**
 * Cache (the card, so a renderer change never re-asks Bedrock) → call → GlossCard + cardIssues → on issues retry ONCE with feedback.
 * Never throws for a rejected card (status 'rejected'); transport errors still throw. A `hint` is a second user text block and part of the key.
 */
export function makeGloss(d: GlossDeps): GlossFn {
  return async (r) => {
    const { word, lemma, lang, native, level, hint } = r
    const line = normalizeCue(r.cue)
    const previous = r.prevCue ? normalizeCue(r.prevCue) : undefined
    const ctx: CardContext = { word, lemma, cue: line, lang, native, ...(r.nativeCue ? { nativeCue: normalizeCue(r.nativeCue) } : {}) }
    const done = (card: GlossCard, issues: string[], attempts: number, cached: boolean): GlossOutcome => {
      const c = pruneCard(card, lang)
      return { status: issues.length ? 'soft' : 'ok', card: c, gloss: cardToGloss(c, lang, native, lemma), issues, attempts, cached }
    }
    let marked: string
    try { marked = markTarget(line, word) } catch (e) {
      return { status: 'rejected', issues: [`MARK: ${(e as Error).message}`], lastOutput: null, attempts: 0, cached: false }
    }
    const identity = { kind: 'gloss', v: GLOSS_PROMPT_VERSION, model: d.model, ...(d.reasoning && d.reasoning !== 'off' ? { reasoning: d.reasoning } : {}), lang, native, level, lemma, word, cue: line, ...(previous ? { previous } : {}), ...(hint ? { hint } : {}) }
    const key = cacheKey(identity)
    const hit = await d.cache.get('gloss', key, GlossCard)
    if (hit) {
      const issues = await cardIssues(hit.output, ctx, d.germanLexicon)
      if (!hardIssues(issues).length) { d.ledger.hit(); d.log(`ai gloss ${lemma} cached`); return done(hit.output, issues, hit.attempts ?? 1, true) }
      await d.cache.delete('gloss', key)
    }
    const res = await askWithRetry(d, {
      kind: 'gloss', label: lemma, system: glossSystemPrompt(lang, native, level, lemma), payload: { ...(previous ? { previous } : {}), line: marked, word, lemma },
      ...(hint ? { extraText: [hint] } : {}),
      toolName: GLOSS_TOOL, toolConfig: glossToolConfig(lang, native), maxTokens: d.reasoning && d.reasoning !== 'off' ? 2000 : GLOSS_MAX_TOKENS,
      schema: GlossCard, check: (c) => cardIssues(c, ctx, d.germanLexicon), soft: isSoftCardIssue,
    })
    if (!res.ok) return { status: 'rejected', issues: res.issues, lastOutput: res.lastOutput, attempts: 2, cached: false }
    const entry: CacheEntry<GlossCard> = { v: 1, kind: 'gloss', identity, model: d.model, output: res.output, usage: res.usage, at: d.now().toISOString(), attempts: res.attempt }
    await d.cache.set('gloss', key, entry)
    return done(res.output, res.issues, res.attempt, false)
  }
}
