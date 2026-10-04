import { z } from 'zod'

/** Limits of what the app shows for one explanation (LING-002 §3), and small text helpers shared by the gloss card and quiz rules. */
export const GLOSS_MAX_WORDS = 6, GLOSS_MAX_CHARS = 60
export const GRAMMAR_MAX_WORDS = 14, GRAMMAR_MAX_CHARS = 90
export const EXAMPLE_MAX_WORDS = 12, EXAMPLE_MAX_CHARS = 120

export const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length
/** A trimmed single-line string with a character and a word limit. */
export const boundedLine = (max: number, maxWords: number) =>
  z.string().trim().min(1).max(max)
    .refine((s) => !/[\r\n]/.test(s), 'single line')
    .refine((s) => countWords(s) <= maxWords, `≤ ${maxWords} words`)

/** Plain Levenshtein distance (two rows). */
export function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]!
}

/** Lowercase letter words of s (apostrophes and hyphens kept inside a word). */
export const wordsOf = (s: string): string[] => s.toLowerCase().match(/\p{L}[\p{L}'’-]*/gu)?.map((w) => w.replace(/[-'’]+$/, '')) ?? []

/**
 * Same stem: lowercase; both ≥ 4 letters; one is a prefix of the other, or their common prefix is ≥ 4 letters and ≥ the shorter length − 1
 * (kommende/kommender, toll/tolle, mehr/mehr).
 */
export function sameStem(a: string, b: string): boolean {
  const x = a.toLowerCase(), y = b.toLowerCase()
  if (x.length < 4 || y.length < 4) return false
  if (x.startsWith(y) || y.startsWith(x)) return true
  let p = 0
  while (p < x.length && p < y.length && x[p] === y[p]) p++
  return p >= 4 && p >= Math.min(x.length, y.length) - 1
}

const ARTICLES = new Set(['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines', 'the', 'a', 'an', 'to'])
/** Gloss key for comparisons: lowercase, parenthesised clarifiers removed, articles (and English "to") removed, whitespace collapsed. */
export function normGloss(s: string): string {
  return s.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[.,;:!?"“”„]/g, ' ').split(/\s+/).filter((w) => w && !ARTICLES.has(w)).join(' ').trim()
}
