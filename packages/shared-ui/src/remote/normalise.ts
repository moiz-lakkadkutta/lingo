import { mapKey } from '@moizp/vega-media-kit'
import type { RemoteEvent, RemoteKey } from '@moizp/vega-media-kit'
import type { RawRemoteEvent } from './types'

export type KeyPhase = 'down' | 'up'

/**
 * eventKeyAction 0 → [down]; 1 → [up]; undefined → [down, up]. eventType starting with 'long' → [] (the press tracker derives
 * long-press itself). Unknown names (mapKey undefined) → []. Names go through the kit's mapKey (RNTV and Vega spellings).
 */
export function normalise(e: RawRemoteEvent): Array<{ phase: KeyPhase; key: RemoteKey }> {
  if (e.eventType.startsWith('long')) return []
  const key = mapKey(e.eventType)
  if (!key) return []
  if (e.eventKeyAction === 0) return [{ phase: 'down', key }]
  if (e.eventKeyAction === 1) return [{ phase: 'up', key }]
  return [{ phase: 'down', key }, { phase: 'up', key }]
}

export interface PressTracker { down(key: RemoteKey, now: number): RemoteEvent | null; up(key: RemoteKey, now: number): RemoteEvent | null }

/**
 * First down records the time. A later down (repeat) at ≥ longPressMs since the first fires { longPress: true, repeat: false } once,
 * then { longPress: true, repeat: true } for further repeats. Up: if a long press already fired → null; else if now − downAt ≥ longPressMs →
 * { longPress: true, repeat: false }; else { longPress: false, repeat: false }. Up without a down → short press. Per-key state.
 * Unlike the kit's useRemote, a long hold is detected on release even when the platform sends no repeats.
 */
export function createPressTracker(longPressMs: number): PressTracker {
  const held = new Map<RemoteKey, { downAt: number; fired: boolean }>()
  return {
    down(key, now) {
      const st = held.get(key)
      if (!st) { held.set(key, { downAt: now, fired: false }); return null }
      if (st.fired) return { key, longPress: true, repeat: true }
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
