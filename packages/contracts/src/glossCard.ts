import { z } from 'zod'
import type { Lang } from './base'
import { FUNCTION_WORDS, GERMAN_IRREGULAR_COMPARATIVES, INVARIANT_NOUNS, IRREGULAR_COMPARATIVES, IRREGULAR_PLURALS, irregularVerb, STOPWORDS } from './lexicon'
import { boundedLine, countWords, EXAMPLE_MAX_CHARS, EXAMPLE_MAX_WORDS, GLOSS_MAX_CHARS, GLOSS_MAX_WORDS, sameStem, wordsOf } from './text'

/**
 * Gloss card v3 (docs/plans/LING-002-gate-c.md §3–4, docs/decisions/0009 decisions 3–4): what Nova returns for one highlight. Code
 * renders the app's `Gloss` from it (packages/pipeline/src/ai/grammar.ts) and checks it with glossCardIssues().
 */
export const POS = z.enum(['noun', 'verb', 'adjective', 'adverb', 'other'])
export const REGISTER = z.enum(['neutral', 'informal', 'formal', 'dated', 'slang'])
export type Pos = z.infer<typeof POS>
export type Register = z.infer<typeof REGISTER>

const form = z.string().trim().min(1).max(40)

/** Nova sometimes returns "" or null for an unused optional field, or one gloss as a plain string: normalised before parsing. */
function tidy(v: unknown): unknown {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v
  const o = Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== '' && x !== null && x !== undefined))
  if (typeof o.gloss === 'string') o.gloss = o.gloss.split(/\s*[;,]\s*/).filter(Boolean)
  return o
}

const CardObject = z.object({
  sense: boundedLine(100, 12),
  pos: POS,
  gloss: z.array(boundedLine(40, 4)).min(1).max(2),
  register: REGISTER,
  article: z.enum(['der', 'die', 'das']).optional(),
  plural: form.optional(),
  past: form.optional(),
  participle: form.optional(),
  separable: z.string().trim().min(1).max(10).optional(),
  comparative: form.optional(),
  example: boundedLine(EXAMPLE_MAX_CHARS, EXAMPLE_MAX_WORDS),
}).strict()

export const GlossCard = z.preprocess(tidy, CardObject)
export type GlossCard = z.infer<typeof CardObject>

const FIELDS_BY_POS: Record<Pos, Array<keyof GlossCard>> = {
  noun: ['article', 'plural'],
  verb: ['past', 'participle', 'separable'],
  adjective: ['comparative'],
  adverb: [],
  other: [],
}
const FORM_FIELDS = ['article', 'plural', 'past', 'participle', 'separable', 'comparative'] as const

/**
 * Fields that do not belong to card.pos are removed (never rendered, never an issue): a "comparative" on a noun cannot reach the note.
 * With `lang`, German-only fields (article, separable) are also removed from an English card.
 */
export function pruneCard(c: GlossCard, lang?: Lang): GlossCard {
  const keep = new Set<string>(FIELDS_BY_POS[c.pos])
  if (lang === 'en') { keep.delete('article'); keep.delete('separable') }
  const out: Record<string, unknown> = { ...c }
  for (const f of FORM_FIELDS) if (!keep.has(f)) delete out[f]
  return out as GlossCard
}

export interface CardContext { word: string; lemma: string; cue: string; nativeCue?: string; lang: Lang; native: string }

const sentenceKey = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase().replace(/[\p{P}\s]+$/u, '')

const SOFT = ['X-USES', 'F-ART-de', 'F-PLURAL-de', 'F-COMP-de', 'F-VERB-de']
/** X-USES and every F-*-de rule: they trigger the one retry, and an answer whose only issues are soft is accepted with a warning. */
export function isSoftCardIssue(issue: string): boolean {
  return SOFT.some((id) => issue.startsWith(`${id}:`))
}

const stripParens = (s: string) => s.replace(/\([^)]*\)/g, ' ')

/** Lowercase words of s after removing a parenthesised clarifier and the function words of `native` (articles, sich, zu, to, …). */
export function contentWords(s: string, native: string): string[] {
  const fw = FUNCTION_WORDS[native] ?? FUNCTION_WORDS.en!
  return wordsOf(stripParens(s)).filter((w) => !fw.has(w))
}

/** How many words of s are in STOPWORDS[lang] (0 for a language without a list). */
export function stopwordScore(s: string, lang: string): number {
  const sw = STOPWORDS[lang as 'en' | 'de']
  return sw ? wordsOf(s).filter((w) => sw.has(w)).length : 0
}

/** big → bigg, stop → stopp (consonant-vowel-consonant ending); undefined otherwise. */
const doubled = (l: string) => (/[^aeiou][aeiou][bdgklmnprt]$/.test(l) ? l + l.at(-1)! : undefined)

