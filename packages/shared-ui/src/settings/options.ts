import type { LearnerDto } from '@lingo/contracts'
/** Shared by the Player's ▲ sheet and the Settings screen. */
export const LINES: ReadonlyArray<LearnerDto['nativeLine']> = ['always', 'onPause', 'never']
export const SIZES = [1, 1.25, 1.5] as const
/** Next value in `list` from `cur` in `dir`; wraps by default, else stays at the ends (returns `cur`). */
export const step = <V,>(list: readonly V[], cur: V, dir: -1 | 1, wrap = true): V => {
  const i = Math.max(0, list.indexOf(cur)) + dir
  if (!wrap) return list[Math.min(list.length - 1, Math.max(0, i))]!
  return list[(i + list.length) % list.length]!
}
