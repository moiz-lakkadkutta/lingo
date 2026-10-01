# Lingo — Vega OS (experimental)

**Status: experimental.** This project is built and checked without the Vega SDK and has not run on a Vega device or the Vega Virtual
Device (Gate B, `../vega-media-kit/docs/decisions/0001-week0-gates.md`). Video playback is off on Vega until the kit's Vega adapter is
rewritten (KIT-010, kit decision 0002): shared-ui's `caps.playback` is `false` on `kepler`/`vega`. Every other screen comes from
`packages/shared-ui`, the same code as Fire OS.

Only `src/App.tsx` is Vega-specific. Its `RemoteBridge` is the only place `@amazon-devices/react-native-kepler` is imported:
`useTVEventHandler` feeds shared-ui's `RemoteSource` ([Vega TVEventHandler](https://developer.amazon.com/docs/react-native-vega/0.72/using_tveventhandler.html)).
The realtime link (socket.io-client, websocket only) lives in shared-ui; Amazon lists Socket.io 4.7.5 as tested on Vega.

## Decisions (pending human confirmation after `vega project create`)

Recorded in docs/plans/LING-008.md §3.2; the orchestrator chose the defaults on 2026-10-01, to be confirmed in VVD step 1 below.

1. **RN for Vega 0.83 track**: react 19.2.0, react-native 0.83.0, `@amazon-devices/react-native-kepler` ~4.0.1 (npm `latest`),
   `@amazon-devices/react-native-svg` ~3.0.9000000001, runtime-module `react_native_kepler_4@IReactNativeKepler_0` — the track of Amazon's
   [vega-video-sample](https://github.com/AmazonAppDev/vega-video-sample). The 0.72 track (react 18.2.0, react-native 0.72.0, kepler ~2.1.0,
   svg ~2.0.9000000001, runtime-module `keplerscript.runtime.loader_2@IKeplerScript_2_0`, the
   [multi-TV sample](https://github.com/AmazonAppDev/react-native-multi-tv-app-sample/tree/main/apps/vega)'s set) is a mechanical switch:
   change those five values and `pnpm check:vega` confirms they agree.
2. **npm, outside the pnpm workspace** (`pnpm-workspace.yaml` has `'!apps/vega'`): the root `pnpm.overrides.react = 19.1.0` fits neither
   kepler line, CI stays free of a second RN copy, and the Vega CLI is documented with npm. shared-ui is not an npm dependency here:
   Metro reaches it through `watchFolders`, and its own dependencies resolve from `packages/shared-ui/node_modules` (root `pnpm i`).
3. **Shaka is stubbed** (empty module for the kit's adapters directory, `metro.config.js`) and playback is off on Vega (`caps.playback`).
   Follow-up for LING-005: the Player should show a "video plays on Fire TV with Fire OS for now" message when `caps.playback === false`;
   until then, opening a clip on Vega reaches the kit's Vega adapter and is expected to fail (VVD step 8).
4. **API URL** is one constant in `src/config.ts` (no dotenv plugin).
5. **Package id** `dev.moizp.lingo` reuses the Fire OS application id for IAP continuity (vega-video-sample's manifest comment) — LING-007 confirms.

## Setup

```
cd <repo> && pnpm i                         # shared-ui, contracts and the kit link resolve from the workspace
cd apps/vega && npm install                 # public npm only; no SDK needed for install, typecheck or bundle
npm run typecheck                           # tsc against react-native-kepler 4.0.1 types (shared-ui via types/lingo-shared-ui.d.ts)
npm run bundle:check                        # Metro bundle for --platform kepler with shared-ui, the kit and the Shaka stub
pnpm check:vega                             # (repo root) manifest/app.json/RN track/entry/import checks, also in CI
```

Results in the agent sandbox on 2026-10-01 (Linux, Node 22.22, npm 10.9, no Vega SDK):

| Check | Result |
|---|---|
| `npm install` | OK: 771 packages in 34 s, `node_modules` 425 MB; only deprecation warnings (Babel proposal plugins, glob 7, rimraf 2/3, `metro-react-native-babel-preset`) |
| `npx tsc --noEmit` | OK in 1.4 s |
| `npm run bundle:check` (`react-native bundle --platform kepler`) | OK: Metro 0.83.8, 1 287 modules, 3.6 MB bundle, 11 assets (w3cmedia icons); 90 s cold, 14 s warm. The `kepler` platform comes from `@amazon-devices/kepler-cli-platform` without the SDK. Source-map check: one React (19.2.0, this app); react-native, react-native-kepler, w3cmedia and svg all from this app's `node_modules`; shared-ui and the kit from their sources; no Shaka. The kit's `react-native-video` (Fire OS adapter, required lazily) is bundled as dead code. |
| `pnpm check:vega` | OK (17 `node --test` cases + the check on this directory) |

`package-lock.json` is committed. Fonts: `npm run copy-fonts` (also run by `prebuild:release` / `prebuild:debug`) copies
`packages/shared-ui/assets/fonts/*.ttf` to `assets/fonts/` (gitignored), where Vega apps keep fonts (vega-video-sample README,
react-native-vector-icons section).

## VVD checklist (human, on the Mac with Vega SDK 0.24; record each result here and in friction logs)

| # | Step | Expected | Record |
|---|---|---|---|
| 0 | Install Vega SDK 0.24 per https://developer.amazon.com/docs/vega/0.23/install-vega-sdk.html (Rosetta 2 on Apple Silicon); `vega --version` | version prints | SDK version, disk used, minutes |
| 1 | In a temp dir: `vega project create` (exact flags per the SDK doc; hello-world template) | a project is generated | its `react-native`, `react`, `react-native-kepler`, runtime-module; diff its package.json / manifest.toml / metro / babel against this directory and confirm or switch the RN track (decision 1) |
| 2 | Repo root `pnpm i`; `cd apps/vega && npm install` | no errors | warnings worth noting |
| 3 | `npm run build:release` | `build/<arch>-release/lingo_<arch>.vpkg` (file name derived from `kepler.appName`; record the real one) | path, size, minutes |
| 4 | `vega virtual-device start`; `vega run-app build/aarch64-release/lingo_aarch64.vpkg` (x86_64 on Intel) | app launches, Home renders in Noto Sans on the dark ground | photo/screenshot |
| 5 | Set `src/config.ts` to the API host as seen from the VVD (try the host LAN IP first) and run `pnpm api` on the host | catalog loads | the address that worked |
| 6 | D-pad around Home, rail, cards | focus = outline + 1.04 scale, 150 ms; Back works | pass/fail per item |
| 7 | Pair screen | QR renders (react-native-svg alias) and the phone joins over websocket | pass/fail |
| 8 | Open a clip | today: the kit's Vega adapter fails without Shaka (expected until the LING-005 follow-up in decision 3); after it: playback-unavailable message, Back returns | pass/fail + log |
| 9 | Quiz (TV) | options focus, correct/incorrect states | pass/fail |
| 10 | Spike S2 questions (a)–(e), docs/plans/LING-003.md §Spikes (TVEventHandler events and repeats, chip focus, `playbackRate`, preferred focus after remount, FF/Rewind names) | as written there | logs |
| 11 | Logs | app logs visible (command per the SDK docs) | the command used |

Afterwards: fill the Vega column of `../vega-media-kit/docs/device-matrix.md`, the Gate B line in docs/decisions/0001, and friction logs
for anything that differed from the docs. A clean run reopens kit Gate B and un-defers KIT-010 (kit decision 0001).
