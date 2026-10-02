import React, { useCallback } from 'react'
import { useTVEventHandler } from '@amazon-devices/react-native-kepler'
import { MMKV } from '@amazon-devices/react-native-mmkv'
import { Root, createLaunchBus, createRemoteBus, useDeviceId, type IdStore, type RawRemoteEvent } from '@lingo/shared-ui'
import { API_BASE_URL } from './config'
import { createVegaStore } from './iap/vegaStore'
import { registerLingoContentLauncher } from './platform/contentLauncher'

// Vega entry. Sizes are px at 1080p → scale 1 (CLAUDE.md: Fire OS 0.5, Vega 1).
// Remote keys: the only import of @amazon-devices/react-native-kepler in Lingo. Events carry eventType
// (up/down/left/right/select/menu/playpause/skip_backward/skip_forward…) and eventKeyAction (0 pressed, 1 released):
// https://developer.amazon.com/docs/react-native-vega/0.72/using_tveventhandler.html
// Video playback is off on Vega (shared-ui caps.playback = false) until the kit's Vega adapter is rewritten (KIT-010).
const remoteBus = createRemoteBus()
// Lingo Plus (LING-007): Appstore IAP through @amazon-devices/keplerscript-appstore-iap-lib, verified server-side with RVS.
const plusStore = createVegaStore()
// Content Launcher (LING-007): voice/search launches → Root, which opens known clips and ignores unknown ones. The app does not hold
// the catalog, so the handler accepts any well-formed lingo_slug (TODO(KIT-E2): answer from Root once the kit's callback can).
const launchBus = createLaunchBus()
registerLingoContentLauncher(launchBus.emit, () => null)
// Per-install learner id (review-005 H1): created once, kept in MMKV (Amazon's Vega build of react-native-mmkv,
// npm @amazon-devices/react-native-mmkv, README.kepler.md: `new MMKV()`, getString / set), sent as x-device-id.
const kv = new MMKV({ id: 'lingo' })
const idStore: IdStore = { get: (k) => kv.getString(k), set: (k, v) => kv.set(k, v) }

function RemoteBridge({ emit }: { emit: (e: RawRemoteEvent) => void }) {
  const onEvent = useCallback((e: { eventType: string; eventKeyAction?: number }) => emit({ eventType: e.eventType, eventKeyAction: e.eventKeyAction }), [emit])
  useTVEventHandler(onEvent)
  return null
}

export default function App() {
  const deviceId = useDeviceId(idStore)
  return (
    <>
      <RemoteBridge emit={remoteBus.emit} />
      {deviceId && <Root apiBaseUrl={API_BASE_URL} scale={1} deviceId={deviceId} remote={remoteBus} plusStore={plusStore} launches={launchBus} />}
    </>
  )
}
