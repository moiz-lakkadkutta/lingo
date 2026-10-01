import type { Word } from './types'

export interface RawToken { word: string; sentenceInitial: boolean; cueIndex: number }
export interface WordToken { word: string; sentenceInitial: boolean; wordIndex: number }

const STRIP_LEAD = /^[^\p{L}\p{N}'’-]+/u
const STRIP_TRAIL = /[^\p{L}\p{N}'’-]+$/u
const SENTENCE_END = /[.!?…]$/

/**
 * Tokens straight from the timed word stream (not from the wrapped cue text) so sentence-initial flags stay exact.
 * Strips leading/trailing chars outside \p{L}\p{N}'’- ; drops empties; sentenceInitial = first word or previous word ends a sentence.
 */
export function tokenizeWords(words: Word[]): WordToken[] {
  const out: WordToken[] = []
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!.text.replace(STRIP_LEAD, '').replace(STRIP_TRAIL, '')
    if (!word || !/[\p{L}\p{N}]/u.test(word)) continue
    out.push({ word, sentenceInitial: i === 0 || SENTENCE_END.test(words[i - 1]!.text), wordIndex: i })
  }
  return out
}
