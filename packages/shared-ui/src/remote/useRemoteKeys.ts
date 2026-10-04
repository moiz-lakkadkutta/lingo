import { useEffect, useRef } from 'react'
import type { RemoteEvent } from '@moizp/vega-media-kit'
import { tokens } from '../theme/tokens'
import { createPressTracker, normalise } from './normalise'
import type { RemoteSource } from './types'

/** RemoteSource → normalise → createPressTracker → onEvent. Subscribes only while `enabled` (decision 0006 §2–3). */
export function useRemoteKeys(source: RemoteSource, onEvent: (e: RemoteEvent) => void, enabled: boolean, longPressMs: number = tokens.motion.longPressMs) {
  const cb = useRef(onEvent)
  useEffect(() => { cb.current = onEvent }, [onEvent])
  useEffect(() => {
    if (!enabled) return
    const tracker = createPressTracker(longPressMs)
    return source.subscribe((raw) => {
      const now = Date.now()
      for (const { phase, key, held } of normalise(raw)) {
        const ev = phase === 'down' ? tracker.down(key, now, held) : tracker.up(key, now)
        if (ev) cb.current(ev)
      }
    })
  }, [source, enabled, longPressMs])
}
