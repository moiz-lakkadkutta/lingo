import type { ToolConfiguration } from '@aws-sdk/client-bedrock-runtime'
import { Gloss, glossIssues, isSoftGlossIssue, type Lang, type Level } from '@lingo/contracts'
import { cacheKey, normalizeCue, type CacheEntry } from './cache'
import { askWithRetry, type AiDeps } from './call'
import { AiSchemaError } from './errors'
import { languageName } from './lang'

/** Bump whenever glossSystemPrompt() or the tool spec changes: it is part of the cache key (a sha256 snapshot test enforces it). */
export const GLOSS_PROMPT_VERSION = 2 // v2: grammar-note labels in the learner's language (review M2)
export const GLOSS_TOOL = 'explain_word'

/** Part-of-speech labels in the learner's language (word forms stay in the target language). Natives without a table use English
 *  examples, and the prompt tells Nova to write the labels in the learner's language anyway. */
interface Labels { noun: string; pl: string; verb: string; separable: string; phrasal: string; irregular: string; adjective: string; comparative: string }
const LABELS: Record<string, Labels> = {
  en: { noun: 'noun', pl: 'pl.', verb: 'verb', separable: 'separable verb', phrasal: 'phrasal verb', irregular: 'irregular verb', adjective: 'adjective', comparative: 'comparative' },
  de: { noun: 'Nomen', pl: 'Pl.', verb: 'Verb', separable: 'trennbares Verb', phrasal: 'Phrasal Verb', irregular: 'unregelmäßiges Verb', adjective: 'Adjektiv', comparative: 'Komparativ' },
}

function conventions(lang: Lang, native: string): string {
  const L = LABELS[native] ?? LABELS.en!
  const tail = `Write the part-of-speech labels in ${languageName(native)}; keep the word forms in ${languageName(lang)}.`
  if (lang === 'de') return `Conventions: nouns → "${L.noun}, die Stunde, ${L.pl} Stunden" (article and plural); verbs → "${L.verb}, warten, wartete, hat gewartet", separable verbs → "${L.separable}: an|rufen"; adjectives → "${L.adjective}, ${L.comparative} schneller"; other words → part of speech plus one note. ${tail}`
  return `Conventions: nouns → "${L.noun}, ${L.pl} hours" (mention irregular plurals); verbs → "${L.verb}, wait, waited, waited", phrasal verbs → "${L.phrasal}: give up", irregular verbs → "${L.irregular}: go, went, gone"; adjectives → "${L.adjective}, ${L.comparative} faster"; other words → part of speech plus one note. ${tail}`
}

/** LING-002 plan §3.1, verbatim. */
export function glossSystemPrompt(lang: Lang, native: string, level: Level, word: string, lemma: string): string {
  const T = languageName(lang), N = languageName(native)
  return [
    `You are a ${T} teacher writing a tiny dictionary card for one word in a subtitle line.`,
    `The learner's level is about ${level} (CEFR, approximate — estimated from word frequency). The learner speaks ${N}.`,
    'You receive JSON: {"word": the word as it appears, "lemma": its dictionary form, "cue": the subtitle line it appears in}.',
    `Call the tool ${GLOSS_TOOL} exactly once with:`,
    `- gloss: the meaning of the word AS USED IN THIS LINE, written in ${N}. At most 6 words. Not a sentence: no period, no quotes, no ${T} words. If the word is spelled the same in ${N}, add a short clarifier in parentheses.`,
    `- grammar: one grammar note in ${N}, at most 14 words, naming the part of speech and the one fact a learner needs next. ${conventions(lang, native)}`,
    `- example: one new sentence in ${T} at level ${level} that uses "${word}" or another form of "${lemma}". Not the given line. Everyday situation, no names of people, at most 12 words.`,
    'Be precise and short. Output only the tool call.',
  ].join('\n')
}

/** Nova's inputSchema top level may contain only type, properties, required. */
export function glossToolConfig(): ToolConfiguration {
  return {
    tools: [{ toolSpec: {
      name: GLOSS_TOOL,
      description: 'Record the dictionary card for the word: gloss, grammar note and example sentence.',
      inputSchema: { json: {
        type: 'object',
        properties: {
          gloss: { type: 'string', description: "Meaning in the learner's language, at most 6 words, no sentence" },
          grammar: { type: 'string', description: "Grammar note in the learner's language, at most 14 words" },
          example: { type: 'string', description: 'One new sentence in the target language using the word, at most 12 words' },
        },
        required: ['gloss', 'grammar', 'example'],
      } },
    } }],
    toolChoice: { tool: { name: GLOSS_TOOL } },
  }
}

export type GlossDeps = AiDeps
export type GlossFn = (word: string, lemma: string, cue: string, lang: Lang, native: string, level: Level) => Promise<Gloss>

/** Cache → call → Gloss.safeParse + glossIssues → on issues retry ONCE with feedback → on second failure throw AiSchemaError. */
export function makeGloss(d: GlossDeps): GlossFn {
  return async (word, lemma, cue, lang, native, level) => {
    const line = normalizeCue(cue)
    const ctx = { word, lemma, cue: line }
    // word is deliberately not part of the key (ticket: keyed by lemma + cue); level is, because the example depends on it.
    // Two forms of one lemma in the same cue therefore share an entry; accepted: the card describes the lemma in that line.
    const identity = { kind: 'gloss', v: GLOSS_PROMPT_VERSION, model: d.model, lang, native, level, lemma, cue: line }
    const key = cacheKey(identity)
    const hit = await d.cache.get('gloss', key, Gloss)
    if (hit) {
      if (!glossIssues(hit.output, ctx).filter((i) => !isSoftGlossIssue(i)).length) { d.ledger.hit(); d.log(`ai gloss ${lemma} cached`); return hit.output }
      await d.cache.delete('gloss', key)
    }
    const r = await askWithRetry(d, {
      kind: 'gloss', label: lemma, system: glossSystemPrompt(lang, native, level, word, lemma), payload: { word, lemma, cue: line },
      toolName: GLOSS_TOOL, toolConfig: glossToolConfig(), maxTokens: 300, schema: Gloss, check: (g) => glossIssues(g, ctx), soft: isSoftGlossIssue,
    })
    if (!r.ok) throw new AiSchemaError('gloss', r.issues, r.lastOutput)
    const entry: CacheEntry<Gloss> = { v: 1, kind: 'gloss', identity, model: d.model, output: r.output, usage: r.usage, at: d.now().toISOString() }
    await d.cache.set('gloss', key, entry)
    return r.output
  }
}
