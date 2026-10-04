import { z } from 'zod'
import { Level } from './base'
/** "I speak" options, native names (Intl.DisplayNames is not reliable on TV runtimes). First run shows the first 8 ≠ learning. */
export const NATIVE_LANGS = [
  { code: 'en', name: 'English' }, { code: 'de', name: 'Deutsch' }, { code: 'tr', name: 'Türkçe' }, { code: 'ar', name: 'العربية' },
  { code: 'uk', name: 'Українська' }, { code: 'ru', name: 'Русский' }, { code: 'pl', name: 'Polski' }, { code: 'fa', name: 'فارسی' },
  { code: 'ro', name: 'Română' },
] as const
export type NativeLangCode = (typeof NATIVE_LANGS)[number]['code']
export const ProgressPut = z.object({ clipSlug: z.string().min(1), positionS: z.number().min(0), completed: z.boolean().default(false) })
export const LevelPut = z.discriminatedUnion('source', [
  z.object({ source: z.literal('placement'), level: Level }),
  z.object({ source: z.literal('settings'), level: Level }),
  z.object({ source: z.literal('quiz'), clipSlug: z.string().min(1), correct: z.number().int().min(0), total: z.number().int().min(1) }),
]).refine((b) => b.source !== 'quiz' || b.correct <= b.total, 'correct ≤ total')
export const LevelResult = z.object({ level: Level, changed: z.enum(['up', 'set']).nullable() })
export const LibraryWord = z.object({
  savedWordId: z.string(), word: z.string(), lemma: z.string(), gloss: z.string(),
  due: z.string().datetime(), intervalD: z.number().int(), reps: z.number().int(), learned: z.boolean(),
  clip: z.object({ slug: z.string(), title: z.string(), manifestUrl: z.string().url().nullable() }),
  cue: z.object({ index: z.number().int(), startS: z.number(), endS: z.number(), text: z.string(), native: z.string() }),
})
export type ProgressPut = z.input<typeof ProgressPut>
export type LevelPut = z.input<typeof LevelPut>
export type LevelResult = z.infer<typeof LevelResult>
export type LibraryWord = z.infer<typeof LibraryWord>