/** Accepted English plurals of a noun lemma: +s, +es, consonant+y → ies, f/fe → ves, the irregular table, the lemma for invariant nouns. */
export function englishPlurals(lemma: string): string[] {
  const l = lemma.toLowerCase()
  const out = new Set([l + 's', l + 'es'])
  if (/[^aeiou]y$/.test(l)) out.add(l.slice(0, -1) + 'ies')
  if (l.endsWith('fe')) out.add(l.slice(0, -2) + 'ves')
  else if (l.endsWith('f')) out.add(l.slice(0, -1) + 'ves')
  for (const p of IRREGULAR_PLURALS[l] ?? []) out.add(p)
  if (INVARIANT_NOUNS.has(l)) out.add(l)
  return [...out]
}

/** Accepted English comparatives: +er, +r, y → ier, doubled consonant + er, "more " + lemma, the irregular table. */
export function englishComparatives(lemma: string): string[] {
  const l = lemma.toLowerCase()
  const out = new Set([l + 'er', l + 'r', `more ${l}`])
  if (l.endsWith('y')) out.add(l.slice(0, -1) + 'ier')
  const d = doubled(l)
  if (d) out.add(d + 'er')
  for (const c of IRREGULAR_COMPARATIVES[l] ?? []) out.add(c)
  return [...out]
}

/** Accepted English past and participle forms: regular (+ed, +d, y → ied, doubled consonant + ed) ∪ the irregular table. */
export function englishVerbForms(lemma: string): { past: string[]; participle: string[] } {
  const l = lemma.toLowerCase()
  const regular = new Set([l + 'ed', l + 'd'])
  if (/[^aeiou]y$/.test(l)) regular.add(l.slice(0, -1) + 'ied')
  const d = doubled(l)
  if (d) regular.add(d + 'ed')
  if (l.endsWith('c')) regular.add(l + 'ked')
  const irr = irregularVerb(l)
  return { past: [...regular, ...(irr?.past ?? [])], participle: [...regular, ...(irr?.participle ?? [])] }
}

const PARTICLES = new Set(['up', 'out', 'off', 'on', 'in', 'down', 'away', 'back', 'over', 'around', 'along', 'through'])
/** "tidied up" → "tidied": a phrasal verb's form is checked on its verb. */
const verbToken = (form: string) => { const t = form.trim().toLowerCase().split(/\s+/); return t.length > 1 && t.slice(1).every((x) => PARTICLES.has(x)) ? t[0]! : t.join(' ') }

const fold = (s: string) => s.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
const isNone = (s: string | undefined) => s?.trim().toLowerCase() === 'none'
const singleToken = (s: string) => /^[\p{L}'’-]+$/u.test(s.trim())

function englishFormIssues(c: GlossCard, ctx: CardContext): string[] {
  const issues: string[] = []
  const word = ctx.word.toLowerCase(), lemma = ctx.lemma.toLowerCase()
  if (c.pos === 'noun' && c.plural !== undefined && !isNone(c.plural)) {
    const p = c.plural.trim().toLowerCase()
    if (!singleToken(p) || !englishPlurals(lemma).includes(p)) issues.push(`F-PLURAL-en: plural "${c.plural}" is not an English plural of "${ctx.lemma}"; give the plural of the marked word only (e.g. "${lemma}s"), or "none"`)
    else if (word !== lemma && p !== word && englishPlurals(lemma).includes(word)) issues.push(`F-PLURAL-en: the line uses the plural "${ctx.word}", so the plural is "${ctx.word}", not "${c.plural}"`)
  }
  if (c.pos === 'adjective' && c.comparative !== undefined && !isNone(c.comparative)) {
    const k = c.comparative.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!englishComparatives(lemma).includes(k)) issues.push(`F-COMP-en: comparative "${c.comparative}" is not an English comparative of "${ctx.lemma}" (e.g. "${lemma}er" or "more ${lemma}"), or use "none"`)
  }
  if (c.pos === 'verb') {
    const forms = englishVerbForms(lemma)
    for (const f of ['past', 'participle'] as const) {
      const v = c[f]
      if (v !== undefined && !forms[f].includes(verbToken(v))) issues.push(`F-VERB-en: ${f} "${v}" is not an English ${f} form of "${ctx.lemma}"`)
    }
  }
  return issues
}

