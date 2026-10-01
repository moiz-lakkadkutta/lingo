import type { RemoteKey, TransportControl } from '@moizp/vega-media-kit'

/** Media-control transport (Alexa "pause", VMC) → the Player machine's remote key. No clip-to-clip in the Player, so next/previous → null.
 *  https://developer.amazon.com/docs/vega/0.22/media-controls-get-started */
export function transportToKey(c: TransportControl): RemoteKey | null {
  switch (c) {
    case 'play': return 'play'
    case 'pause': return 'pause'
    case 'togglePlayPause': return 'playPause'
    case 'seekForward': return 'fastForward'
    case 'seekBackward': return 'rewind'
    case 'stop': return 'back'
    case 'next':
    case 'previous':
      return null
  }
}

/** Drops a transport whose mapped key arrived as a remote key within windowMs (default 300): Vega can deliver the same press as a
 *  TVEventHandler key and a VMC command. */
export function createTransportDeduper(windowMs = 300): { sawKey(k: RemoteKey, now: number): void; accept(k: RemoteKey, now: number): boolean } {
  const last = new Map<RemoteKey, number>()
  return {
    sawKey(k, now) { last.set(k, now) },
    accept(k, now) {
      const at = last.get(k)
      return at === undefined || now - at > windowMs
    },
  }
}
