import { z } from 'zod'
/** Approximate CEFR level derived from frequency bands (say "approximate" in the UI). */
export const Level = z.enum(['A1', 'A2', 'B1', 'B2'])
export const Lang = z.enum(['de', 'en'])
export type Level = z.infer<typeof Level>
export type Lang = z.infer<typeof Lang>
