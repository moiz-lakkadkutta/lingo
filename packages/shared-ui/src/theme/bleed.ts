import { tokens } from './tokens'
import { px } from './scale'

/**
 * How far a focused item of width `w` (design px) reaches past its own edge: half the 1.04 scale growth plus the outline at its offset.
 * A ScrollView clips its children, so a list that starts at its left edge reaches out by this much (negative margin) and pads it back:
 * the content stays where it was and the scaled focus is drawn in full (device test 2026-10-23, shots 64, 70, 74). Device px.
 */
export const focusBleed = (w: number): number => px(Math.ceil((w * (tokens.motion.focusScale - 1)) / 2 + tokens.focus.width + tokens.focus.offset))
