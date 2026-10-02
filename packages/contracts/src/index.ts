import { z } from 'zod'
import { Lang, Level } from './base'
export { Lang, Level } from './base'
export { LEVELS, BANDS, NEXT, highlightFloor } from './base'
export * from './prepared'
export * from './ai'
export * from './review'
export * from './iap'
export * from './tv'
export const ClipCard = z.object({ slug: z.string(), title: z.string(), level: Level, durationS: z.number(), posterUrl: z.string().url().nullable(), resumeS: z.number().nullable(), completed: z.boolean().default(false), attribution: z.string().default('') })
export const Catalog = z.object({ continue: z.array(ClipCard), justRight: z.array(ClipCard), harder: z.array(ClipCard), fresh: z.array(ClipCard) })
export const HighlightDto = z.object({ id: z.string(), word: z.string(), lemma: z.string(), rank: z.number().int(), gloss: z.string(), grammar: z.string(), example: z.string(), level: Level })
export const CueDto = z.object({ index: z.number().int(), startS: z.number(), endS: z.number(), text: z.string(), native: z.string(), highlights: z.array(HighlightDto) })
export const QuizItemDto = z.object({ id: z.string(), kind: z.enum(['meaning', 'cloze']), prompt: z.string(), options: z.array(z.string()).length(4), answer: z.number().int().min(0).max(3), cueIndex: z.number().int().nullable() })
export const ClipDetail = ClipCard.extend({ manifestUrl: z.string().url(), sourceLang: Lang, cues: z.array(CueDto), quiz: z.array(QuizItemDto), wordsYoullMeet: z.array(HighlightDto) })
export const ClipReady = ClipDetail.extend({ status: z.literal('ready') })
export const ClipPreparing = ClipCard.extend({ status: z.literal('preparing'), etaMin: z.number().int().positive() })
export const ClipResponse = z.discriminatedUnion('status', [ClipReady, ClipPreparing])
export const NativeLine = z.enum(['always', 'onPause', 'never'])
/** Cue size 100–150 % (Settings and the ▲ sheet). */
export const CueScale = z.number().min(1).max(1.5)
export const LearnerDto = z.object({ learning: Lang, native: z.string(), level: Level, plus: z.boolean(), streak: z.number().int(), firstRunDone: z.boolean(), nativeLine: NativeLine.default('always'), autoPause: z.boolean().default(false), cueScale: CueScale.default(1) })
/** PUT /me body: only what the learner may change. Strict, so a forbidden key is a 400, not silently dropped.
 *  plus is set only by /iap/verify, level only by PUT /me/level (LING-005), streak and knownRank only server-side. */
export const LearnerSettingsPatch = z.object({ learning: Lang, native: z.string().min(1), firstRunDone: z.boolean(), nativeLine: NativeLine, autoPause: z.boolean(), cueScale: CueScale }).partial().strict()
/** reviewId: made once per card on the phone and resent on a retry, so a retry after a lost answer never applies SM-2 twice (unique per saved word). */
export const ReviewId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, '8-64 letters, digits, _ or -')
export const ReviewPost = z.object({ savedWordId: z.string(), grade: z.enum(['again', 'hard', 'good', 'easy']), reviewId: ReviewId.optional() })
export type ReviewPost = z.infer<typeof ReviewPost>
export const DueWord = z.object({
  savedWordId: z.string(), highlightId: z.string(),
  word: z.string(), lemma: z.string(), gloss: z.string(), example: z.string(), level: Level,
  due: z.string(), reps: z.number().int(), lapses: z.number().int(), intervalD: z.number().int(),
  clipSlug: z.string(), clipTitle: z.string(),
  cueIndex: z.number().int(), cueText: z.string(), cueNative: z.string().nullable(),
})
// --- Session / realtime -------------------------------------------------------
/** Session codes mirror the API's newCode() alphabet: six characters, no 0/O/1/I. */
export const SESSION_CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/
export const SessionCode = z.string().regex(SESSION_CODE_RE, 'six characters, no 0/O/1/I')
export const SessionDto = z.object({ code: SessionCode, joinUrl: z.string() })
/** sessionCode is validated here so a bad code is a 400 before any row is written (the emit must never decide the HTTP result). */
export const SaveWord = z.object({ highlightId: z.string(), sessionCode: SessionCode.optional() })

