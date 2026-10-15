import { NATIVE_LANGS } from '@lingo/contracts'
import type { Lang } from '@lingo/contracts'
/**
 * "I speak" values that have native lines today (docs/content-status.md: German clips carry `en` native lines, English clips `de`).
 * The contracts enum (NATIVE_LANGS) stays wide so stored learners with other values still parse; Settings shows such a value but
 * ◄► only move to these, and first run offers only these (QA #15). Shared by Settings and first run.
 */
export const SUPPORTED_NATIVES: readonly Lang[] = ['en', 'de']
export const nativeName = (code: string): string => NATIVE_LANGS.find((n) => n.code === code)?.name ?? code
/** Supported "I speak" options for a learning language, never the learning language itself (today: exactly one). */
export function supportedNatives(learning: Lang): Array<{ code: string; name: string }> {
  return SUPPORTED_NATIVES.filter((c) => c !== learning).map((code) => ({ code, name: nativeName(code) }))
}
