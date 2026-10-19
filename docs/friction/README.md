# Friction logs

One file per incident, created with `pnpm friction "<short title>"`. Format: the hackathon rules' fields (Task attempted, Steps,
Expected, Actual, Severity, Workaround, Suggestion, Environment) plus Links. Target: 8–12 per submission. Link the relevant ones from
`docs/feedback.md`; requests derived from them are in `docs/feature-requests.md`. Only real incidents with evidence (a file, command
output or URL) get a log; a value only the human knows is written **TBD by human**.

## Index (regenerate by hand when a log is added)

Amazon and AWS first, then third party.

| Date | Title | Platform | Severity | File |
|---|---|---|---|---|
| 2026-10-01 | Vega: which React Native version? The docs, npm and Amazon's samples disagree | Vega OS | Medium | [file](2026-10-01-vega-react-native-version-docs-npm-and-samples-disagree.md) |
| 2026-10-01 | Vega: Shaka is a patched postinstall build, and `VideoPlayer` is a class, not a component | Vega OS | High (Vega playback) | [file](2026-10-01-vega-shaka-is-a-patched-postinstall-build-and-videoplayer-is-a-class.md) |
| 2026-10-01 | Vega: no playbackRate, TVEventHandler cannot consume keys, BackHandler is silent behind a Modal | Vega OS | Medium | [file](2026-10-01-vega-playbackrate-tveventhandler-backhandler-limits.md) |
| 2026-10-01 | Vega IAP: `getProductData` returns a Map with a price object, and the response enums are numbered differently | Vega OS | Low | [file](2026-10-01-vega-iap-getproductdata-returns-a-map-with-a-price-object.md) |
| 2026-10-02 | Vega: `hasTVPreferredFocus` applies only on first mount, so focus memory has to remount views | Vega OS | Medium | [file](2026-10-02-vega-hastvpreferredfocus-applies-only-on-first-mount.md) |
| 2026-10-14 | Vega SDK installer: licence, telemetry and shell rc edits have no explicit consent step | Vega OS tooling | Medium | [file](2026-10-14-vega-sdk-installer-licence-telemetry-and-shell-rc-edits-have-no-explicit-consent-step.md) |
| 2026-10-14 | Vega SDK: the docs ask for 20 GB, the installer never checks disk, and the package metadata reports a decompressed size of 0 | Vega OS tooling | Medium | [file](2026-10-14-vega-sdk-docs-ask-for-20-gb-the-installer-never-checks-disk-and-the-metadata-reports-a-decompressed-size-of-0.md) |
| 2026-10-14 | Vega install doc: Rosetta 2 is a prerequisite, the installer refuses to run under Rosetta, and macOS needs eight GNU packages | Vega OS tooling | Low | [file](2026-10-14-vega-install-doc-says-rosetta-2-the-installer-refuses-to-run-under-rosetta.md) |
| 2026-10-14 | Vega CLI names drift: `build-kepler` is deprecated, `run-vega` is unimplemented, `project create` is `project generate` | Vega OS tooling | Low to Medium | [file](2026-10-14-vega-cli-names-drift-build-kepler-deprecated-run-vega-unimplemented-project-create-is-generate.md) |
| 2026-10-14 | Vega Virtual Device: no documented route from the app to a server on the host, and `--forward true\|false` is undefined | Vega OS | Medium | [file](2026-10-14-vega-virtual-device-no-documented-route-from-the-app-to-a-server-on-the-host.md) |
| 2026-10-14 | Vega installer: `vega sdk config setup` prompts on stdin even in a piped install, so `curl \| bash` dies with EOF | Vega OS tooling | Medium | [file](2026-10-14-vega-installer-sdk-config-setup-prompts-on-stdin-even-in-a-piped-install-so-curl-bash-dies-with-eof.md) |
| 2026-10-14 | Vega manifest: `vpt validate` demands an OS-version `needs.module` and an `offers.module` for the launch message, and the build rewrites manifest.toml in place | Vega OS | Medium | [file](2026-10-14-vega-manifest-vpt-validate-demands-an-os-version-needs-module-and-an-offers-module-for-the-launch-message-that-the-samples-docs-never-mention.md) |
| 2026-10-14 | Vega Metro: a project `resolveRequest` silently drops the `react-native` → `react-native-kepler` redirect, and the app aborts with `Platform` undefined | Vega OS | High (custom Metro resolver) | [file](2026-10-14-vega-metro-a-project-resolverequest-silently-drops-the-react-native-to-react-native-kepler-redirect-and-the-app-aborts-with-platform-undefined.md) |
| 2026-10-14 | Vega Virtual Device: `start` symlinks the cwd into the SDK workspace and crashes on a race; the GUI emulator crashes on macOS 26.2, headless boots in 8 s | Vega OS tooling | High (no screenshot) | [file](2026-10-14-vega-virtual-device-start-symlinks-the-cwd-into-the-sdk-workspace-and-crashes-with-a-python-traceback-when-a-build-races-it.md) |
| 2026-10-01 | Fire OS: the plain Expo / React Native template has no TV event handler | Fire OS | Medium | [file](2026-10-01-fire-os-expo-template-has-no-tv-event-handler.md) |
| 2026-10-01 | Fire TV Stick: `adb screencap` returns a black image | Fire OS | Medium | [file](2026-10-01-fire-tv-stick-adb-screencap-returns-a-black-image.md) |
| 2026-10-14 | Amazon App Tester has no adb or APK install path for a Fire TV Stick | Fire OS / Amazon IAP | Low | [file](2026-10-14-amazon-app-tester-has-no-adb-or-apk-install-path-for-a-fire-tv-stick.md) |
| 2026-10-01 | Amazon Transcribe: punctuation and speaker labels are unreliable for subtitle cues | AWS | Medium | [file](2026-10-01-transcribe-punctuation-and-diarization-unreliable.md) |
| 2026-10-01 | Amazon Translate: register drifts between cues, and spelled letters are translated as words | AWS | Medium | [file](2026-10-01-translate-per-cue-register-and-spelled-letters.md) |
| 2026-10-01 | Bedrock Nova Lite: temperature range, structured outputs and lifecycle date are unclear | AWS | Low to Medium | [file](2026-10-01-bedrock-nova-lite-temperature-structured-outputs-eol.md) |
| 2026-10-01 | CDK deploy as the root user cannot assume the bootstrap roles and proceeds anyway | AWS | Low | [file](2026-10-01-cdk-deploy-as-root-user-cannot-assume-bootstrap-roles.md) |
| 2026-10-01 | CDK: a bare `cdk deploy --require-approval never` deploys both stacks | AWS | Medium | [file](2026-10-01-infra-deploy-script-deploys-both-stacks.md) |
| 2026-10-01 | Amazon developer docs are unreachable from a cloud dev container (updated 2026-10-02) | Amazon docs / AWS docs | Low | [file](2026-10-01-amazon-developer-docs-unreachable-from-a-cloud-dev-container.md) |
| 2026-10-01 | react-native-tvos: the TV types attach to the hoisted plain react-native under pnpm | Fire OS / third party | Medium | [file](2026-10-01-react-native-tvos-tv-types-attach-to-the-hoisted-plain-react-native-under-pnpm.md) |
| 2026-10-05 | S1: Fire OS remote events and chip focus (react-native-tvos), first device run | Fire OS / third party | Medium | [file](2026-10-05-s1-fire-os-remote-events-and-chip-focus.md) |
| 2026-10-14 | react-native-iap init on Fire OS says the build targets the amazon store, not Google Play | Fire OS / third party | Low | [file](2026-10-14-react-native-iap-init-on-fire-os-says-the-build-targets-the-amazon-store-not-google-play.md) |
| 2026-10-14 | Expo Go in the stores is SDK 57 only and Android Advanced Protection blocks the archived SDK 54 APK, so the phone app runs as a web page | third party | Medium | [file](2026-10-14-expo-go-in-the-stores-is-sdk-57-only-and-android-advanced-protection-blocks-the-archived-sdk-54-apk-so-the-phone-app-runs-as-a-web-page.md) |
| 2026-10-01 | pnpm: git worktrees break the `link:` override and the Prisma client | third party | Medium | [file](2026-10-01-pnpm-worktrees-break-link-override-and-prisma-client.md) |
| 2026-10-01 | Shaka Packager and ffmpeg flood stderr in a pipeline run | third party | Low | [file](2026-10-01-shaka-packager-and-ffmpeg-flood-stderr.md) |
| 2026-10-02 | Expo: `expo install --check` and `expo-doctor` fail when api.expo.dev and reactnative.directory are unreachable | third party | Low | [file](2026-10-02-expo-api-and-react-native-directory-unreachable-so-expo-install-check-and-expo-doctor-fail.md) |
| 2026-10-02 | Expo Google Fonts: importing from the package index bundles every weight (about 11 MB of TTFs) | third party | Low | [file](2026-10-02-expo-google-fonts-index-import-bundles-every-weight.md) |
| 2026-10-02 | react-native-svg pulls React Native's Flow source into vitest, so render tests need a mock | third party | Low | [file](2026-10-02-react-native-svg-flow-source-breaks-vitest.md) |
| 2026-10-02 | react-test-renderer prints a deprecation warning per render under React 19 | third party | Low | [file](2026-10-02-react-test-renderer-deprecation-warning-floods-react-19-test-output.md) |
| 2026-10-02 | pino-http logs every supertest request in the API tests, headers included | third party | Low (Medium while headers were logged) | [file](2026-10-02-pino-http-logs-every-supertest-request.md) |
| 2026-10-02 | Prisma: `migrate dev` without `--name` blocks on a prompt in a non-interactive shell | third party | Low | [file](2026-10-02-prisma-migrate-dev-without-a-name-blocks-in-a-non-interactive-shell.md) |
| 2026-10-01 | VOA Learning English hides the 1080p MP4 in the player configuration | content source | Low | [file](2026-10-01-voa-learning-english-hides-1080p-mp4.md) |

36 logs indexed, every file in this directory except this README (2026-10-02: the two LING-007 logs added to the index, seven new logs
from LING-005..008, the Amazon docs log extended; 2026-10-14: nine Vega SDK / VVD logs from the LING-008 spike,
docs/spikes/2026-10-14-vega-vvd.md, the S1 Fire OS remote log of 2026-10-05, and three device-run logs on App Tester, react-native-iap
and Expo Go; an earlier Expo Go log was folded into the Advanced Protection one and removed).
Waiting on a trigger, not written yet (docs/plans/LING-008.md §6.2): N3 Fire OS `useExoplayerHls` (unless Described filed it),
N7 Nova Lite glosses (after Gate C scoring),
N8 Fire OS long press / `enableKeyDownEvents` (after spike S1).
N5 (Vega build path needs the full SDK) is not a separate log: the VVD spike (docs/spikes/2026-10-14-vega-vvd.md §2) answered it, and the
request is folded into the "Vega manifest" row of docs/feature-requests.md (2026-10-19).