/** Typed code, scanned QR text, or deep-link URL → code. Uppercases; takes the last path segment. The code is the single source of truth; the URL is only a carrier. */
export function extractSessionCode(input: string): string | null {
  let s = input.trim()
  if (!s) return null
  s = s.replace(/[?#].*$/, '')
  if (s.includes('/')) s = s.split('/').filter(Boolean).at(-1) ?? ''
  s = s.trim().toUpperCase()
  return SESSION_CODE_RE.test(s) ? s : null
}

/** deviceName is sanitised, not rejected: OS names can be empty or long, and a phone that can never pair is worse than a clipped name. Blank → undefined → the server's default. */
export const DeviceName = z.string().optional().transform((s) => s?.trim().slice(0, 40).trim() || undefined)
export const JoinPayload = z.object({ code: SessionCode, role: z.enum(['tv', 'phone']), deviceName: DeviceName })
export const SessionStatePayload = z.object({ code: SessionCode, phone: z.string().nullable() })
export const PhoneConnectedPayload = z.object({ code: SessionCode, phoneName: z.string().min(1).max(40) })
export const PhoneDisconnectedPayload = z.object({ code: SessionCode })
export const WordSavedPayload = z.object({
  code: SessionCode, savedWordId: z.string(), highlightId: z.string(),
  word: z.string(), lemma: z.string(), gloss: z.string(), example: z.string(), level: Level,
  clipSlug: z.string().nullable(), clipTitle: z.string().nullable(), savedAt: z.string().datetime(),
})
export const QuizStartPayload = z.object({ code: SessionCode, clipSlug: z.string().nullable().default(null) })
export const QuizResultPayload = z.object({ code: SessionCode, correct: z.number().int().min(0), total: z.number().int().min(0) })
  .refine((r) => r.correct <= r.total, 'correct ≤ total')
export const SessionErrorPayload = z.object({ code: z.enum(['UNKNOWN_CODE', 'VALIDATION', 'INTERNAL', 'RATE_LIMITED']), message: z.string() })

/** Socket events between TV and phone (room = session code). */
export const SocketEvents = {
  join: 'join', wordSaved: 'word:saved', quizStart: 'quiz:start', quizResult: 'quiz:result',
  phoneConnected: 'phone:connected', phoneDisconnected: 'phone:disconnected', sessionState: 'session:state', sessionError: 'session:error',
} as const

/** Socket.IO generic event maps (server: Server<C2S, S2C, {}, SocketData>; client: Socket<S2C, C2S>). C2S takes the *input* shape: clients send what the schema accepts (e.g. quiz:start without clipSlug), the server parses. */
export interface ClientToServerEvents {
  'join': (p: z.input<typeof JoinPayload>) => void
  'quiz:start': (p: z.input<typeof QuizStartPayload>) => void
  'quiz:result': (p: z.input<typeof QuizResultPayload>) => void
}
export interface ServerToClientEvents {
  'session:state': (p: SessionStatePayload) => void
  'session:error': (p: SessionErrorPayload) => void
  'phone:connected': (p: PhoneConnectedPayload) => void
  'phone:disconnected': (p: PhoneDisconnectedPayload) => void
  'word:saved': (p: WordSavedPayload) => void
  'quiz:start': (p: QuizStartPayload) => void
  'quiz:result': (p: QuizResultPayload) => void
}
export interface SocketData { code?: string; role?: 'tv' | 'phone'; phoneName?: string }
export type SessionDto = z.infer<typeof SessionDto>; export type JoinPayload = z.infer<typeof JoinPayload>; export type SessionStatePayload = z.infer<typeof SessionStatePayload>; export type PhoneConnectedPayload = z.infer<typeof PhoneConnectedPayload>; export type PhoneDisconnectedPayload = z.infer<typeof PhoneDisconnectedPayload>; export type WordSavedPayload = z.infer<typeof WordSavedPayload>; export type QuizStartPayload = z.infer<typeof QuizStartPayload>; export type QuizResultPayload = z.infer<typeof QuizResultPayload>; export type SessionErrorPayload = z.infer<typeof SessionErrorPayload>
export type Catalog = z.infer<typeof Catalog>; export type ClipCard = z.infer<typeof ClipCard>; export type ClipDetail = z.infer<typeof ClipDetail>; export type ClipReady = z.infer<typeof ClipReady>; export type ClipPreparing = z.infer<typeof ClipPreparing>; export type ClipResponse = z.infer<typeof ClipResponse>; export type CueDto = z.infer<typeof CueDto>; export type HighlightDto = z.infer<typeof HighlightDto>; export type LearnerDto = z.infer<typeof LearnerDto>; export type LearnerSettingsPatch = z.infer<typeof LearnerSettingsPatch>; export type NativeLine = z.infer<typeof NativeLine>; export type QuizItemDto = z.infer<typeof QuizItemDto>; export type DueWord = z.infer<typeof DueWord>
