import React from 'react'
import { useTVEventHandler } from '@amazon-devices/react-native-kepler'
import { Root, createRemoteBus, type RawRemoteEvent } from '@lingo/shared-ui'

// Vega entry. Sizes are px at 1080p → scale 1.
// Remote keys: the only import of @amazon-devices/react-native-kepler in Lingo. Events carry eventType
// (up/down/left/right/select/menu/playpause/skip_backward/skip_forward…) and eventKeyAction (0 pressed, 1 released):
// https://developer.amazon.com/docs/react-native-vega/0.72/using_tveventhandler.html
const remoteBus = createRemoteBus()

function RemoteBridge({ emit }: { emit: (e: RawRemoteEvent) => void }) {
  useTVEventHandler((e: { eventType: string; eventKeyAction?: number }) => emit({ eventType: e.eventType, eventKeyAction: e.eventKeyAction }))
  return null
}

export default function App() {
  return (
    <>
      <RemoteBridge emit={remoteBus.emit} />
      <Root apiBaseUrl={'https://api.lingo.example'} scale={1} remote={remoteBus} />
    </>
  )
}
