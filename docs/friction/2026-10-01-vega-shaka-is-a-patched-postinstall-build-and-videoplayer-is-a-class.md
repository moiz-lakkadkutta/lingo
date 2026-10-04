# Vega: Shaka is a patched postinstall build, and `VideoPlayer` is a class, not a component

Task attempted: Play HLS with two text tracks on Vega through the shared kit's Vega adapter, the same way the Fire OS adapter plays
it through react-native-video (kit spike KIT-001, then Lingo's Vega app in LING-008).
Steps:
  1. Read `@amazon-devices/react-native-w3cmedia`'s README and Amazon's vega-video-sample.
  2. Write the kit's Vega adapter (`src/player/adapters/vega.tsx`) as `<w3c.VideoPlayer ref={media} …>` plus `require('shaka-player')`
     and `player.attach(element)`.
  3. Bundle Lingo's Vega app with the kit (`react-native bundle --platform kepler`, 2026-10-01).
Expected: w3cmedia offers a media element component, and Shaka Player is an npm dependency like on the web.
Actual:
  - "`VideoPlayer` is a typescript class and not a React Native component" (Vega API reference, w3cmedia README): apps construct it,
    `await initialize()`, render a separate `KeplerVideoSurfaceView` and pass the surface handle back with `setSurfaceHandle`.
    The kit's adapter renders the class as a component, so Shaka is never attached and the adapter cannot work as written
    (kit decision 0002, finding 1).
  - vega-video-sample has no `shaka-player` dependency. Its `postinstall` runs `shaka-setup/build.sh`: clone Shaka, check out v4.8.5,
    `git am` Amazon's patch series (44 patch files numbered 0001–0045, 0016 absent), build with `build/all.py`, copy `dist/` into the app.
    The helper uses `new shaka.Player(element)`, not `attach()` (kit decision 0002, finding 2).
  - Consequence for Lingo: the adapter is a rewrite (KIT-010, deferred), so Vega ships with playback off; Lingo's Metro config bundles
    `shaka-player` as an empty module for the kit's adapters and shared-ui sets `caps.playback = false` on Vega.
Severity: High for Vega playback — video does not play on Vega in this submission; every other screen is unaffected (hours on the
spike and the review: TBD by human).
Workaround: Fire OS is the primary platform; Vega is experimental with playback off (apps/vega/README.md decision 3).
Suggestion: Publish Shaka Player for Vega as an installable package (or a prebuilt tarball with a version) instead of a postinstall that
clones and patches; put a minimal "VideoPlayer + KeplerVideoSurfaceView + Shaka" component in the w3cmedia package or its README.
Environment: Platform: Vega OS. `@amazon-devices/react-native-w3cmedia` 2.3.2, vega-video-sample 3.24.0, Shaka v4.8.5 patch series; read
2026-09-15 (kit spike) and re-checked against the bundle on 2026-10-01; no Vega device or VVD run.
Links:
  - ../vega-media-kit/docs/decisions/0002-vega-media-surface.md
  - ../vega-media-kit/docs/decisions/0001-week0-gates.md (KIT-010 deferred)
  - https://www.npmjs.com/package/@amazon-devices/react-native-w3cmedia
  - https://github.com/AmazonAppDev/vega-video-sample (package.json `postinstall`, `shaka-setup/`)
  - apps/vega/metro.config.js, packages/shared-ui/src/platformCaps.ts
