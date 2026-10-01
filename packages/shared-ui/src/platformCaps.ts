import { Platform } from 'react-native'

/** What the running OS can honour in the Player (decision 0006 §1, §4). */
export interface Caps { rate: boolean; wordFocusIn: 'cue' | 'card' }

/**
 * 'kepler' | 'vega' → { rate: false, wordFocusIn: 'cue' } (w3cmedia lists playbackRate as unsupported);
 * anything else → { rate: true, wordFocusIn: 'cue' }. Flip wordFocusIn per OS here if a device spike fails (LING-003 S1/S2).
 */
export function capsFor(os: string): Caps {
  if (os === 'kepler' || os === 'vega') return { rate: false, wordFocusIn: 'cue' }
  return { rate: true, wordFocusIn: 'cue' }
}

export const caps: Caps = capsFor(Platform.OS)
