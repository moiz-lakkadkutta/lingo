import { readFile } from 'node:fs/promises'
import type { Lang } from './types'

/**
 * Name heuristic (docs/decisions/0004, no NER): names are never highlighted. Both lists (data/names-{lang}.txt) are also stripped from the
 * frequency lists at build time (scripts/build-freq.ts), so a listed name never has a rank and the de fallback below can fire.
 * en — in data/names-en.txt, or capitalised and not sentence-initial (or sentence-initial and unknown to the lemmatizer); "I" is never a name.
 * de — in data/names-de.txt, or capitalised with an unchanged lemma and no frequency rank (every ordinary German noun is capitalised, so
 *      capitalisation alone says nothing; a listed name or an unranked, uninflected capitalised token is the best signal without NER).
 */
export interface NameCtx { lang: Lang; rank: (lemma: string) => number | undefined; list: Set<string> }

export function isName(t: { word: string; lemma: string; known: boolean; sentenceInitial: boolean }, ctx: NameCtx): boolean {
  if (ctx.lang === 'en') return /^[A-Z]/.test(t.word) && t.word !== 'I' && (ctx.list.has(t.word) || !t.sentenceInitial || !t.known)
  return /^[A-ZÄÖÜ]/.test(t.word) && (ctx.list.has(t.word) || (t.lemma === t.word && ctx.rank(t.lemma.toLowerCase()) === undefined))
}

/** One name per line, '#' comments, trimmed; a missing file gives an empty set. */
export async function loadNames(path: string): Promise<Set<string>> {
  let text: string
  try { text = await readFile(path, 'utf8') } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return new Set(); throw e }
  return new Set(text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')))
}
