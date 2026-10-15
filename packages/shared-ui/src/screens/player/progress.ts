/** Player progress (QA #12): pure helpers for the time text, the bar fill and where the strip sits. Player.tsx and ProgressStrip render them. */

/** Seconds → "m:ss", or "h:mm:ss" from one hour. Whole seconds, rounded down; negative or not finite → "0:00". */
export function formatClock(seconds: number): string {
  const t = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = String(t % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** A usable duration, or null (missing, zero, negative or not finite): then the strip shows elapsed time only and no bar. */
export function knownDuration(durationS: number | null | undefined): number | null {
  return typeof durationS === 'number' && Number.isFinite(durationS) && durationS > 0 ? durationS : null
}

/** Bar fill 0–1; null without a duration. */
export function progressFraction(positionS: number, durationS: number | null): number | null {
  if (durationS === null) return null
  const f = Number.isFinite(positionS) ? positionS / durationS : 0
  return Math.min(1, Math.max(0, f))
}

/** Elapsed (clamped to the duration) and total as clock text; total null without a duration. */
export function progressText(positionS: number, durationS: number | null): { elapsed: string; total: string | null } {
  const pos = durationS === null ? positionS : Math.min(positionS, durationS)
  return { elapsed: formatClock(pos), total: durationS === null ? null : formatClock(durationS) }
}

/**
 * Distance from the screen bottom to the strip's bottom edge, or null when it must not render. Every input is in on-screen units
 * (already scaled). The strip stacks above whatever is lowest on screen, so it never covers the dual cue or the Explain card:
 * - card open and measured → `gap` above the card's top edge;
 * - card open, not measured yet → null (one layout pass; the strip would otherwise land on the card);
 * - no card → `gap` above the cue block (its last measured height, so the strip stays put through the gaps between lines),
 *   and never lower than the status line (`floorH`, bottom-left at safeY) when there is no cue block yet.
 * Null too when the strip would run past the top safe area (a very tall card): hidden rather than overlapping.
 */
export function progressBottom(
  a: { cueBlockH: number | null; card: { bottom: number; height: number | null } | null },
  k: { safeY: number; gap: number; floorH: number; stripH: number; screenH: number },
): number | null {
  let bottom: number
  if (a.card) {
    if (a.card.height === null) return null
    bottom = a.card.bottom + a.card.height + k.gap
  } else {
    bottom = k.safeY + Math.max(a.cueBlockH ?? 0, k.floorH) + k.gap
  }
  return bottom + k.stripH > k.screenH - k.safeY ? null : bottom
}
