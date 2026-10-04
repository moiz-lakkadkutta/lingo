import { extractSessionCode } from '@lingo/contracts'
/** Six-box code entry: auto-advance, paste or joinUrl fills all six, backspace walks back. Same alphabet as SESSION_CODE_RE. */
export const CODE_LEN = 6
export type Boxes = readonly string[]                 // length 6; '' or one char
const CODE_CHAR = /[A-HJ-NP-Z2-9]/
export function emptyBoxes(): string[] { return Array.from({ length: CODE_LEN }, () => '') }
/**
 * Text typed or pasted into box i. If extractSessionCode(text) finds a full code (paste, autofill, a joinUrl) → all six boxes, focus 5, complete = code.
 * Else uppercase, keep chars matching /[A-HJ-NP-Z2-9]/; none kept and text non-empty → rejected: true, boxes unchanged.
 * Kept chars fill boxes i, i+1, … (overflow dropped); focus = index after the last filled (max 5); complete = joined code when all six are filled.
 */
export function typeInto(b: Boxes, i: number, text: string): { boxes: string[]; focus: number; complete: string | null; rejected: boolean } {
  const full = extractSessionCode(text)
  if (full) return { boxes: full.split(''), focus: CODE_LEN - 1, complete: full, rejected: false }
  const kept = text.toUpperCase().split('').filter((c) => CODE_CHAR.test(c))
  if (kept.length === 0) return { boxes: [...b], focus: i, complete: null, rejected: text.length > 0 }
  const boxes = [...b]
  let j = i
  for (const c of kept) { if (j >= CODE_LEN) break; boxes[j++] = c }
  const complete = boxes.every((x) => x.length === 1) ? boxes.join('') : null
  return { boxes, focus: Math.min(j, CODE_LEN - 1), complete, rejected: false }
}
/** Box i non-empty → clear i, focus i. Box i empty and i > 0 → clear i − 1, focus i − 1. */
export function backspace(b: Boxes, i: number): { boxes: string[]; focus: number } {
  const boxes = [...b]
  if (boxes[i]) { boxes[i] = ''; return { boxes, focus: i } }
  if (i > 0) { boxes[i - 1] = ''; return { boxes, focus: i - 1 } }
  return { boxes, focus: 0 }
}
