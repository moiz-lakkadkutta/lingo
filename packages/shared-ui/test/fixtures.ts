import type { CueDto, HighlightDto } from '@lingo/contracts'

export const hl = (id: string, word: string): HighlightDto => ({ id, word, lemma: word.toLowerCase(), rank: 100, gloss: 'g', grammar: 'gr', example: 'e', level: 'A2' })
export const cue = (index: number, startS: number, endS: number, text = 'Guten Morgen', highlights: HighlightDto[] = []): CueDto => ({ index, startS, endS, text, native: `native ${index}`, highlights })
/** Three cues with a gap between the first two: [1,3) gap [4,6) [6.5,9). */
export const cues: CueDto[] = [cue(0, 1, 3), cue(1, 4, 6), cue(2, 6.5, 9)]

import type { Catalog, ClipCard, ClipReady, LearnerDto, QuizItemDto } from '@lingo/contracts'
export const learner = (o: Partial<LearnerDto> = {}): LearnerDto => ({ learning: 'de', native: 'en', level: 'A2', plus: false, streak: 0, firstRunDone: true, nativeLine: 'always', autoPause: false, cueScale: 1, ...o })
export const card = (slug: string, o: Partial<ClipCard> = {}): ClipCard => ({ slug, title: `Title ${slug}`, level: 'A2', durationS: 150, posterUrl: null, resumeS: null, completed: false, attribution: `By ${slug}, CC BY 4.0`, ...o })
export const catalog = (o: Partial<Catalog> = {}): Catalog => ({ continue: [], justRight: [], harder: [], fresh: [], ...o })
export const quizItem = (id: string, o: Partial<QuizItemDto> = {}): QuizItemDto => ({ id, kind: 'meaning', prompt: `Prompt ${id}`, options: ['eins', 'zwei', 'drei', 'vier'], answer: 1, cueIndex: 0, ...o })
export const clipReady = (o: Partial<ClipReady> = {}): ClipReady => ({
  ...card('zug'), status: 'ready', manifestUrl: 'https://cdn.example/zug/master.m3u8', sourceLang: 'de',
  cues: [cue(0, 1, 3, 'Der Zug fährt ab.', [hl('h1', 'Zug')]), cue(1, 4, 6, 'Wir warten\nam Bahnhof.', [hl('h2', 'warten')])],
  quiz: [quizItem('q1'), quizItem('q2', { kind: 'cloze', cueIndex: 1 })], wordsYoullMeet: [hl('h1', 'Zug'), hl('h2', 'warten')], ...o,
})
