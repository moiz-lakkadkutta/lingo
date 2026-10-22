// Dynamic Expo config: app.json is the base ("Lingo", dev.moizp.lingo, scheme lingo, Lingo Plus through Amazon IAP).
// LINGO_VARIANT=demo builds "Lingo Plus Demo" (dev.moizp.lingo.demo, scheme lingodemo) for the demo API (LINGO_PLUS_MODE=demo,
// everyone has Plus), installable next to the default app on one Fire TV Stick. A second app claiming lingo://clip would make
// Android show a chooser on every deep link, so the demo app has its own scheme; LaunchBridge.tsx accepts both.
// The JS side reads EXPO_PUBLIC_LINGO_VARIANT (inlined at bundle time); scripts/build-apk.mjs sets both variables together.
// https://docs.expo.dev/workflow/configuration/#dynamic-configuration
const VARIANTS = ['iap', 'demo']

function variant() {
  const v = process.env.LINGO_VARIANT || 'iap'
  if (!VARIANTS.includes(v)) throw new Error(`LINGO_VARIANT must be one of ${VARIANTS.join(', ')} (or unset), got "${v}"`)
  return v
}

/** Replaces the scheme of the lingo://clip VIEW intent filter. */
function withScheme(intentFilters, scheme) {
  return (intentFilters ?? []).map((f) =>
    f.action === 'VIEW' ? { ...f, data: (f.data ?? []).map((d) => (d.scheme === 'lingo' ? { ...d, scheme } : d)) } : f,
  )
}

module.exports = ({ config }) => {
  const v = variant()
  const extra = { ...config.extra, lingoVariant: v }
  if (v !== 'demo') return { ...config, extra }
  return {
    ...config,
    name: 'Lingo Plus Demo',
    scheme: 'lingodemo',
    extra,
    android: {
      ...config.android,
      package: 'dev.moizp.lingo.demo',
      intentFilters: withScheme(config.android?.intentFilters, 'lingodemo'),
    },
  }
}

module.exports.withScheme = withScheme
