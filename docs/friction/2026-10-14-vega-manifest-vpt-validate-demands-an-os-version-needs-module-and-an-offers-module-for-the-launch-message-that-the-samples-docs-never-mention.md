# Vega manifest: `vpt validate` demands an OS-version `needs.module` and an `offers.module` for the launch message, and the build rewrites manifest.toml in place

Task attempted: First `.vpkg` build of Lingo's Vega app with SDK 0.24.12112 (`npm run build:release` → `react-native build-kepler
--build-type Release`), LING-008 VVD checklist step 3. The manifest had passed `pnpm check:vega` (Lingo's static checks) and the bundle
step for two weeks without the SDK.
Steps:
  1. `KEPLER_SDK_PATH=~/vega/sdk/vega-sdk/main/0.24.12112 npm run build:release`.
  2. Metro and Hermes finish; the native step runs `vpt validate manifest.toml` and fails with two errors (below).
  3. Compared with Amazon's two sample manifests (vega-video-sample, react-native-multi-tv-app-sample/apps/vega); added the entries; rebuilt.
Expected: The manifest documentation (or the validator's `help:` lines) says that `[os.version]` needs a matching
`[[needs.module]] id = "/com.amazon.vega.os@IVega_<major>_<minor>"`, and that a `[[message]]` uri must be listed in an `[[offers.module]]`'s
`includes-messages`; the build leaves the committed manifest alone or says what it writes.
Actual:
  - `manifest.toml:114:7 error: [offers.module.includes-messages] MessageRouterSyntaxError message uri 'pkg://dev.moizp.lingo.main' not
    included by any module`. The `[[message]]` block is what the community sample manifest calls "[required] … for Amazon feature
    integrations", but on its own it fails; it needs `[offers] [[offers.module]] id = "/<component>@IMod1" includes-messages = [uri]`.
    Both GitHub samples carry this block without a comment explaining the dependency.
  - `Error 2: [os.version] is declared (min = "1.2", target = "1.2") but the manifest declares no OS Version module entries … needs:
    /com.amazon.vega.os@IVega_1_2`. Same: both samples have it, nothing says it is derived from `[os.version]`.
  - On the successful rebuild (13 s) the build tool **edited `apps/vega/manifest.toml` in the source tree**: it inserted seven
    `[[needs.module]]` entries for the system JS modules the bundle uses (`kepler_media_content_launcher_2@IKeplerMediaContentLauncher_0`,
    `kepler_media_controls_1@…`, `keplermediadescriptor_1@…`, `appstore_iap_lib_2@IAppstoreIapLib_12`, `keplerscript_4@IKeplerScript_0`,
    `svg_3@ISVG_0`, `w3cmedia_2@IW3cmedia_3`), splitting a comment from its block and leaving seven blank lines. `git diff` on a
    committed file changes after every build; nothing in the build output says so.
  - Two `info` lines (`[processes.group] Process group is missing an explicit id`, Content Launcher on an interactive component) are
    printed on every build; harmless.
  - The `.vpkg` is named after the project directory (`vega_aarch64.vpkg`), not `kepler.appName` (`Lingo`) as Lingo's README assumed.
Severity: Medium. Two build-fail-fix cycles (about 25 minutes) for rules that a static validator could have reported two weeks earlier if
`vpt` were available without the 5 GB SDK; the in-place manifest rewrite is a surprise in code review.
Workaround: Add `/com.amazon.vega.os@IVega_1_2` under `[needs]` and the `[offers.module]` block (done, with comments); keep the injected
`needs.module` entries committed with a comment saying the build writes them.
Suggestion: Make the `help:` line of each error show the exact TOML to add; document both rules on the manifest reference page; publish
`vpt validate` as a small standalone tool (or in `@amazon-devices/kepler-cli-platform`) so manifests can be validated in CI without the
SDK; have the build write derived `needs.module` entries into the build directory, or print "manifest.toml updated: N entries" when it
edits the source file.
Environment: Platform: Vega OS. macOS 26.2 (arm64), Vega SDK 0.24.12112, Vega CLI 1.4.4, @amazon-devices/kepler-cli-platform 0.22.14,
2026-10-14.
Links:
  - https://github.com/AmazonAppDev/vega-video-sample/blob/main/manifest.toml (lines 299–300, 332–336, 344–349)
  - https://github.com/AmazonAppDev/react-native-multi-tv-app-sample/blob/main/apps/vega/manifest.toml (lines 135, 148–157)
  - https://community.amazondeveloper.com/t/sample-manifest-for-content-launcher-account-login-and-vega-media-controls/7956
  - apps/vega/manifest.toml, scripts/check-vega.mjs, docs/spikes/2026-10-14-vega-vvd.md
