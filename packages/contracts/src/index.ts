import { z } from 'zod'
export const Level = z.enum(['A1', 'A2', 'B1', 'B2'])
export const Lang = z.enum(['de', 'en'])
export const ClipCard = z.object({ slug: z.string(), title: z.string(), level: Level, durationS: z.number(), posterUrl: z.string().url().nullable(), resumeS: z.number().nullable() })
export const Catalog = z.object({ continue: z.array(ClipCard), justRight: z.array(ClipCard), harder: z.array(ClipCard), fresh: z.array(ClipCard) })
export const HighlightDto = z.object({ id: z.string(), word: z.string(), lemma: z.string(), rank: z.number().int(), gloss: z.string(), grammar: z.string(), example: z.string(), level: Level })
export const CueDto = z.object({ index: z.number().int(), startS: z.number(), endS: z.number(), text: z.string(), native: z.string(), highlights: z.array(HighlightDto) })
export const QuizItemDto = z.object({ id: z.string(), kind: z.enum(['meaning', 'cloze']), prompt: z.string(), options: z.array(z.string()).length(4), answer: z.number().int().min(0).max(3), cueIndex: z.number().int().nullable() })
export const ClipDetail = ClipCard.extend({ attribution: z.string(), manifestUrl: z.string().url(), sourceLang: Lang, cues: z.array(CueDto), quiz: z.array(QuizItemDto), wordsYoullMeet: z.array(HighlightDto) })
export const LearnerDto = z.object({ learning: Lang, native: z.string(), level: Level, plus: z.boolean(), streak: z.number().int(), firstRunDone: z.boolean(), nativeLine: z.enum(['always', 'onPause', 'never']).default('always'), autoPause: z.boolean().default(false), cueScale: z.number().default(1) })
export const SaveWord = z.object({ highlightId: z.string(), sessionCode: z.string().optional() })
export const ReviewPost = z.object({ savedWordId: z.string(), grade: z.enum(['again', 'hard', 'good', 'easy']) })
export const DueWord = z.object({ savedWordId: z.string(), word: z.string(), gloss: z.string(), example: z.string(), due: z.string(), reps: z.number().int() })
/** Socket events between TV and phone (room = session code). */
export const SocketEvents = {
  wordSaved: 'word:saved', quizStart: 'quiz:start', quizResult: 'quiz:result', phoneConnected: 'phone:connected',
} as const
export type Catalog = z.infer<typeof Catalog>; export type ClipDetail = z.infer<typeof ClipDetail>; export type CueDto = z.infer<typeof CueDto>; export type HighlightDto = z.infer<typeof HighlightDto>; export type LearnerDto = z.infer<typeof LearnerDto>; export type QuizItemDto = z.infer<typeof QuizItemDto>; export type DueWord = z.infer<typeof DueWord>
