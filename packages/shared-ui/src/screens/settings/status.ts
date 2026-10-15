import type { Dispatch, SetStateAction } from 'react'
import { strings } from '../../strings'

/** How long "Saved." stays in the Settings status line (QA #5); a save that also swapped I speak stays longer so it can be read. */
export const SAVED_MS = 2000
export const NOTICE_MS = 4000

/** The status line after a successful save; `notice` explains a side effect (QA #4). */
export const savedStatus = (notice?: string) => (notice ? strings.settings.savedWith(notice) : strings.settings.saved)

/**
 * Show `msg` now and clear it after `ms`, unless something else (an error, a newer save) has replaced it by then.
 * Returns a cancel for the timer.
 */
export function flashStatus(set: Dispatch<SetStateAction<string | null>>, msg: string, ms: number): () => void {
  set(msg)
  const t = setTimeout(() => set((cur) => (cur === msg ? null : cur)), ms)
  return () => clearTimeout(t)
}
