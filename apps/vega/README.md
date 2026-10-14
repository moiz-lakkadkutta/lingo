# Lingo — Vega OS (experimental)

**Status: experimental — runs on the Vega Virtual Device since 2026-10-14** (SDK 0.24.12112, Vega CLI 1.4.4, macOS arm64): Home, the
rail, Clip and Words render from shared-ui with the catalog from the host API; the Player shows the playback-off message
(docs/spikes/2026-10-14-vega-vvd.md, screenshots and a recording in docs/spikes/). Not run on a physical Vega device (Gate B,
`../vega-media-kit/docs/decisions/0001-week0-gates.md`). Checklist rows 7, 9 and 10 below are still open. Video playback is off on Vega until the kit's Vega adapter is
rewritten (KIT-010, kit decision 0002): shared-ui's `caps.playback` is `false` on `kepler`/`vega`. Every other screen comes from
`packages/shared-ui`, the same code as Fire OS.

`src/config.ts` targets the VVD: `API_BASE_URL` is `http://localhost:4000`, which reaches the host only through reverse port forwarding
(checklist step 5). Before a build for a physical Vega device, set it to the Mac's LAN address (e.g. `http://192.168.1.x:4000`).

Vega-specific code lives in `src/` only:

| File | What it does |
|---|---|
| `src/App.tsx` | Entry. Its `RemoteBridge` is the only place `@amazon-devices/react-native-kepler` is imported: `useTVEventHandler` feeds shared-ui's `RemoteSource` ([Vega TVEventHandler](https://developer.amazon.com/docs/react-native-vega/0.72/using_tveventhandler.html)). Passes `plusStore` and `launches` into shared-ui's `Root`, and the per-install `deviceId` (created once by shared-ui's `useDeviceId`, kept in MMKV through `@amazon-devices/react-native-mmkv` ~1.0.11, the stable release published after its `rn83-alpha` 1.0.11-rn-83 tag; react-native-mmkv is on [Amazon's supported list](https://developer.amazon.com/docs/vega-api/0.24/supported-libraries.html)). |
| `src/iap/vegaStore.ts` | Lingo Plus `PlusStore` over `@amazon-devices/keplerscript-appstore-iap-lib` (LING-007). |
| `src/platform/contentLauncher.ts` | Content Launcher handler over `@amazon-devices/kepler-media-content-launcher`; feeds shared-ui's `LaunchSource` (LING-007). |
| `src/config.ts` | The API base URL. |

The realtime link (socket.io-client, websocket only) lives in shared-ui; Amazon lists Socket.io 4.7.5 as tested on Vega. `Root` accepts
an optional `transport` prop if a relay is needed.

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
   With `caps.playback === false` the Player shows "Video plays on Fire TV with Fire OS for now." and a Back button instead of mounting
   `KitPlayer` (render test: packages/shared-ui/test/player.test.tsx). Words and Quiz replay (`MiniPlayer`) still mount `KitPlayer`; see the
   LING-008 follow-up in TASKS.md.
4. **API URL** is one constant in `src/config.ts` (no dotenv plugin).
5. **Package id** `dev.moizp.lingo` reuses the Fire OS application id for IAP continuity (vega-video-sample's manifest comment: an existing
   Fire TV app must reuse its application id for IAP items to keep applying). LING-007 relies on it.

## Setup

```
cd <repo> && pnpm i                         # shared-ui, contracts and the kit link resolve from the workspace
cd apps/vega && npm install                 # public npm only; no SDK needed for install, typecheck or bundle
npm run typecheck                           # tsc against react-native-kepler 4.0.1, IAP lib and Content Launcher types (shared-ui via types/lingo-shared-ui.d.ts)
npm run bundle:check                        # Metro bundle for --platform kepler with shared-ui, the kit and the Shaka stub
pnpm check:vega                             # (repo root) manifest/app.json/RN track/entry/import/platform-library checks, also in CI
```

Results in the agent sandbox on 2026-10-01 (Linux, Node 22.22, npm 10.9, no Vega SDK):

| Check | Result |
|---|---|
| `npm install` | OK: 771 packages in 34 s, `node_modules` 425 MB; only deprecation warnings (Babel proposal plugins, glob 7, rimraf 2/3, `metro-react-native-babel-preset`) |
| `npx tsc --noEmit` | OK in 1.4 s; with LING-007 also OK, now including `src/iap/vegaStore.ts` and `src/platform/contentLauncher.ts` against the IAP lib 2.13.0 and Content Launcher 2.0.22 typings |
| `npm run bundle:check` (`react-native bundle --platform kepler`) | OK: Metro 0.83.8, 1 287 modules, 3.6 MB bundle, 11 assets (w3cmedia icons); 90 s cold, 14 s warm. The `kepler` platform comes from `@amazon-devices/kepler-cli-platform` without the SDK. Source-map check: one React (19.2.0, this app); react-native, react-native-kepler, w3cmedia and svg all from this app's `node_modules`; shared-ui and the kit from their sources; no Shaka. The kit's `react-native-video` (Fire OS adapter, required lazily) is bundled as dead code. After the LING-007 merge (same day): OK, 1 393 `__d` module definitions, 2.97 MB bundle, 43 s; one copy each of react, react-native and react-native-kepler (`npm ls`). The IAP lib brings `@react-native-async-storage/async-storage` 1.23.1 (its own dependency, not the `@amazon-devices` port); record on the VVD whether it loads. |
| `pnpm check:vega` | OK (23 `node --test` cases + the check on this directory) |

Results on the human's Mac on 2026-10-14 (macOS 26.2, arm64, Node 22.19, npm 10.9.3, no Vega SDK; docs/spikes/2026-10-14-vega-vvd.md):

| Check | Result |
|---|---|
| `npm install` | OK: 779 packages in 7 s (warm npm cache), `node_modules` 493 MB; the same deprecation warnings |
| `npm run typecheck` | OK in 0.9 s |
| `npm run copy-fonts` | OK: the three TTFs to `assets/fonts/` |
| `npm run bundle:check` | OK: 42 s, 3.10 MB bundle, 1 409 `__d` module definitions, 11 assets |
| RN CLI plugin (`@amazon-devices/kepler-cli-platform` 0.22.14) | `react-native build-kepler --help` prints "[DEPRECATED] Please use 'build-vega' instead" (the command still runs); `run-vega` is "currently unimplemented". The scripts keep `build-kepler`, as both Amazon samples do, until `build-vega` is verified on this project |

`package-lock.json` is committed. Fonts: `npm run copy-fonts` (also run by `prebuild:release` / `prebuild:debug`) copies
`packages/shared-ui/assets/fonts/*.ttf` to `assets/fonts/` (gitignored), where Vega apps keep fonts (vega-video-sample README,
react-native-vector-icons section).

## Lingo Plus, Content Launcher, Media Controls (LING-007)

The two platform libraries are public npm packages and are regular dependencies here, at the versions of Amazon's RN for Vega 0.83
sample ([vega-video-sample package.json](https://github.com/AmazonAppDev/vega-video-sample/blob/main/package.json)):
`@amazon-devices/keplerscript-appstore-iap-lib` ~2.13.0 and `@amazon-devices/kepler-media-content-launcher` ~2.0.22. npm also has
`rn83-alpha` tags (2.13.0-rn-83, 2.0.22-rn-83.1), older than these stable releases; the sample uses the stable ones, so Lingo does too.
`npx tsc --noEmit` type-checks `src/iap/vegaStore.ts` and `src/platform/contentLauncher.ts` against their published type definitions.

Do not use IAP lib `2.12.13`: every call returns FAILED ([community thread](https://community.amazondeveloper.com/t/using-amazon-devices-keplerscript-appstore-iap-lib-2-12-13-causes-in-app-purchases-to-fail/24746));
`pnpm check:vega` refuses it. `getProductData` returns `productData: Map<string, Product>`, and the price is `product.price.priceStr`.

`manifest.toml` carries the IAP (`com.amazon.iap.core.service`, App Tester, `IAppstoreIAPPurchaseCoreService`), Content Launcher
(`IContentLauncher1`, the `IContentLauncherServer` interface provider with placeholder `partner-id = "LINGO"`, Q5), Personalization and
Media Controls entries, reduced from vega-video-sample's manifest. `pnpm check:vega` fails if `src` imports one of these libraries
without its manifest entries or its `package.json` dependency. Not added: the `IContentPersonalizationServer` interface block, which
needs a headless data-refresh service component Lingo does not have (escalation E3).

**VVD checklist, Plus and Content Launcher** (plan §Manual B, `docs/plans/LING-007.md`; run after steps 0–5 of the VVD checklist below):

1. Install and configure App Tester on the VVD, then put `../expo/amazon.sdktester.json` where
   [Configure App Tester (Vega)](https://developer.amazon.com/docs/vega/0.22/configure-app-tester) says. **Write the exact command
   here once run.** The page could not be opened from the build environment.
2. `npm run build:release && vega run-app build/<arch>-release/lingo_<arch>.vpkg`.
3. Plus: the sentence has no "slower playback" (Vega `caps.rate` is false). Select Subscribe, confirm the App Tester dialog, and
   expect "You have Lingo Plus.". The API log shows `store: amazon-vega`, `outcome: active`.
4. `journalctl -f | grep -i -E "iap|notifyFulfillment"` shows fulfilment after the verify call.
5. Restart: still Plus. Cancel in App Tester, then press Restore: Plus is off.
6. Content Launcher: launch external id `lingo_slug=<slug>` with the testing method from the
   [integration guide](https://developer.amazon.com/ja/docs/vega/0.24/content-launcher-integration-guide.html). The Player opens
   the clip (the Player shows its playback-unavailable message, see decision 3), and `journalctl` shows
   `[lingo] content launcher: open <slug>`. An unknown slug answers `URL_NOT_AVAILABLE` and stays on Home.
7. Media Controls / Personalization log `[vega-media-kit] … is a no-op on kepler` once. **Expected until KIT-007.**

Docs: [Vega IAP overview](https://developer.amazon.com/docs/vega/0.22/vega-iap-overview.html) ·
[Use App Tester](https://developer.amazon.com/docs/vega/0.22/use-app-tester.html) ·
[RVS Cloud (Vega)](https://developer.amazon.com/docs/vega/0.22/rvs-cloud.html) ·
[Appstore integrations](https://developer.amazon.com/docs/vega/0.22/appstore-integrations-overview.html) ·
[Content Launcher overview](https://developer.amazon.com/docs/vega/0.21/content-launcher-overview.html) ·
[Media Controls](https://developer.amazon.com/docs/vega/0.22/media-controls-get-started) ·
[Watch activity](https://developer.amazon.com/docs/vega/0.22/watch-activity.html) ·
[Sample manifest for Content Launcher, account login and Media Controls](https://community.amazondeveloper.com/t/sample-manifest-for-content-launcher-account-login-and-vega-media-controls/7956).

## VVD checklist (human, on the Mac with Vega SDK 0.24; record each result here and in friction logs)

| # | Step | Expected | Record |
|---|---|---|---|
| 0 | Install Vega SDK 0.24 per https://developer.amazon.com/docs/vega/0.24/install-vega-sdk.html: Homebrew prerequisites (`brew install binutils coreutils gawk findutils grep jq lz4 gnu-sed watchman`, done 2026-10-14), then from a native arm64 shell `NONINTERACTIVE=true curl -fsSL https://sdk-installer.vega.labcollab.net/get_vvm.sh | bash && source ~/vega/env`; `vega --version`. The page asks for 20 GB free (15 GB free on 2026-10-14); the installer accepts the Program Materials License by running, turns telemetry on (`~/vega/telemetry/config.json` → `"optIn": false`) and edits the shell rc files, so the human runs it (docs/spikes/2026-10-14-vega-vvd.md §2) | "Active SDK Version" and "Vega CLI Version" print | SDK version, disk used (`du -sh ~/vega`), minutes |
| 1 | In a temp dir: `vega project list-templates`, then `vega project generate --template helloWorld --name hellolingo --packageId dev.moizp.hellolingo --outputDir hellolingo` (0.24 cli-tools page; there is no `vega project create`) | a project is generated | its `react-native`, `react`, `react-native-kepler`, runtime-module; diff its package.json / manifest.toml / metro / babel against this directory and confirm or switch the RN track (decision 1) |
| 2 | Repo root `pnpm i`; `cd apps/vega && npm install` | no errors | 2026-10-14: OK (779 packages, deprecation warnings only) |
| 3 | `KEPLER_SDK_PATH=~/vega/sdk/vega-sdk/main/0.24.12112 npm run build:release` | `build/aarch64-release/vega_aarch64.vpkg` (named after the directory, not `kepler.appName`) | 2026-10-14: OK, 1.5 MB, 9–13 s warm, after two fixes: `manifest.toml` (`IVega_1_2` needs module, `[offers.module]` for the launch message; the build also writes seven system-module `needs.module` entries into the file) and `metro.config.js` rule 3 (`react-native` → `@amazon-devices/react-native-kepler` on kepler). Friction logs 2026-10-14-vega-manifest-*, -vega-metro-* |
| 4 | `vega virtual-device start --display-res=1920,1080`; `vega run-app build/aarch64-release/vega_aarch64.vpkg dev.moizp.lingo.main -d VirtualDevice` (x86_64 on Intel; the component id is the second argument, run-apps page) | app launches, Home renders in Noto Sans on the dark ground | 2026-10-14: **pass** — docs/spikes/2026-10-14-vega-home.png. The GUI emulator crashed on the host GPU; it runs with `hw.gpu.mode = swangle_indirect` in the instance's `config.ini` (or `--no-gui`, 8 s boot). Screenshot through the emulator console (docs/spikes/2026-10-14-vega-vvd.md §4); the device-side `gwsi-tool-screenshooter` fails on the VVD |
| 5 | With `pnpm api` on the host: `vega device start-port-forwarding --device VirtualDevice -p 4000 --forward false` (`--forward false` = reverse, device port → host port) and `src/config.ts` at `http://localhost:4000` | catalog loads | 2026-10-14: **pass** — `http://localhost:4000` through the reverse forward (device `curl localhost:4000/health` → ok; Home and Clip show the catalog). Re-run the forwarding after every VVD start |
| 6 | D-pad around Home, rail, cards | focus = outline + 1.04 scale, 150 ms; Back works | 2026-10-14: focus and Back pass (keys via `inputd-cli button_press KEY_*`); LEFT into the rail lands on the geometrically nearest item (Settings from Watch at rest, Review when scrolled), not the current item; after UP from a row the hero stays scrolled (title cut); see spike §3 |
| 7 | Pair screen | QR renders (react-native-svg alias) and the phone joins over websocket | pass/fail |
| 8 | Open a clip | playback-unavailable message ("Video plays on Fire TV with Fire OS for now."), no crash; Back returns | 2026-10-14: **pass** — docs/spikes/2026-10-14-vega-player-playback-off.png; Back returns to the Clip screen |
| 9 | Quiz (TV) | options focus, correct/incorrect states | pass/fail |
| 10 | Spike S2 questions (a)–(e), docs/plans/LING-003.md §Spikes (TVEventHandler events and repeats, chip focus, `playbackRate`, preferred focus after remount, FF/Rewind names) | as written there | logs |
| 11 | Logs: `vega exec vda -s emulator-5554 shell "loggingctl log -f -o short_precise"` (the format is `short_precise`, not `short-precise`; without `-f` only a short window prints) | app logs visible | 2026-10-14: native lines appear as `dev.moizp.lingo[pid]`; JS crashes do not reach the log — they land in `vega device get-log-info` → `copy-logs --artifact SYSTEM_TOMBSTONE/acr` (text files with the JS stack) |

Afterwards: fill the Vega column of `../vega-media-kit/docs/device-matrix.md`, the Gate B line in docs/decisions/0001, and friction logs
for anything that differed from the docs. A clean run reopens kit Gate B and un-defers KIT-010 (kit decision 0001).
