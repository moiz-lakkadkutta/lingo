# 0013 — The Vega app: RN for Vega 0.83, outside the pnpm workspace, playback off until the kit plays

Status: **pending human confirmation** for points 1 and 2, after `vega project create` in VVD step 1 shows what Vega SDK 0.24 generates
(docs/plans/LING-008.md §12 open questions 1–2, §14). Points 3–5 are accepted (LING-008, code done 2026-10-02; review fix 95ee729).
Plan: docs/plans/LING-008.md §3. Review: docs/reviews/2026-10-02-ling-008.md (M4). Setup and checklists: apps/vega/README.md.

## Context

Gate B put Vega at "experimental": the Vega SDK was never installed, the kit's Vega adapter renders the `VideoPlayer` class as a
component and does not play (KIT-010, kit decision 0002), and the kit's Vega platform bindings are no-ops (KIT-007). Two React Native
tracks exist for Vega and Amazon's samples disagree on which to use (friction log
`2026-10-01-vega-react-native-version-docs-npm-and-samples-disagree.md`). shared-ui is written against React 19.1, and the root
`pnpm.overrides.react = 19.1.0` fits neither Vega line (`^19.2.0` on 0.83, `18.2.0` on 0.72).

## Decision

1. **RN for Vega 0.83 track** (pending human confirmation): react 19.2.0, react-native 0.83.0, `@amazon-devices/react-native-kepler`
   ~4.0.1 (npm `latest`), `@amazon-devices/react-native-svg` ~3.0.9000000001, runtime-module `react_native_kepler_4@IReactNativeKepler_0`,
   as in Amazon's vega-video-sample. The 0.72 track (the multi-TV sample's set) is a five-value switch that `pnpm check:vega` verifies.
2. **`apps/vega` is an npm project outside the pnpm workspace** (pending human confirmation): `'!apps/vega'` in
   `pnpm-workspace.yaml`, its own `package-lock.json`, public npm only. Metro reaches shared-ui and the kit through `watchFolders` and
   pins react, react-native, svg, kepler and w3cmedia to the app. CI runs `pnpm check:vega` (manifest, app.json, RN track consistency,
   allowed imports, platform libraries as dependencies, no IAP lib 2.12.13, manifest entries for IAP and Content Launcher).
3. **Shaka is stubbed and `caps.playback` is false on `kepler`/`vega`** until the kit's Vega adapter plays (KIT-010). The Player reads
   the flag: with `caps.playback === false` it shows "Video plays on Fire TV with Fire OS for now." (`strings.playbackOff`) and a Back
   button instead of mounting `KitPlayer`; Back leaves at the resume position (review M4, commit 95ee729; render test
   `packages/shared-ui/test/player.test.tsx`). `MiniPlayer` (Words, Quiz replay) does not check the flag yet (TASKS.md follow-up).
4. **Package id `dev.moizp.lingo`**, the Fire OS application id, so IAP items apply to both apps (vega-video-sample manifest comment).
5. **Platform code stays in `apps/vega/src`**: the remote bridge (`useTVEventHandler`), the Vega `PlusStore` (decision 0012), the
   Content Launcher handler, and the MMKV store for the per-install device id (decision 0014). The API URL is one constant in
   `src/config.ts`.

## Consequences

- Without the SDK, `npm install`, `tsc` and `react-native bundle --platform kepler` pass (apps/vega/README.md, results table). Building the
  `.vpkg` and running on the VVD are not done; nothing about Vega runtime behaviour is verified.
- Every Vega screen except video playback runs from shared-ui. A demo on Vega shows the playback message, never a crash, in the Player.
- Switching to the 0.72 track, or into the workspace, is mechanical but touches React versions; shared-ui must stay compatible with
  React 18.2 if the human picks 0.72.
- When KIT-010 lands: set `caps.playback` true for `kepler`/`vega` in `packages/shared-ui/src/platformCaps.ts`, remove `PlaybackOff`,
  `strings.playbackOff` and its test (TASKS.md, LING-008 follow-up).
