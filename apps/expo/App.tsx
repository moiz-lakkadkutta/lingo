import React from 'react'
import { Root, createRemoteBus } from '@lingo/shared-ui'
import { RemoteBridge } from './RemoteBridge'

// Fire OS entry. Platform-specific wiring (fonts, IAP, camera, remote keys) goes here, never in shared-ui.
const remoteBus = createRemoteBus()

export default function App() {
  return (
    <>
      <RemoteBridge emit={remoteBus.emit} />
      <Root apiBaseUrl={process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000'} scale={0.5} remote={remoteBus} />
    </>
  )
}
