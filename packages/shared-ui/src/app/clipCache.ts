import type { ClipReady, LearnerDto } from '@lingo/contracts'

/**
 * Clip detail cache (review-005 M3). GET /clips/:slug bakes in the native line (x-native) and the highlight set for the learner's level
 * (decision 0007 M5), so an entry is tagged with the learner context it was fetched for.
 * - `fresh`: only an entry from the current context. Clip and Player use it, so a change of "I speak", level or learning language refetches.
 * - `peek`: any entry. Summary and Quiz show the clip just played, which stays valid for that screen even if a quiz moved the level.
 */
export const cacheContext = (l: Pick<LearnerDto, 'native' | 'level' | 'learning'>) => `${l.learning}|${l.native}|${l.level}`
export interface ClipCache {
  fresh(slug: string, ctx: string): ClipReady | undefined
  peek(slug: string): ClipReady | undefined
  set(slug: string, ctx: string, clip: ClipReady): void
}
export function createClipCache(): ClipCache {
  const m = new Map<string, { ctx: string; clip: ClipReady }>()
  return {
    fresh: (slug, ctx) => { const e = m.get(slug); return e && e.ctx === ctx ? e.clip : undefined },
    peek: (slug) => m.get(slug)?.clip,
    set: (slug, ctx, clip) => { m.set(slug, { ctx, clip }) },
  }
}
