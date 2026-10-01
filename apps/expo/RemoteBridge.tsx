import { useCallback } from 'react'
import { useTVEventHandler, type HWEvent } from 'react-native'
import type { RawRemoteEvent } from '@lingo/shared-ui'

/**
 * Fire OS remote keys → shared-ui RemoteSource (decision 0006 §3). `react-native` here is react-native-tvos (npm alias in package.json),
 * which adds useTVEventHandler: https://github.com/react-native-tvos/react-native-tvos#readme
 * Events carry eventType (left/right/up/down/select/playPause/menu/rewind/fastForward…) and eventKeyAction (0 down, 1 up).
 * Android sends key-down only with ReactFeatureFlags.enableKeyDownEvents (set by plugins/withKeyDownEvents.js); held D-pad/Select
 * keys arrive as long<Key> 0 / long<Key> 1. shared-ui's normalise handles both (decision 0006 §3).
 * shared-ui never imports TV-specific APIs; it only sees RawRemoteEvent.
 */
// Spike S1 (docs/spikes/S1-fire-os-remote.md): EXPO_PUBLIC_LINGO_SPIKE=1 logs one line per event to logcat (tag ReactNativeJS).
const spike = process.env.EXPO_PUBLIC_LINGO_SPIKE === '1'

export function RemoteBridge({ emit }: { emit: (e: RawRemoteEvent) => void }) {
  const onEvent = useCallback((e: HWEvent) => {
    if (spike) console.log(`LINGO-SPIKE ${e.eventType} ${e.eventKeyAction ?? '-'} ${Date.now()}`)
    emit({ eventType: e.eventType, eventKeyAction: e.eventKeyAction })
  }, [emit])
  useTVEventHandler(onEvent)
  return null
}
