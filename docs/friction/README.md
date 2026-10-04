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
| 2026-10-01 | Fire OS: the plain Expo / React Native template has no TV event handler | Fire OS | Medium | [file](2026-10-01-fire-os-expo-template-has-no-tv-event-handler.md) |
| 2026-10-01 | Fire TV Stick: `adb screencap` returns a black image | Fire OS | Medium | [file](2026-10-01-fire-tv-stick-adb-screencap-returns-a-black-image.md) |
| 2026-10-01 | Amazon Transcribe: punctuation and speaker labels are unreliable for subtitle cues | AWS | Medium | [file](2026-10-01-transcribe-punctuation-and-diarization-unreliable.md) |
| 2026-10-01 | Amazon Translate: register drifts between cues, and spelled letters are translated as words | AWS | Medium | [file](2026-10-01-translate-per-cue-register-and-spelled-letters.md) |
| 2026-10-01 | Bedrock Nova Lite: temperature range, structured outputs and lifecycle date are unclear | AWS | Low to Medium | [file](2026-10-01-bedrock-nova-lite-temperature-structured-outputs-eol.md) |
| 2026-10-01 | CDK deploy as the root user cannot assume the bootstrap roles and proceeds anyway | AWS | Low | [file](2026-10-01-cdk-deploy-as-root-user-cannot-assume-bootstrap-roles.md) |
| 2026-10-01 | CDK: a bare `cdk deploy --require-approval never` deploys both stacks | AWS | Medium | [file](2026-10-01-infra-deploy-script-deploys-both-stacks.md) |
| 2026-10-01 | Amazon developer docs are unreachable from a cloud dev container (updated 2026-10-02) | Amazon docs / AWS docs | Low | [file](2026-10-01-amazon-developer-docs-unreachable-from-a-cloud-dev-container.md) |
| 2026-10-01 | react-native-tvos: the TV types attach to the hoisted plain react-native under pnpm | Fire OS / third party | Medium | [file](2026-10-01-react-native-tvos-tv-types-attach-to-the-hoisted-plain-react-native-under-pnpm.md) |
| 2026-10-01 | pnpm: git worktrees break the `link:` override and the Prisma client | third party | Medium | [file](2026-10-01-pnpm-worktrees-break-link-override-and-prisma-client.md) |
| 2026-10-01 | Shaka Packager and ffmpeg flood stderr in a pipeline run | third party | Low | [file](2026-10-01-shaka-packager-and-ffmpeg-flood-stderr.md) |
| 2026-10-02 | Expo: `expo install --check` and `expo-doctor` fail when api.expo.dev and reactnative.directory are unreachable | third party | Low | [file](2026-10-02-expo-api-and-react-native-directory-unreachable-so-expo-install-check-and-expo-doctor-fail.md) |
| 2026-10-02 | Expo Google Fonts: importing from the package index bundles every weight (about 11 MB of TTFs) | third party | Low | [file](2026-10-02-expo-google-fonts-index-import-bundles-every-weight.md) |
| 2026-10-02 | react-native-svg pulls React Native's Flow source into vitest, so render tests need a mock | third party | Low | [file](2026-10-02-react-native-svg-flow-source-breaks-vitest.md) |
| 2026-10-02 | react-test-renderer prints a deprecation warning per render under React 19 | third party | Low | [file](2026-10-02-react-test-renderer-deprecation-warning-floods-react-19-test-output.md) |
| 2026-10-02 | pino-http logs every supertest request in the API tests, headers included | third party | Low (Medium while headers were logged) | [file](2026-10-02-pino-http-logs-every-supertest-request.md) |
| 2026-10-02 | Prisma: `migrate dev` without `--name` blocks on a prompt in a non-interactive shell | third party | Low | [file](2026-10-02-prisma-migrate-dev-without-a-name-blocks-in-a-non-interactive-shell.md) |
| 2026-10-01 | VOA Learning English hides the 1080p MP4 in the player configuration | content source | Low | [file](2026-10-01-voa-learning-english-hides-1080p-mp4.md) |

23 logs (2026-10-02: the two LING-007 logs added to the index, seven new logs from LING-005..008, the Amazon docs log extended).
Waiting on a trigger, not written yet (docs/plans/LING-008.md §6.2): N3 Fire OS `useExoplayerHls` (unless Described filed it),
N5 Vega build path needs the full SDK (results of §3.5 are in apps/vega/README.md), N7 Nova Lite glosses (after Gate C scoring),
N8 Fire OS long press / `enableKeyDownEvents` (after spike S1).
