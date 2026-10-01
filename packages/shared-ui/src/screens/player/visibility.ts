import { strings } from '../../strings'

/** challenge → only the Menu-revealed cue; else always → true; onPause → paused || revealed; never → revealed. */
export function nativeVisible(a: { setting: 'always' | 'onPause' | 'never'; challenge: boolean; paused: boolean; revealedCue: number | null; cueIndex: number | null }): boolean {
  const revealed = a.revealedCue !== null && a.revealedCue === a.cueIndex
  if (a.challenge) return revealed
  if (a.setting === 'always') return true
  if (a.setting === 'onPause') return a.paused || revealed
  return revealed
}

/** Status line parts, in order: Challenge, then 0.75×. Empty at 1× outside Challenge. */
export function statusParts(a: { challenge: boolean; rate: 1 | 0.75 }): string[] {
  const parts: string[] = []
  if (a.challenge) parts.push(strings.player.challenge)
  if (a.rate === 0.75) parts.push(strings.player.slow)
  return parts
}
