import { z } from 'zod'
/** Approximate CEFR level derived from frequency bands (say "approximate" in the UI). */
export const Level = z.enum(['A1', 'A2', 'B1', 'B2'])
export const Lang = z.enum(['de', 'en'])
export type Level = z.infer<typeof Level>
export type Lang = z.infer<typeof Lang>
export const LEVELS = ['A1', 'A2', 'B1', 'B2'] as const
/** Frequency-rank bands per level: A1 < 1000, A2 < 2000, B1 < 4000, B2 < 8000. */
export const BANDS: Record<Level, [number, number]> = { A1: [0, 1000], A2: [1000, 2000], B1: [2000, 4000], B2: [4000, 8000] }
export const NEXT: Record<Level, Level> = { A1: 'A2', A2: 'B1', B1: 'B2', B2: 'B2' }
/** The lowest rank a highlight may have for a clip (pipeline) or a learner (API, decision 0007 M5) at `level`: the floor of the band above it. */
export function highlightFloor(level: Level): number { return BANDS[NEXT[level]][0] }
