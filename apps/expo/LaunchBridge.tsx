import { useEffect } from 'react'
import { Linking } from 'react-native'
import { parseLaunchUri } from '@lingo/shared-ui'
import type { LaunchIntent } from '@moizp/vega-media-kit'

// Fire OS launch intents: Android VIEW deep links lingo://clip/<slug>[?t=<seconds>] (app.json intent filter). Fire TV catalog /
// launcher integration opens the app with these once the catalog is ingested (submission-time):
// https://developer.amazon.com/docs/catalog/integrate-with-launcher.html · https://developer.amazon.com/docs/catalog/verify-deep-links-from-the-catalog.html
// Test: adb shell am start -a android.intent.action.VIEW -d "lingo://clip/<slug>?t=30"
export function LaunchBridge({ emit }: { emit: (i: LaunchIntent) => void }) {
  useEffect(() => {
    const open = (url: string | null) => {
      const i = url ? parseLaunchUri(url) : null
      if (i) emit(i)
    }
    void Linking.getInitialURL().then(open).catch(() => {})
    const sub = Linking.addEventListener('url', ({ url }) => open(url))
    return () => sub.remove()
  }, [emit])
  return null
}
