# Vega Metro: a project `resolveRequest` silently drops the `react-native` → `react-native-kepler` redirect, and the app aborts with `Platform` undefined

Task attempted: Run Lingo's first `.vpkg` on the Vega Virtual Device (LING-008, VVD checklist step 4). The app installs and "Successfully
launched", then exits within a second; `vega device is-app-running` says not running.
Steps:
  1. `vega run-app build/aarch64-release/vega_aarch64.vpkg dev.moizp.lingo.main -d VirtualDevice` → launched, then gone.
  2. No app lines in `loggingctl log`; found the crash through `vega device get-log-info` → `SYSTEM_TOMBSTONE/acr`, copied with
     `vega device copy-logs --device VirtualDevice --artifact SYSTEM_TOMBSTONE/acr --directory <dir>`. The `.acr` file is text with
     `CrashLang:JavaScript`, `CrashReason:SIGABRT` and the JS stack:
     `TypeError: Cannot read property 'OS' of undefined at AppStateImpl (…/build/lib/rn-bundles/Release/<hash>.bundle:48267)` ← `get AppState`
     (react-native index.js) ← `MMKV` (`@amazon-devices/react-native-mmkv`) ← Lingo's `App.tsx`.
  3. Source map of the build: 424 of 758 sources were `apps/vega/node_modules/react-native/…` (plain React Native 0.83.0), 16 from
     `@amazon-devices/react-native-kepler`. Plain RN's `Libraries/Utilities/Platform.js` is `import Platform from './Platform'` (a stub that
     expects a `.ios.js`/`.android.js` sibling); there is no `Platform.kepler.js` in plain RN, so the import cycles and `Platform` is undefined.
  4. Why plain RN: `@react-native/community-cli-plugin` `loadMetroConfig` (RN 0.83) applies the out-of-tree redirect
     (`react-native` → `platforms.kepler.npmPackageName` = `@amazon-devices/react-native-kepler`) through `setFrameworkDefaults(...)`, i.e. as a
     default `resolver.resolveRequest` inside `getDefaultConfig()`. Lingo's `metro.config.js` defines its own `resolver.resolveRequest` (Shaka
     stub, single React copy for shared-ui), and `mergeConfig` replaces the default function instead of chaining it. Nothing warns.
Expected: Either the redirect survives a project `resolveRequest` (chain it, or do it in `redirectModulePath`), or the Vega build fails
fast ("react-native resolved to plain React Native for platform kepler"), or the docs say "if you define resolveRequest, call the
default one / redirect react-native yourself".
Actual: The build is green (Metro, Hermes, `vpt validate`, ABI validation), the bundle is 3.9 MB with a second React Native in it, and
the first symptom is a SIGABRT tombstone with a JS stack; `loggingctl log` shows nothing for the package. About 90 minutes from launch to
root cause (source map, module graph of the bundle, reading the CLI's `loadMetroConfig`).
Severity: High for anyone with a custom Metro resolver (monorepos, Shaka stubs, aliasing): the app cannot start. Medium otherwise.
Workaround: Redirect in the project resolver: `if (platform === 'kepler' && (moduleName === 'react-native' || moduleName.startsWith('react-native/')))
moduleName = '@amazon-devices/react-native-kepler' + moduleName.slice('react-native'.length)` before any other resolution
(apps/vega/metro.config.js, rule 3). Alternatively chain `getDefaultConfig(__dirname).resolver.resolveRequest` from the custom resolver.
With the redirect in place the rebuilt bundle has zero `node_modules/react-native/` sources (758 → 330 sources; `.vpkg` 2.1 MB → 1.5 MB).
Suggestion: In `@amazon-devices/kepler-cli-platform`, wrap the project's `resolveRequest` after loading the config (the CLI already
re-merges the config for system bundles in `applySystemBundleConfig`), or fail the build when a module under `node_modules/react-native/`
is bundled for platform kepler; document the rule on the Metro/"Build your app" page; make the tombstone's JS stack reach
`loggingctl log` (or print "app crashed, see get-log-info") so a developer does not have to know about `SYSTEM_TOMBSTONE/acr`.
Environment: Platform: Vega OS. VVD (SDK 0.24.12112, OS build 2111248248030), Vega CLI 1.4.4, @amazon-devices/kepler-cli-platform 0.22.14,
@react-native/community-cli-plugin 0.83.x, react-native 0.83.0, @amazon-devices/react-native-kepler 4.0.1+rn0.83.0,
@amazon-devices/react-native-mmkv 1.0.11+3.0.2, macOS 26.2 (arm64), 2026-10-14.
Links:
  - apps/vega/metro.config.js (rule 3), apps/vega/node_modules/@react-native/community-cli-plugin/dist/utils/loadMetroConfig.js, …/metroPlatformResolver.js
  - https://developer.amazon.com/docs/vega/0.24/build-an-app.html · https://developer.amazon.com/docs/vega/0.24/cli-tools
  - https://github.com/AmazonAppDev/react-native-multi-tv-app-sample/blob/main/apps/vega/metro.config.js (uses extraNodeModules only, so it keeps the redirect)
  - docs/spikes/2026-10-14-vega-vvd.md
