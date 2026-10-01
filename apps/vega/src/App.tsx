import React, { useCallback } from 'react'
import { useTVEventHandler } from '@amazon-devices/react-native-kepler'
import { Root, createRemoteBus, type RawRemoteEvent } from '@lingo/shared-ui'
import { API_BASE_URL } from './config'

// Vega entry. Sizes are px at 1080p → scale 1 (CLAUDE.md: Fire OS 0.5, Vega 1).
// Remote keys: the only import of @amazon-devices/react-native-kepler in Lingo. Events carry eventType
// (up/down/left/right/select/menu/playpause/skip_backward/skip_forward…) and eventKeyAction (0 pressed, 1 released):
// https://developer.amazon.com/docs/react-native-vega/0.72/using_tveventhandler.html
// Video playback is off on Vega (shared-ui caps.playback = false) until the kit's Vega adapter is rewritten (KIT-010).
const remoteBus = createRemoteBus()

function RemoteBridge({ emit }: { emit: (e: RawRemoteEvent) => void }) {
  const onEvent = useCallback((e: { eventType: string; eventKeyAction?: number }) => emit({ eventType: e.eventType, eventKeyAction: e.eventKeyAction }), [emit])
  useTVEventHandler(onEvent)
  return null
}

export default function App() {
  return (
    <>
      <RemoteBridge emit={remoteBus.emit} />
      <Root apiBaseUrl={API_BASE_URL} scale={1} remote={remoteBus} />
    </>
  )
}
