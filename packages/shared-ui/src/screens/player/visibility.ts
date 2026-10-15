import { strings } from '../../strings'

/** challenge → only the Menu-revealed cue; else always → true; onPause → paused || revealed; never → revealed. */
export function nativeVisible(a: { setting: 'always' | 'onPause' | 'never'; challenge: boolean; paused: boolean; revealedCue: number | null; cueIndex: number | null }): boolean {
  const revealed = a.revealedCue !== null && a.revealedCue === a.cueIndex
  if (a.challenge) return revealed
  if (a.setting === 'always') return true
  if (a.setting === 'onPause') return a.paused || revealed
  return revealed
}

/**
 * Progress strip (QA #12): always while paused (the Explain card, or paused before the first line) and during the end-of-line hold;
 * while playing only with the chrome, i.e. for overlayHideMs after a seek or another key (the same timer as the status line), so
 * uninterrupted playback shows the subtitles alone. Hidden behind the settings sheet.
 */
export function progressVisible(a: { phase: 'playing' | 'holding' | 'explain' | 'sheet'; now: number; chromeUntil: number }): boolean {
  if (a.phase === 'explain' || a.phase === 'holding') return true
  if (a.phase === 'sheet') return false
  return a.now < a.chromeUntil
}

/** Status line parts, in order: Challenge, then 0.75×. Empty at 1× outside Challenge. */
export function statusParts(a: { challenge: boolean; rate: 1 | 0.75 }): string[] {
  const parts: string[] = []
  if (a.challenge) parts.push(strings.player.challenge)
  if (a.rate === 0.75) parts.push(strings.player.slow)
  return parts
}
