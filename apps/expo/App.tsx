import React from 'react'
import { LogBox, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage' // https://docs.expo.dev/versions/v54.0.0/sdk/async-storage/
import Constants from 'expo-constants' // https://docs.expo.dev/versions/v54.0.0/sdk/constants/
import * as Crypto from 'expo-crypto' // https://docs.expo.dev/versions/v54.0.0/sdk/crypto/
import { Root, createLaunchBus, createRemoteBus, guardStore, noStore, tokens, useDeviceId, type IdStore } from '@lingo/shared-ui'
import { RemoteBridge } from './RemoteBridge'
import { LaunchBridge } from './LaunchBridge'
import { createFireOsStore } from './src/fireosStore'

// Fire OS entry. Platform-specific wiring (fonts, IAP, camera, remote keys, deep links) goes here, never in shared-ui.
const remoteBus = createRemoteBus()
const launchBus = createLaunchBus()
// QA #14: off-store installs (sideloaded APK, no Amazon Appstore / App Tester) cannot open the billing connection. guardStore tries once,
// caches "unavailable" and never retries; Plus stays gated. react-native-iap still console.errors the first failure, which LogBox
// would show over unrelated screens in debug builds, so its "[RN-IAP]" logs are hidden from LogBox (dev only).
if (__DEV__) LogBox.ignoreLogs(['[RN-IAP]'])
// The demo variant (app.config.js, LINGO_VARIANT=demo, which writes extra.lingoVariant into the embedded app config) talks to a demo API where everyone has Plus (LINGO_PLUS_MODE=demo), so it
// never opens the Appstore billing connection: noStore skips the startup restore, and the Plus screen shows the demo state.
const demo = Constants.expoConfig?.extra?.lingoVariant === 'demo'
const plusStore = demo ? noStore : guardStore(createFireOsStore())
// Per-install learner id (review-005 H1): created once with a random UUID, kept in AsyncStorage, the API's x-device-id.
const idStore: IdStore = { get: (k) => AsyncStorage.getItem(k), set: (k, v) => AsyncStorage.setItem(k, v) }
const newUuid = () => Crypto.randomUUID()

export default function App() {
  const deviceId = useDeviceId(idStore, newUuid)
  return (
    <>
      <RemoteBridge emit={remoteBus.emit} />
      <LaunchBridge emit={launchBus.emit} />
      {/* QA #3: the ground colour (same as the splash) while the device id loads, never a blank frame. */}
      {deviceId
        ? <Root apiBaseUrl={process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000'} scale={0.5} deviceId={deviceId} remote={remoteBus} plusStore={plusStore} launches={launchBus} />
        : <View style={{ flex: 1, backgroundColor: tokens.color.ground }} />}
    </>
  )
}
