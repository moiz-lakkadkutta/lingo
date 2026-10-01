import React from 'react'
import { Root, createLaunchBus, createRemoteBus } from '@lingo/shared-ui'
import { RemoteBridge } from './RemoteBridge'
import { LaunchBridge } from './LaunchBridge'
import { createFireOsStore } from './src/fireosStore'

// Fire OS entry. Platform-specific wiring (fonts, IAP, camera, remote keys, deep links) goes here, never in shared-ui.
const remoteBus = createRemoteBus()
const launchBus = createLaunchBus()
const plusStore = createFireOsStore()

export default function App() {
  return (
    <>
      <RemoteBridge emit={remoteBus.emit} />
      <LaunchBridge emit={launchBus.emit} />
      <Root apiBaseUrl={process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000'} scale={0.5} remote={remoteBus} plusStore={plusStore} launches={launchBus} />
    </>
  )
}
