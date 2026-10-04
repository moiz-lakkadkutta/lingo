# Vega: which React Native version? The docs, npm and Amazon's samples disagree

Task attempted: Create `apps/vega` (LING-008) as a React Native for Vega project that consumes Lingo's shared screens, and pick the
React Native line, React version, `@amazon-devices/react-native-kepler` version, `react-native-svg` port and manifest `runtime-module`.
Steps:
  1. Read the React Native for Vega docs Lingo already cites (pages under `docs/react-native-vega/0.72/…`, e.g. TVEventHandler).
  2. `npm view @amazon-devices/react-native-kepler dist-tags version peerDependencies dependencies` (2026-10-01).
  3. Read `package.json` and `manifest.toml` of Amazon's two samples: `react-native-multi-tv-app-sample/apps/vega` and `vega-video-sample`.
  4. Compare with shared-ui (React 19.1, react-native-tvos 0.81) and the monorepo's `pnpm.overrides.react = 19.1.0`.
Expected: One documented version set for a new Vega app (SDK ↔ RN for Vega ↔ react-native-kepler ↔ React ↔ runtime-module), used by
the docs, the npm `latest` tag and the samples alike.
Actual:
  - The docs pages Lingo cites are versioned `react-native-vega/0.72`; in review the on-disk kepler typings were labelled rn0.83
    (docs/plans/LING-003.md, spike S2).
  - npm: `@amazon-devices/react-native-kepler` `latest` = 4.0.1 with peer `react ^19.2.0` and RN 0.83 internals
    (`@react-native/codegen 0.83.0`, `metro-runtime ^0.83.3`); dist-tags `rn83-alpha` = 4.0.0-rn-83 and `rn83-alpha-old` = 4.0.0;
    the `last_published` tag points at 2.1.0. `@amazon-devices/react-native-svg` has a 2.0.x line and a 3.0.x line;
    `@amazon-devices/kepler-cli-platform` has `latest` 0.22.14 and `rn83-alpha` 0.22.13-rn-83.3.
  - The multi-TV sample's Vega app uses react 18.2.0, react-native 0.72.0, kepler `^2.0.0` and runtime-module
    `/com.amazon.kepler.keplerscript.runtime.loader_2@IKeplerScript_2_0`. vega-video-sample (3.24.0) uses react 19.2.0,
    react-native 0.83.0, kepler `~4.0.0+rn0.83.0` and runtime-module `/com.amazon.kepler.runtime.react_native_kepler_4@IReactNativeKepler_0`.
  - The RN line, React version, runtime-module and svg/w3cmedia lines change together, and nothing states which pairing a new app should
    start from. The monorepo's React 19.1 override fits neither line, which is why apps/vega had to leave the pnpm workspace.
Severity: Medium — a planning cycle spent on the choice, and the choice stays provisional until someone runs `vega project create`
with SDK 0.24 (minutes lost: TBD by human).
Workaround: Chose the 0.83 line (npm `latest`, the video sample's set, closest to shared-ui's React 19), kept apps/vega outside the
pnpm workspace as an npm project, and wrote `pnpm check:vega` so the five values cannot drift apart; the 0.72 set is documented as a
mechanical switch (apps/vega/README.md). `npm install`, `tsc` and `react-native bundle --platform kepler` pass on the 0.83 set
without the SDK (apps/vega/README.md, 2026-10-01).
Suggestion: Publish one version matrix (SDK ↔ RN for Vega ↔ react-native-kepler ↔ React ↔ runtime-module ↔ svg/w3cmedia lines),
name the default for new projects, version the docs URL with it, and align both samples (or label the multi-TV sample as the 0.72 line).
Environment: Platform: Vega OS (React Native for Vega). No Vega SDK installed; npm registry and GitHub raw files read 2026-10-01 from Linux,
Node 22.22, npm 10.9.
Links:
  - https://www.npmjs.com/package/@amazon-devices/react-native-kepler · https://www.npmjs.com/package/@amazon-devices/react-native-svg · https://www.npmjs.com/package/@amazon-devices/kepler-cli-platform
  - https://github.com/AmazonAppDev/react-native-multi-tv-app-sample/blob/main/apps/vega/package.json and manifest.toml
  - https://github.com/AmazonAppDev/vega-video-sample/blob/main/package.json and manifest.toml
  - https://developer.amazon.com/docs/react-native-vega/0.72/using_tveventhandler.html
  - docs/plans/LING-003.md (spike S2), docs/plans/LING-008.md §3.1–3.2, apps/vega/README.md, scripts/check-vega.mjs
