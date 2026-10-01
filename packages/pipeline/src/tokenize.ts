import type { Word } from './types'

export interface RawToken { word: string; sentenceInitial: boolean; cueIndex: number }
export interface WordToken { word: string; sentenceInitial: boolean; wordIndex: number }

const STRIP_LEAD = /^[^\p{L}\p{N}'’-]+/u
const STRIP_TRAIL = /[^\p{L}\p{N}'’-]+$/u
const SENTENCE_END = /[.!?…]$/
const strip = (raw: string) => raw.replace(STRIP_LEAD, '').replace(STRIP_TRAIL, '')
const isWord = (w: string) => !!w && /[\p{L}\p{N}]/u.test(w)

/**
 * Tokens from the timed word stream. Strips leading/trailing chars outside \p{L}\p{N}'’- ; drops empties; sentenceInitial = first
 * word or previous word ends a sentence. prepare() uses tokenizeCues (docs/decisions/0007); this one stays for the fixture checks.
 */
export function tokenizeWords(words: Word[]): WordToken[] {
  const out: WordToken[] = []
  for (let i = 0; i < words.length; i++) {
    const word = strip(words[i]!.text)
    if (!isWord(word)) continue
    out.push({ word, sentenceInitial: i === 0 || SENTENCE_END.test(words[i - 1]!.text), wordIndex: i })
  }
  return out
}

/**
 * Tokens from the final cue text (segmenter output or a corrected VTT), so tokens always match what the learner reads.
 * A line starting with `-` is a speaker line of a two-speaker cue: the hyphen is stripped and its first token is sentence-initial.
 * Otherwise a cue's first token is sentence-initial for the first cue or when the previous cue (last line) ends with . ! ? … ;
 * inside a cue, a token is sentence-initial when the previous raw token ends with . ! ? … .
 */
export function tokenizeCues(cues: Array<{ index: number; text: string }>): RawToken[] {
  const out: RawToken[] = []
  cues.forEach((cue, pos) => {
    const prevText = pos > 0 ? cues[pos - 1]!.text.split('\n').at(-1)!.trimEnd() : ''
    let prevRaw: string | undefined
    cue.text.split('\n').forEach((line, li) => {
      const speakerLine = line.startsWith('-')
      const raws = (speakerLine ? line.slice(1) : line).split(/\s+/).filter(Boolean)
      raws.forEach((raw, ri) => {
        const first = ri === 0
        const initial = first && speakerLine ? true
          : first && li === 0 ? pos === 0 || SENTENCE_END.test(prevText)
          : prevRaw !== undefined && SENTENCE_END.test(prevRaw)
        prevRaw = raw
        const word = strip(raw)
        if (isWord(word)) out.push({ word, sentenceInitial: initial, cueIndex: cue.index })
      })
    })
  })
  return out
}
