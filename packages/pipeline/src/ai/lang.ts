import { LANGUAGE_NAMES } from '@lingo/contracts'
export { LANGUAGE_NAMES }

/** English name of a language code for prompts; unknown codes fall back to the upper-cased code. */
export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code.toUpperCase()
}