function germanFormIssues(c: GlossCard, ctx: CardContext): string[] {
  const issues: string[] = []
  const lemma = fold(ctx.lemma)
  if (c.pos === 'noun') {
    if (!c.article) issues.push('F-ART-de: a German noun needs its article (der, die or das)')
    if (c.plural !== undefined && !isNone(c.plural) && (!singleToken(c.plural) || !fold(c.plural).startsWith(lemma.slice(0, 3)))) issues.push(`F-PLURAL-de: plural "${c.plural}" is not a German plural of "${ctx.lemma}" (one word, or "none")`)
  }
  if (c.pos === 'adjective' && c.comparative !== undefined && !isNone(c.comparative)) {
    const k = fold(c.comparative.trim())
    const irr = GERMAN_IRREGULAR_COMPARATIVES[ctx.lemma.toLowerCase()]
    const stem = lemma.replace(/e$/, '')
    const regular = k.endsWith('er') && (k.startsWith(stem) || (stem.length >= 4 && k.startsWith(stem.slice(0, -2))))
    if (!regular && (!irr || fold(irr) !== k)) issues.push(`F-COMP-de: comparative "${c.comparative}" is not a German comparative of "${ctx.lemma}" (e.g. "${ctx.lemma}er"), or use "none"`)
  }
  if (c.pos === 'verb' && c.participle !== undefined) {
    const p = c.participle.trim().toLowerCase()
    const last = p.split(/\s+/).at(-1) ?? ''
    if (!/^(hat|ist) /.test(p) || !(last.includes('ge') || last.endsWith('iert') || /^(be|emp|ent|er|miss|ver|zer)/.test(last))) issues.push(`F-VERB-de: participle "${c.participle}" should be the auxiliary and the participle, e.g. "hat gewartet" or "ist gegangen"`)
  }
  return issues
}

/** [] = acceptable. Each string names the rule id first ("G-LEN: …") and is fed back to the model on the retry. */
export function glossCardIssues(card: GlossCard, ctx: CardContext): string[] {
  const c = pruneCard(card, ctx.lang)
  const issues: string[] = []
  const word = ctx.word.toLowerCase(), lemma = ctx.lemma.toLowerCase()
  const glossText = c.gloss.join(' ')
  // G-COPY
  for (const g of c.gloss) {
    const bare = g.trim().replace(/\.+$/, '').toLowerCase()
    if (bare === word || bare === lemma) issues.push(`G-COPY: gloss "${g}" copies the word; give a translation, or add a short clarifier in parentheses if it is spelled the same`)
  }
  // G-LEN: a one-token target gets headwords, not phrases.
  if (!/\s/.test(ctx.word.trim())) {
    for (const g of c.gloss) {
      const n = contentWords(g, ctx.native).length
      if (n > 2 || countWords(stripParens(g)) > 3) issues.push(`G-LEN: gloss "${g}" is a phrase; give a dictionary headword of one word (two only if there is no single word)`)
    }
  }
  if (countWords(glossText) > GLOSS_MAX_WORDS || c.gloss.join(', ').length > GLOSS_MAX_CHARS) issues.push(`G-LEN: the glosses together are longer than ${GLOSS_MAX_WORDS} words or ${GLOSS_MAX_CHARS} characters`)
  // G-SOURCE: a word copied from the subtitle line (other than the target itself).
  const cueWords = new Set(wordsOf(ctx.cue).filter((w) => w.length >= 3 && w !== word && w !== lemma))
  for (const g of c.gloss) {
    const copied = contentWords(g, ctx.native).filter((w) => cueWords.has(w))
    if (copied.length) issues.push(`G-SOURCE: gloss "${g}" repeats "${copied[0]}", another word of the line; translate only the marked word`)
  }
  // G-NEIGHBOUR: a multi-word gloss that shares a stem with the translated line copies a neighbour's translation.
  if (ctx.nativeCue) {
    const nativeWords = wordsOf(ctx.nativeCue)
    for (const g of c.gloss) {
      const cw = contentWords(g, ctx.native)
      if (cw.length < 2) continue
      const hit = cw.find((w) => nativeWords.some((n) => sameStem(w, n)))
      if (hit) issues.push(`G-NEIGHBOUR: gloss "${g}" contains "${hit}", which translates another word of the line; give only the translation of the marked word`)
    }
  }
  // X-LANG, X-CUE, X-USES
  if (ctx.native === 'en' || ctx.native === 'de') {
    const own = stopwordScore(c.example, ctx.lang), other = stopwordScore(c.example, ctx.native)
    if (other > own || (countWords(c.example) >= 3 && own === 0)) issues.push(`X-LANG: the example must be a ${ctx.lang === 'en' ? 'English' : 'German'} sentence`)
  }
  if (sentenceKey(c.example) === sentenceKey(ctx.cue)) issues.push('X-CUE: example must be a new sentence, not the subtitle line')
  const ex = c.example.toLowerCase()
  if (!ex.includes(word) && !ex.includes(lemma)) issues.push(`X-USES: example must use the word "${ctx.word}" or its base form "${ctx.lemma}"`)
  // Forms
  if (ctx.lang === 'en') issues.push(...englishFormIssues(c, ctx))
  else issues.push(...germanFormIssues(c, ctx))
  return issues
}
