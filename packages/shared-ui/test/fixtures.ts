import type { CueDto, HighlightDto } from '@lingo/contracts'

export const hl = (id: string, word: string): HighlightDto => ({ id, word, lemma: word.toLowerCase(), rank: 100, gloss: 'g', grammar: 'gr', example: 'e', level: 'A2' })
export const cue = (index: number, startS: number, endS: number, text = 'Guten Morgen', highlights: HighlightDto[] = []): CueDto => ({ index, startS, endS, text, native: `native ${index}`, highlights })
/** Three cues with a gap between the first two: [1,3) gap [4,6) [6.5,9). */
export const cues: CueDto[] = [cue(0, 1, 3), cue(1, 4, 6), cue(2, 6.5, 9)]
