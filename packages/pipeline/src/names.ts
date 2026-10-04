import { readFile } from 'node:fs/promises'
import type { Lang } from './types'

/**
 * Name heuristic (docs/decisions/0004, 0008 decision 7; no NER): names are never highlighted. Both lists (data/names-{lang}.txt) are checked
 * before any rank and are also stripped from the frequency lists at build time (scripts/build-freq.ts), so a listed name never has a rank.
 * Single letters and "I" (one letter before any apostrophe: A, N, N's, I'm) are never names, in either language.
 * en — listed, or capitalised with no rank (rankOf: the lemma, else the surface before the apostrophe, I'm → i), or capitalised mid-sentence
 *      with rank ≥ COMMON_RANK (Pete 1617, Irving 8380). Capitalised A1 words mid-sentence (Listen, Say, Now, Street) are vocabulary.
 * de — listed, or capitalised with an unchanged lemma and no frequency rank (every ordinary German noun is capitalised, so
 *      capitalisation alone says nothing; a listed name or an unranked, uninflected capitalised token is the best signal without NER).
 * `known` is no longer consulted (kept in the input type until prepare.ts is cleaned up).
 */
export interface NameCtx { lang: Lang; rank: (lemma: string) => number | undefined; list: Set<string> }

/** = BANDS.A1[1]: a word below this rank can never be highlighted, so calling it vocabulary costs nothing. */
export const COMMON_RANK = 1000

/** The surface form before any apostrophe: I'm → I, N's → N, Let's → Let. */
const coreOf = (word: string) => word.replace(/['’].*$/u, '')

/** Rank of a token: its lemma's, else its surface form's before the apostrophe (I'm → rank of "i"; simplemma does not know contractions). */
export function rankOf(word: string, lemma: string, rank: (lemma: string) => number | undefined): number | undefined {
  return rank(lemma) ?? rank(coreOf(word).toLowerCase())
}

export function isName(t: { word: string; lemma: string; known: boolean; sentenceInitial: boolean }, ctx: NameCtx): boolean {
  if (coreOf(t.word).length < 2) return false
  if (ctx.list.has(t.word)) return true
  if (ctx.lang === 'en') {
    if (!/^[A-Z]/.test(t.word)) return false
    const r = rankOf(t.word, t.lemma, ctx.rank)
    return r === undefined || (!t.sentenceInitial && r >= COMMON_RANK)
  }
  return /^[A-ZÄÖÜ]/.test(t.word) && t.lemma === t.word && ctx.rank(t.lemma.toLowerCase()) === undefined
}

/** One name per line, '#' comments, trimmed; a missing file gives an empty set. */
export async function loadNames(path: string): Promise<Set<string>> {
  let text: string
  try { text = await readFile(path, 'utf8') } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return new Set(); throw e }
  return new Set(text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')))
}
