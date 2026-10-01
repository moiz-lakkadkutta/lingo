import type { Level } from '@lingo/contracts'
import { BANDS, NEXT, highlightFloor } from '@lingo/contracts'
import { rankOf } from './names'
/**
 * Frequency-aware highlights: 1–2 words per cue whose rank is at or above the floor of the band above the clip level, lowest rank first
 * (no ceiling — the band just above fills first; the app filters per learner, 0007 M5; docs/decisions/0008 decision 9);
 * never names or numbers (digits or number words); cap 40 % of cues. Ranks come from an open subtitle-frequency list (data/freq-{lang}.txt, one lemma per line, rank = line number).
 * Level ≈ band: A1 < 1000, A2 < 2000, B1 < 4000, B2 < 8000 (approximate CEFR; say so in the UI). `Level` is the contracts enum (one source of truth).
 */
export type { Level }
export { BANDS, NEXT, highlightFloor }
/** `name` is computed by names.ts (undefined = not a name); the caller passes a case-insensitive rank fn. */
export interface Token { word: string; lemma: string; name?: boolean }
/** coverageRank when no token is ranked. */
export const UNKNOWN_RANK = 99999

/**
 * Number words, both languages, matched case-insensitively on the surface form: a rule over number morphemes plus a short list.
 * German: a run of number morphemes (zweihundert, einundzwanzig, dreihundertvierzig) with an optional ending that is only valid
 * where German puts it (-te after units and -zehn, -ste after -zig/hundert/tausend/Million, -mal/-fach, Hunderte/Tausende), the
 * irregular ordinals (erste, dritte, siebte, achte) and Million/Milliarde/Billion/Dutzend. English: cardinals incl. teens, tens,
 * hundred…trillion, dozen (+plural, -fold), ordinals incl. eleventh…billionth, and hyphenated compounds (twenty-one, ninety-ninth).
 */
const NUMERAL_WORDS = new Set(['null', 'zero', 'once', 'twice', 'thrice'])
const DE_UNIT = 'zwei|zwo|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf|sechzehn|siebzehn'
const DE_TEN = 'zwanzig|drei(?:ß|ss)ig|vierzig|fünfzig|sechzig|siebzig|achtzig|neunzig'
// "ein" only inside a compound or before -mal (einundzwanzig, einhundert, einmal), so the article and einfach/einte are not numbers.
const DE_MORPH = `(?:eins|ein(?=und|hundert|tausend|mal)|${DE_UNIT}|${DE_TEN}|hundert|tausend)`
const DE_SEQ = `${DE_MORPH}(?:${DE_MORPH}|und(?=${DE_MORPH}))*`
const DE_END = '(?:mal|fach|(?<=zwei|zwo|vier|fünf|sechs|neun|zehn|elf|zwölf)te[rsnm]?|(?<=zig|ßig|ssig|hundert|tausend)ste[rsnm]?|(?<=hundert|tausend)en?)'
const DE_BIG = '(?:million|milliarde|billion|billiarde)(?:en|n|ste[rsnm]?)?|dutzend(?:en?)?'
const NUMERAL_DE = new RegExp(`^(?:${DE_SEQ}${DE_END}?|(?:${DE_SEQ})?(?:(?:erst|dritt|siebt|acht)e[rsnm]?|${DE_BIG}))$`, 'iu')
const EN_TEEN = '(?:thir|four|fif|six|seven|eigh|nine)teen'
const EN_TY = '(?:twen|thir|for|fif|six|seven|eigh|nine)t'
const EN_CARD = `two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|${EN_TEEN}|${EN_TY}y|hundred|thousand|million|billion|trillion|dozen`
const EN_ORD = `first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|${EN_TEEN}th|${EN_TY}ieth|hundredth|thousandth|millionth|billionth|trillionth`
/** One English number part: "one" (no plural: "ones" is a pronoun), a cardinal with optional plural/-fold, or an ordinal (no plural: "seconds"). */
const NUMERAL_EN = new RegExp(`^(?:one|(?:${EN_CARD})(?:s|fold)?|${EN_TY}ies|${EN_ORD})$`, 'i')
const isEnNumeral = (w: string) => w.split('-').every((p) => NUMERAL_EN.test(p))
/** True for a number word (never highlighted, like digits); ordinary words that merely start with a numeral stem (einsam, einfach, eintreten, achtung, Sieb) are not, nor is the article ein. */
export function isNumeral(word: string): boolean {
  const w = word.toLowerCase()
  return NUMERAL_WORDS.has(w) || NUMERAL_DE.test(w) || isEnNumeral(w)
}

