import { Platform } from 'react-native'

/** What the running OS can honour in the Player (decision 0006 §1, §4). */
export interface Caps {
  rate: boolean
  wordFocusIn: 'cue' | 'card'
  /**
   * false on Vega until KIT-010: the kit's Vega adapter does not play video yet (kit decision 0002); flip when it does.
   * Optional so Caps literals elsewhere stay valid; absent means true. When false the Player shows strings.playbackOff instead of KitPlayer.
   */
  playback?: boolean
}

/**
 * 'kepler' | 'vega' → { rate: false, wordFocusIn: 'cue', playback: false } (w3cmedia lists playbackRate as unsupported; KIT-010 for playback);
 * anything else → { rate: true, wordFocusIn: 'cue', playback: true }. Flip wordFocusIn per OS here if a device spike fails (LING-003 S1/S2).
 */
export function capsFor(os: string): Caps {
  if (os === 'kepler' || os === 'vega') return { rate: false, wordFocusIn: 'cue', playback: false }
  return { rate: true, wordFocusIn: 'cue', playback: true }
}

export const caps: Caps = capsFor(Platform.OS)
