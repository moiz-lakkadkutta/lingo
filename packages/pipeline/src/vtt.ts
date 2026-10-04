import { readFile } from 'node:fs/promises'
import { lintCues, parseVtt, serializeVtt, type Cue } from '@moizp/vega-media-kit/core'
import { NATIVE_LINE, type Seg } from './segment'

/** Lingo's limits (PLAN §5): ≤ 20 cps, ≤ 2 lines × 42, ≥ 1 s — passed explicitly rather than relying on the kit's Netflix 0.833 s default. */
export const LINT_LIMITS = { cps: 20, lines: 2, lineLength: 42, minDuration: 1 }
/** Native-track budget (docs/decisions/0007 M4): 2 lines × 56 (the 32 px native line next to the 44 px target line), 26 cps = 20 × 1.3. Findings are warnings. */
export const NATIVE_LINT_LIMITS = { cps: 26, lines: 2, lineLength: NATIVE_LINE, minDuration: 1 }

/**
 * Cue ids are `c${index}` (0-based = PreparedCue.index). Text is already wrapped.
 * `note` (BY-SA clips, docs/content.md §5): one `NOTE <text>` block right after the `WEBVTT` header — newlines become spaces, `-->` is
 * rejected (it would end the NOTE block: https://www.w3.org/TR/webvtt1/#introduction-comments). The kit's serializeVtt has no NOTE support.
 */
export function cuesToVtt(cues: Array<{ index: number; startS: number; endS: number; text: string }>, trackId: string, note?: string): string {
  const vtt = serializeVtt(cues.map((c) => ({ trackId, id: `c${c.index}`, start: c.startS, end: c.endS, text: c.text })))
  const line = (note ?? '').replace(/\s*\n\s*/g, ' ').trim()
  if (!line) return vtt
  if (line.includes('-->')) throw new Error(`VTT NOTE must not contain "-->": ${JSON.stringify(line)}`)
  const HEADER = 'WEBVTT\n\n'
  return vtt.startsWith(HEADER) ? `${HEADER}NOTE ${line}\n\n${vtt.slice(HEADER.length)}` : `WEBVTT\n\nNOTE ${line}\n`
}

/** Parse with minDuration 0 / mergeGap 0 so the round trip compares what we wrote, not the kit's padding; lint with Lingo's limits (or the native ones). */
export function checkVtt(vtt: string, trackId: string, limits = LINT_LIMITS): { cues: Cue[]; findings: ReturnType<typeof lintCues> } {
  const cues = parseVtt(vtt, { trackId, minDuration: 0, mergeGap: 0 })
  return { cues, findings: lintCues(cues, limits) }
}

/**
 * The manual-correction input (`prepare --cues`, docs/decisions/0007): parseVtt (minDuration 0, mergeGap 0; NOTE blocks skipped,
 * tags stripped by the kit) → Seg[] in time order, index = position, ms timestamps, text as written (not wrapped here). Throws on zero cues.
 */
export async function loadCuesVtt(path: string, trackId: string): Promise<Seg[]> {
  const cues = parseVtt(await readFile(path, 'utf8'), { trackId, minDuration: 0, mergeGap: 0 })
  if (!cues.length) throw new Error(`no cues in ${path}`)
  const ms = (n: number) => Math.round(n * 1000) / 1000
  return [...cues]
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .map((c, index) => ({ index, startS: ms(c.start), endS: ms(c.end), text: c.text }))
}
