// Dynamic Expo config: app.json is the base ("Lingo", dev.moizp.lingo, scheme lingo, Lingo Plus through Amazon IAP).
// LINGO_VARIANT=demo builds "Lingo Plus Demo" (dev.moizp.lingo.demo, scheme lingodemo) for the demo API (LINGO_PLUS_MODE=demo,
// everyone has Plus), installable next to the default app on one Fire TV Stick. A second app claiming lingo://clip would make
// Android show a chooser on every deep link, so the demo app has its own scheme; LaunchBridge.tsx accepts both.
// The variant is written to extra.lingoVariant, which App.tsx reads at run time through expo-constants (one source of truth).
// The demo app never opens the Appstore billing connection, so it also drops the withAmazonIap plugin (no openiapStore=amazon,
// no Appstore key in the APK).
// https://docs.expo.dev/workflow/configuration/#dynamic-configuration · https://docs.expo.dev/versions/v54.0.0/sdk/constants/
const VARIANTS = ['iap', 'demo']
const IAP_PLUGIN = './plugins/withAmazonIap'

/** LINGO_VARIANT → 'iap' (unset or empty) | 'demo'. Anything else throws, so a typo never builds the wrong app. */
function variantOf(env) {
  const v = env.LINGO_VARIANT || 'iap'
  if (!VARIANTS.includes(v)) throw new Error(`LINGO_VARIANT must be one of ${VARIANTS.join(', ')} (or unset), got "${v}"`)
  return v
}

/** Replaces the lingo scheme in the VIEW intent filters. `data` may be one object or an array (Expo accepts both). */
function withScheme(intentFilters, scheme) {
  return (intentFilters ?? []).map((f) =>
    f.action === 'VIEW' ? { ...f, data: [].concat(f.data ?? []).map((d) => (d.scheme === 'lingo' ? { ...d, scheme } : d)) } : f,
  )
}

const pluginName = (p) => (Array.isArray(p) ? p[0] : p)

/** The app config for one variant, from the app.json config. */
function resolveConfig(config, v) {
  const extra = { ...config.extra, lingoVariant: v }
  if (v !== 'demo') return { ...config, extra }
  return {
    ...config,
    name: 'Lingo Plus Demo',
    scheme: 'lingodemo',
    extra,
    plugins: (config.plugins ?? []).filter((p) => pluginName(p) !== IAP_PLUGIN),
    android: {
      ...config.android,
      package: 'dev.moizp.lingo.demo',
      intentFilters: withScheme(config.android?.intentFilters, 'lingodemo'),
    },
  }
}

module.exports = ({ config }) => resolveConfig(config, variantOf(process.env))
module.exports.variantOf = variantOf
module.exports.withScheme = withScheme
module.exports.resolveConfig = resolveConfig
