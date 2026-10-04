import { Gloss, GRAMMAR_MAX_CHARS, GRAMMAR_MAX_WORDS, pruneCard, type GlossCard, type Lang, type Register } from '@lingo/contracts'

/**
 * Code renders the grammar note from the card's fields (docs/plans/LING-002-gate-c.md §3.4), so a note can only state what the fields
 * say. Labels are in the learner's language; natives without a table fall back to English labels. The app contract (`Gloss`) is unchanged.
 */
interface Labels {
  noun: string; pl: string; noPlural: string; verb: string; separable: string; adjective: string; comparative: string; noComparative: string
  adverb: string; other: string; register: Record<Exclude<Register, 'neutral'>, string>
}
export const LABELS: Record<string, Labels> = {
  en: {
    noun: 'noun', pl: 'pl.', noPlural: 'no plural', verb: 'verb', separable: 'separable verb', adjective: 'adjective', comparative: 'comparative',
    noComparative: 'no comparative', adverb: 'adverb', other: 'word', register: { informal: 'informal', formal: 'formal', dated: 'dated', slang: 'slang' },
  },
  de: {
    noun: 'Nomen', pl: 'Pl.', noPlural: 'ohne Plural', verb: 'Verb', separable: 'trennbares Verb', adjective: 'Adjektiv', comparative: 'Komparativ',
    noComparative: 'ohne Komparativ', adverb: 'Adverb', other: 'Wort', register: { informal: 'umgangssprachlich', formal: 'gehoben', dated: 'veraltet', slang: 'Slang' },
  },
}

const isNone = (s: string | undefined) => !!s && s.trim().toLowerCase() === 'none'

function body(c: GlossCard, lang: Lang, L: Labels, lemma: string): string {
  switch (c.pos) {
    case 'noun': {
      const plural = !c.plural ? '' : isNone(c.plural) ? `, ${L.noPlural}` : `, ${L.pl} ${c.plural}`
      if (lang === 'de') return `${L.noun}, ${c.article ? `${c.article} ` : ''}${lemma}${plural}`
      return `${L.noun}${plural}`
    }
    case 'verb': {
      const forms = [c.past, c.participle].filter((f): f is string => !!f)
      if (lang === 'de' && c.separable) {
        const pre = c.separable.trim()
        const base = lemma.toLowerCase().startsWith(pre.toLowerCase()) ? lemma.slice(pre.length) : lemma
        return `${L.separable}: ${[`${pre}|${base}`, ...forms].join(', ')}`
      }
      return `${L.verb}: ${[lemma, ...forms].join(', ')}`
    }
    case 'adjective':
      return !c.comparative ? L.adjective : isNone(c.comparative) ? `${L.adjective}, ${L.noComparative}` : `${L.adjective}, ${L.comparative} ${c.comparative}`
    case 'adverb':
      return L.adverb
    default:
      return L.other
  }
}

const fits = (s: string) => s.length <= GRAMMAR_MAX_CHARS && s.trim().split(/\s+/).length <= GRAMMAR_MAX_WORDS

/** The grammar note; ≤ 14 words and ≤ 90 chars by construction (register, then forms are left out when the forms are very long). */
export function renderGrammar(card: GlossCard, lang: Lang, native: string, lemma: string): string {
  const c = pruneCard(card, lang)
  const L = LABELS[native] ?? LABELS.en!
  const main = body(c, lang, L, lemma)
  const full = c.register !== 'neutral' ? `${main}, ${L.register[c.register]}` : main
  if (fits(full)) return full
  if (fits(main)) return main
  return { noun: L.noun, verb: L.verb, adjective: L.adjective, adverb: L.adverb, other: L.other }[c.pos]
}

/** gloss = the headwords joined with ", " (the first alone if both do not fit); grammar = renderGrammar(); example = card.example. */
export function cardToGloss(card: GlossCard, lang: Lang, native: string, lemma: string): Gloss {
  const both = { gloss: card.gloss.join(', '), grammar: renderGrammar(card, lang, native, lemma), example: card.example }
  if (Gloss.safeParse(both).success) return Gloss.parse(both)
  return Gloss.parse({ ...both, gloss: card.gloss[0]! })
}
