import { tokens } from '../../theme/tokens'

/** Horizontal geometry of the Words screen, in px at 1920×1080 (multiply by scale for the device). x is measured from the content edge (inside safeX). */
export interface WordsLayout {
  /** content width inside the safe area */ contentW: number
  /** row width */ listW: number
  /** left edge of the player panel, or null when it is closed */ panelX: number | null
  /** framed panel width: the 640 px player plus padding on both sides */ panelW: number
}
const L = tokens.layout
/** Space between the list and the panel: two gutters, so a focused row (1.04 scale + outline) never reaches the panel. */
export const WORDS_GAP = 2 * L.gutter

/**
 * Closed: rows at their usual 1100 px. Open (QA #17): the rows narrow so the list and the framed mini player sit side by side inside the
 * safe area; the panel is right-aligned to the content edge.
 */
export function wordsLayout(open: boolean, screenW = 1920): WordsLayout {
  const contentW = screenW - 2 * L.safeX
  const panelW = L.miniW + 2 * L.panelPad
  if (!open) return { contentW, listW: Math.min(L.rowW, contentW), panelX: null, panelW }
  const panelX = contentW - panelW
  return { contentW, listW: Math.min(L.rowW, panelX - WORDS_GAP), panelX, panelW }
}
/** How far a focused row reaches past its own edge on each side: half the 1.04 scale growth plus the outline. */
export const focusOverhang = (w: number): number => (w * (tokens.motion.focusScale - 1)) / 2 + tokens.focus.width

/** The cue text on one line for the panel caption: every line break becomes a space (a cue can have more than two lines). */
export const oneLine = (text: string): string => text.replace(/\s*\n\s*/g, ' ')
