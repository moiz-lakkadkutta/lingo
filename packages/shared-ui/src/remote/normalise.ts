import { mapKey } from '@moizp/vega-media-kit'
import type { RemoteEvent, RemoteKey } from '@moizp/vega-media-kit'
import type { RawRemoteEvent } from './types'

export type KeyPhase = 'down' | 'up'

export interface NormalisedKey { phase: KeyPhase; key: RemoteKey; /** the platform already classed this down as a hold */ held?: true }

/**
 * eventKeyAction 0 → [down]; 1 → [up]; undefined → [down, up]; any other value (-1 on focus/blur, 2) → [].
 * react-native-tvos on Android (ReactAndroidHWInputDeviceHelper, decision 0006 §3) sends no repeats: once a D-pad/Select key has been
 * held past its ~300 ms threshold it sends `long<Key>` 0 once and the release as `long<Key>` 1. Those map to the base key with the same
 * action, and the down carries `held: true`. Names go through the kit's mapKey (RNTV and Vega spellings); unknown names → [].
 */
export function normalise(e: RawRemoteEvent): NormalisedKey[] {
  const long = /^long[A-Z]/.test(e.eventType)
  const name = long ? e.eventType.charAt(4).toLowerCase() + e.eventType.slice(5) : e.eventType
  const key = mapKey(name)
  if (!key) return []
  if (e.eventKeyAction === 0) return [long ? { phase: 'down', key, held: true } : { phase: 'down', key }]
  if (e.eventKeyAction === 1) return [{ phase: 'up', key }]
  if (e.eventKeyAction === undefined) return [{ phase: 'down', key }, { phase: 'up', key }]
  return []
}

export interface PressTracker { down(key: RemoteKey, now: number, held?: boolean): RemoteEvent | null; up(key: RemoteKey, now: number): RemoteEvent | null }

/**
 * First down records the time. A later down (repeat) at ≥ longPressMs since the first fires { longPress: true, repeat: false } once,
 * then { longPress: true, repeat: true } for further repeats. A `held` down (react-native-tvos `long<Key>` 0) fires the long press at
 * once, with or without an earlier down: the platform has already timed the hold. Up: if a long press already fired → null; else if
 * now − downAt ≥ longPressMs → { longPress: true, repeat: false }; else { longPress: false, repeat: false }. Up without a down → short
 * press (react-native-tvos without key-down events sends only ups). Per-key state.
 * Unlike the kit's useRemote, a long hold is detected on release even when the platform sends no repeats.
 */
export function createPressTracker(longPressMs: number): PressTracker {
  const held = new Map<RemoteKey, { downAt: number; fired: boolean }>()
  return {
    down(key, now, platformHeld = false) {
      const st = held.get(key)
      if (!st) {
        held.set(key, { downAt: now, fired: platformHeld })
        return platformHeld ? { key, longPress: true, repeat: false } : null
      }
      if (st.fired) return { key, longPress: true, repeat: true }
      if (platformHeld) { st.fired = true; return { key, longPress: true, repeat: false } }
      if (now - st.downAt >= longPressMs) { st.fired = true; return { key, longPress: true, repeat: false } }
      return null
    },
    up(key, now) {
      const st = held.get(key)
      held.delete(key)
      if (!st) return { key, longPress: false, repeat: false }
      if (st.fired) return null
      return { key, longPress: now - st.downAt >= longPressMs, repeat: false }
    },
  }
}
