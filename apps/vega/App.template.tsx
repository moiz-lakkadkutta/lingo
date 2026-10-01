import React, { useCallback } from 'react'
import { useTVEventHandler } from '@amazon-devices/react-native-kepler'
import { Root, createLaunchBus, createRemoteBus, type RawRemoteEvent } from '@lingo/shared-ui'
import { createVegaStore } from './iap/vegaStore'
import { registerLingoContentLauncher } from './platform/contentLauncher'

// Vega entry. Sizes are px at 1080p → scale 1.
// Remote keys: the only import of @amazon-devices/react-native-kepler in Lingo. Events carry eventType
// (up/down/left/right/select/menu/playpause/skip_backward/skip_forward…) and eventKeyAction (0 pressed, 1 released):
// https://developer.amazon.com/docs/react-native-vega/0.72/using_tveventhandler.html
const remoteBus = createRemoteBus()
// Lingo Plus (LING-007): Appstore IAP through @amazon-devices/keplerscript-appstore-iap-lib, verified server-side with RVS.
const plusStore = createVegaStore()
// Content Launcher (LING-007): voice/search launches → Root, which opens known clips and ignores unknown ones. The app does not hold
// the catalog, so the handler accepts any well-formed lingo_slug (TODO(KIT-E2): answer from Root once the kit's callback can).
const launchBus = createLaunchBus()
registerLingoContentLauncher(launchBus.emit, () => null)

function RemoteBridge({ emit }: { emit: (e: RawRemoteEvent) => void }) {
  const onEvent = useCallback((e: { eventType: string; eventKeyAction?: number }) => emit({ eventType: e.eventType, eventKeyAction: e.eventKeyAction }), [emit])
  useTVEventHandler(onEvent)
  return null
}

export default function App() {
  return (
    <>
      <RemoteBridge emit={remoteBus.emit} />
      <Root apiBaseUrl={'https://api.lingo.example'} scale={1} remote={remoteBus} plusStore={plusStore} launches={launchBus} />
    </>
  )
}