/** Tokens that count towards clip level / coverage and may be highlighted: not a name, no digits, not a number word. */
export function isCountable(t: Token): boolean { return !t.name && !/\d/.test(t.word) && !isNumeral(t.word) }


export function pickHighlights(cues: Array<{ index: number; tokens: Token[] }>, rank: (lemma: string) => number | undefined, level: Level, maxShare = 0.4): Array<{ cueIndex: number; word: string; lemma: string; rank: number }> {
  const lo = highlightFloor(level)
  const out: Array<{ cueIndex: number; word: string; lemma: string; rank: number }> = []
  const seen = new Set<string>()
  const used = new Set<number>()
  const budget = Math.floor(cues.length * maxShare)
  for (const c of cues) {
    if (!used.has(c.index) && used.size >= budget) continue
    const cands = c.tokens
      .filter((t) => isCountable(t) && t.word.length > 2)
      .map((t) => ({ ...t, r: rank(t.lemma) })).filter((t): t is Token & { r: number } => t.r !== undefined && t.r >= lo && !seen.has(t.lemma))
      .sort((a, b) => a.r - b.r).slice(0, 2)
    for (const t of cands) { seen.add(t.lemma); used.add(c.index); out.push({ cueIndex: c.index, word: t.word, lemma: t.lemma, rank: t.r }) }
  }
  return out
}
/** Ranks of the tokens that have one — the token rank of clip.json, rankOf (I'm → i) — (docs/decisions/0008 decision 10: unranked tokens — ASR errors or words beyond the top 20 000 — are ignored). */
const rankedOf = (tokens: Token[], rank: (l: string) => number | undefined) => tokens.map((t) => rankOf(t.word, t.lemma, rank)).filter((r): r is number => r !== undefined)
/** Coverage-based level for a clip: the smallest level whose band covers ≥ 95 % of the ranked tokens; none ranked → 'B2'. */
export function clipLevel(tokens: Token[], rank: (l: string) => number | undefined): Level {
  const ranks = rankedOf(tokens, rank)
  if (!ranks.length) return 'B2'
  for (const lvl of ['A1', 'A2', 'B1', 'B2'] as Level[]) { const hi = BANDS[lvl][1]; if (ranks.filter((r) => r < hi).length / ranks.length >= 0.95) return lvl }
  return 'B2'
}
/** Smallest rank r such that ≥ 95 % of the ranked tokens have rank ≤ r; UNKNOWN_RANK (99999) when none is ranked. */
export function coverageRank(tokens: Token[], rank: (l: string) => number | undefined): number {
  const ranks = rankedOf(tokens, rank).sort((a, b) => a - b)
  if (!ranks.length) return UNKNOWN_RANK
  return ranks[Math.ceil(0.95 * ranks.length) - 1]!
}
/** Share of tokens without a rank and their distinct lemmas, sorted (prepare() warns above 5 %). No tokens → share 0. */
export function unrankedShare(tokens: Token[], rank: (l: string) => number | undefined): { share: number; lemmas: string[] } {
  const unranked = tokens.filter((t) => rankOf(t.word, t.lemma, rank) === undefined)
  return { share: tokens.length ? unranked.length / tokens.length : 0, lemmas: [...new Set(unranked.map((t) => t.lemma))].sort() }
}

/** Above this rank a highlight is listed for human review (the band has no ceiling, docs/decisions/0008 decision 9). */
export const RARE_RANK = 8000
/** de: a capitalised highlight whose lemma is its surface form and whose rank is above this may be a name the lists miss. */
export const POSSIBLE_NAME_RANK = 12000
/** `review: …` warnings for the tail of the floor-only band: every highlight above RARE_RANK; for de also possible names. Word included (printed by the CLI). */
export function reviewHighlights(highlights: Array<{ cueIndex: number; word: string; lemma: string; rank: number }>, lang: string): string[] {
  const out: string[] = []
  for (const h of highlights) if (h.rank > RARE_RANK) out.push(`review: rare highlight ${h.rank} ${h.word} (cue ${h.cueIndex})`)
  if (lang === 'de') for (const h of highlights) if (h.rank > POSSIBLE_NAME_RANK && /^\p{Lu}/u.test(h.word) && h.lemma === h.word) out.push(`review: possible name ${h.rank} ${h.word} (cue ${h.cueIndex}) — add it to data/names-de.txt if it is one`)
  return out
}
