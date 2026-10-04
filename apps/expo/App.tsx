import React from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage' // https://docs.expo.dev/versions/v54.0.0/sdk/async-storage/
import * as Crypto from 'expo-crypto' // https://docs.expo.dev/versions/v54.0.0/sdk/crypto/
import { Root, createLaunchBus, createRemoteBus, useDeviceId, type IdStore } from '@lingo/shared-ui'
import { RemoteBridge } from './RemoteBridge'
import { LaunchBridge } from './LaunchBridge'
import { createFireOsStore } from './src/fireosStore'

// Fire OS entry. Platform-specific wiring (fonts, IAP, camera, remote keys, deep links) goes here, never in shared-ui.
const remoteBus = createRemoteBus()
const launchBus = createLaunchBus()
const plusStore = createFireOsStore()
// Per-install learner id (review-005 H1): created once with a random UUID, kept in AsyncStorage, the API's x-device-id.
const idStore: IdStore = { get: (k) => AsyncStorage.getItem(k), set: (k, v) => AsyncStorage.setItem(k, v) }
const newUuid = () => Crypto.randomUUID()

export default function App() {
  const deviceId = useDeviceId(idStore, newUuid)
  return (
    <>
      <RemoteBridge emit={remoteBus.emit} />
      <LaunchBridge emit={launchBus.emit} />
      {deviceId && <Root apiBaseUrl={process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000'} scale={0.5} deviceId={deviceId} remote={remoteBus} plusStore={plusStore} launches={launchBus} />}
    </>
  )
}
