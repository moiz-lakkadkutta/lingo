# Lingo — Fire OS (Expo)

`react-native` here is **react-native-tvos** (`npm:react-native-tvos@0.81.5-2`, the 0.81 line that matches Expo SDK 54) with the
`@react-native-tvos/config-tv` plugin, per Expo's [Building for TV](https://docs.expo.dev/guides/building-for-tv/) guide.
`RemoteBridge.tsx` feeds its `useTVEventHandler` into shared-ui's `RemoteSource`.

Native rebuild (after any change to native dependencies or `app.json`; `android/` is generated and not committed):

```
cd apps/expo && EXPO_TV=1 npx expo prebuild --clean
pnpm --filter @lingo/expo android
```

Then press `a` in `pnpm expo` with the stick connected (`adb connect <ip>`), or `pnpm --filter @lingo/expo build:tv` for an APK.
The Leanback launcher intent is set so the app shows on the Fire TV home. JS-only check: `EXPO_TV=1 npx expo export --platform android`.

`metro.config.js` watches the linked kit checkout, keeps react-native-tvos the only `react-native` in the bundle, and bundles the
kit's Vega-only requires (`shaka-player`, `@amazon-devices/*`) as empty modules.
