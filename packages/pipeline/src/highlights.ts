import type { Level } from '@lingo/contracts'
/**
 * Frequency-aware highlights: 1–2 words per cue whose rank is at or above the floor of the band above the clip level, lowest rank first
 * (no ceiling — the band just above fills first; the app filters per learner, 0007 M5; docs/decisions/0008 decision 9);
 * never names or numbers (digits or number words); cap 40 % of cues. Ranks come from an open subtitle-frequency list (data/freq-{lang}.txt, one lemma per line, rank = line number).
 * Level ≈ band: A1 < 1000, A2 < 2000, B1 < 4000, B2 < 8000 (approximate CEFR; say so in the UI). `Level` is the contracts enum (one source of truth).
 */
export type { Level }
export const BANDS: Record<Level, [number, number]> = { A1: [0, 1000], A2: [1000, 2000], B1: [2000, 4000], B2: [4000, 8000] }
export const NEXT: Record<Level, Level> = { A1: 'A2', A2: 'B1', B1: 'B2', B2: 'B2' }
/** `name` is computed by names.ts (undefined = not a name); the caller passes a case-insensitive rank fn. */
export interface Token { word: string; lemma: string; name?: boolean }
/** coverageRank when no token is ranked. */
export const UNKNOWN_RANK = 99999

/** Number words (both languages, matched case-insensitively on the surface form): cardinals to twelve, tens, hundred/thousand, ordinals to tenth, multiplicatives. */
const NUMERAL_WORDS = new Set([
  ...'null eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf zwanzig dreißig vierzig fünfzig sechzig siebzig achtzig neunzig hundert tausend'.split(' '),
  ...'erste zweite dritte vierte fünfte sechste siebte achte neunte zehnte'.split(' '),
  ...'zero one two three four five six seven eight nine ten eleven twelve twenty thirty forty fifty sixty seventy eighty ninety hundred thousand'.split(' '),
  ...'first second third fourth fifth sixth seventh eighth ninth tenth once twice thrice'.split(' '),
])
/** German cardinal stems + optional suffix (dreimal, vierfach, neunzehn, zwanzigste) and inflected ordinals (ersten, dritter, siebtes); English -fold/-th/-ties (twofold, thirtieth, twenties). */
const NUMERAL_DE = /^(?:(?:ein|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf|zwanzig|dreißig|vierzig|fünfzig|sechzig|siebzig|achtzig|neunzig|hundert|tausend)(?:zehn|mal|fach|ste[rsn]?|sten)?|(?:erst|zweit|dritt|viert|fünft|sechst|siebt|acht|neunt|zehnt)e[rsn]?)$/i
const NUMERAL_EN = /^(?:two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)(?:fold|th|ieth|ties|s)?$/i
/** True for a number word (never highlighted, like digits); ordinary words that merely start with a numeral stem (einsam, eintreten, achtung) are not, nor is the article ein. */
export function isNumeral(word: string): boolean {
  const w = word.toLowerCase()
  return w !== 'ein' && (NUMERAL_WORDS.has(w) || NUMERAL_DE.test(w) || NUMERAL_EN.test(w))
}

/** Tokens that count towards clip level / coverage and may be highlighted: not a name, no digits, not a number word. */
export function isCountable(t: Token): boolean { return !t.name && !/\d/.test(t.word) && !isNumeral(t.word) }

/** The lowest rank a highlight may have for a clip at `level`: the floor of the band above it. */
export function highlightFloor(level: Level): number { return BANDS[NEXT[level]][0] }

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
/** Ranks of the tokens that have one (docs/decisions/0008 decision 10: unranked tokens — ASR errors or words beyond the top 20 000 — are ignored). */
const rankedOf = (tokens: Token[], rank: (l: string) => number | undefined) => tokens.map((t) => rank(t.lemma)).filter((r): r is number => r !== undefined)
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
  const unranked = tokens.filter((t) => rank(t.lemma) === undefined)
  return { share: tokens.length ? unranked.length / tokens.length : 0, lemmas: [...new Set(unranked.map((t) => t.lemma))].sort() }
}
