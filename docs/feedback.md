# Product feedback — Lingo

Required by the hackathon. Drafted from the repository's record on 2026-10-01 (LING-008); every claim cites a file, decision, friction
log or measurement. **TBD by human** marks what only the human knows; the human edits and signs off in week 5. LING-005/006/007 (TV screens,
phone, Lingo Plus and the platform wiring) merged on 2026-10-02: their code is done and reviewed, but not checked on a device yet.

## 1. Tools, APIs and SDKs used, and why

- **Amazon Transcribe** (batch, `StartTranscriptionJob`, de-DE / en-US, speaker labels): word timestamps, punctuation and speaker labels
  are what the segmenter needs to build 2 × 42-character, ≤ 20 cps cues (`packages/pipeline/src/steps/transcribe.ts`, docs/aws.md).
- **Amazon Translate** (`TranslateText`, `Formality`, `Brevity`): the native-language line under each cue, aligned 1:1
  (`steps/translate.ts`, decision 0008 §11).
- **Amazon Bedrock, Nova Lite via Converse** with forced tool use: word glosses, grammar notes, examples and the quiz plan (`src/ai/*`, LING-002).
- **Amazon S3 + CloudFront** (Origin Access Control): HLS and WebVTT delivery to the TV (`steps/publish.ts`, `infra/lib/media-stack.ts`).
- **AWS CDK** (TypeScript): two stacks in two regions from one app (`infra/`).
- **Fire OS on the Fire TV Stick** through Expo SDK 54 + react-native-tvos 0.81, the pattern of Amazon's multi-TV sample (`apps/expo`, LING-003).
- **Vega SDK docs, `@amazon-devices/react-native-kepler`, `@amazon-devices/react-native-w3cmedia`, `@amazon-devices/react-native-svg`**: read
  and planned against; `apps/vega` installs, typechecks and bundles without the SDK, but has not run on a device — experimental (apps/vega/README.md).
- **Amazon Appstore IAP and the Receipt Verification Service (RVS)**: one subscription, Lingo Plus, bought on the TV and verified on the
  server before it is fulfilled (decision 0012). Fire OS uses `react-native-iap` ~16.7.2 with the Amazon store flavour and App Tester
  (`apps/expo/src/fireosStore.ts`); Vega uses `@amazon-devices/keplerscript-appstore-iap-lib` ~2.13.0 (`apps/vega/src/iap/vegaStore.ts`);
  the API calls the RVS Cloud Sandbox (`apps/api/src/lib/rvs.ts`). Code done; the App Tester and Vega Virtual Device sandbox runs: TBD by human.
- **Content Launcher, Personalization, Media Controls**: a launch intent opens the clip (Fire OS deep link `lingo://clip/<slug>`,
  `apps/expo/LaunchBridge.tsx`; Vega Content Launcher handler, `apps/vega/src/platform/contentLauncher.ts`). Personalization and Media
  Controls go through `@moizp/vega-media-kit`, whose bindings are still no-ops (KIT-007). Not checked on a device.
- Third party: Shaka Packager (HLS), ffmpeg, simplemma (lemmas), react-native-video (ExoPlayer on Fire OS), Socket.IO (TV ↔ phone),
  Prisma/Postgres, pg-boss, expo-speech (the phone's word audio is on-device TTS, not Amazon Polly; decision 0011 §10).

## 2. What worked well (setup, docs, performance, reliability)

- **Transcribe's batch output** (word timings, punctuation items, `speaker_label` on every item) was precise enough to build Lingo's cues:
  Gate A passed on two real clips; terra-x-friedlaender gave 54 cues with 0 gate findings (docs/decisions/0001-week0-gates.md, 0007).
- **Translate's `Formality` and `Brevity` settings** are documented with exact language-pair tables, so the register fix for neighbouring
  cues switching between `du` and `Sie` was one request setting per clip (decision 0008 §11; friction log `translate-per-cue-register…`).
  Whether it removed every switch on the 12 clips: TBD by human after the batch.
- **Bedrock Converse with forced tool use and Zod validation** is cheap to run: the first real Gate C run cost $0.0024 for 37 calls across two
  clips (docs/spot-checks/2026-10-02-gate-c.md). Gloss quality is in answer 3, not here.
- **Fire OS via the shared kit on the Fire TV Stick** (AFTSS, Fire OS 7.7.1.6; `../vega-media-kit/docs/device-matrix.md`, Described's
  package — Lingo's own stick run is spike S1, add it when recorded). Row "Seek / rate", Shaka's demo stream: a seek to 3.837 s showed the
  first cue 10 ms later. Row "Own HLS via CloudFront": two text tracks at once, seek to 1 s, and 0.75× measured 15.43 s of media in 20.18 s
  wall.
- **CDK**: two stacks in two regions from one app; the media stack deployed (the root-user caveat is a friction log).
- **Amazon's sample repos** gave a starting point for both OSes. The multi-TV sample built and ran on the Fire TV Stick (device matrix).
  From vega-video-sample, the Vega app is a project shape that installs, typechecks and bundles: `npm install`, `tsc` and
  `react-native bundle --platform kepler` passed without the SDK (apps/vega/README.md). It has never run on a device or the Vega Virtual
  Device.

## 3. What needs improvement

One bullet per friction log, 23 in all (index: docs/friction/README.md). Requests with priorities: docs/feature-requests.md.

Vega
- Which React Native version: docs, npm dist-tags and the two samples disagree, and the version set moves together
  ([log](friction/2026-10-01-vega-react-native-version-docs-npm-and-samples-disagree.md)).
- Shaka for Vega is a postinstall that clones and patches v4.8.5, and `VideoPlayer` is a class rather than a component; Vega playback is off
  in this submission ([log](friction/2026-10-01-vega-shaka-is-a-patched-postinstall-build-and-videoplayer-is-a-class.md)).
- No `playbackRate` in w3cmedia, `useTVEventHandler` cannot consume a key, `BackHandler` is silent behind a `Modal`
  ([log](friction/2026-10-01-vega-playbackrate-tveventhandler-backhandler-limits.md)).
- `hasTVPreferredFocus` applies only on first mount, so focus memory has to remount views
  ([log](friction/2026-10-02-vega-hastvpreferredfocus-applies-only-on-first-mount.md)).
- Vega IAP: `getProductData` returns a Map with a price object, and the response enums are numbered differently from Fire OS
  ([log](friction/2026-10-01-vega-iap-getproductdata-returns-a-map-with-a-price-object.md)).
- Amazon developer docs were unreachable from a cloud dev container, so page-only facts stayed unverified
  ([log](friction/2026-10-01-amazon-developer-docs-unreachable-from-a-cloud-dev-container.md)).

Fire OS
- The plain Expo / React Native template has no TV event handler; media keys need react-native-tvos and a native rebuild
  ([log](friction/2026-10-01-fire-os-expo-template-has-no-tv-event-handler.md)).
- `adb screencap` returns a black image on the Fire TV Stick ([log](friction/2026-10-01-fire-tv-stick-adb-screencap-returns-a-black-image.md)).
- react-native-tvos TV types attach to the hoisted plain react-native under pnpm; CI typecheck was red until a `paths` pin
  ([log](friction/2026-10-01-react-native-tvos-tv-types-attach-to-the-hoisted-plain-react-native-under-pnpm.md)).

AWS AI services
- Transcribe puts full stops at hesitations and misses them after pauses; confidence cannot detect either
  ([log](friction/2026-10-01-transcribe-punctuation-and-diarization-unreliable.md)).
- Translate has no context field, so register drifts between cues, and spelled letters are translated as words
  ([log](friction/2026-10-01-translate-per-cue-register-and-spelled-letters.md)).
- Nova Lite: the temperature range, structured-output support and the model lifecycle date are unclear across pages
  ([log](friction/2026-10-01-bedrock-nova-lite-temperature-structured-outputs-eol.md)).
- Gloss quality on the first Gate C run (English rows ≈ 6/15 provisionally): add once the human has scored the sheet <!-- Gate C -->.

AWS infrastructure
- CDK deploys as root by bypassing the bootstrap roles with a warning
  ([log](friction/2026-10-01-cdk-deploy-as-root-user-cannot-assume-bootstrap-roles.md)).
- A bare `cdk deploy --require-approval never` deploys every stack of a multi-stack app
  ([log](friction/2026-10-01-infra-deploy-script-deploys-both-stacks.md)).

Third party (not Amazon or AWS)
- pnpm `link:` overrides and the Prisma client break in git worktrees ([log](friction/2026-10-01-pnpm-worktrees-break-link-override-and-prisma-client.md)).
- Shaka Packager and ffmpeg flood stderr ([log](friction/2026-10-01-shaka-packager-and-ffmpeg-flood-stderr.md)).
- VOA Learning English hides the 1080p MP4 in its player configuration ([log](friction/2026-10-01-voa-learning-english-hides-1080p-mp4.md)).
- `expo install --check` and `expo-doctor` fail when api.expo.dev and reactnative.directory are unreachable
  ([log](friction/2026-10-02-expo-api-and-react-native-directory-unreachable-so-expo-install-check-and-expo-doctor-fail.md)).
- Importing Expo Google Fonts from the package index bundles every weight (about 11 MB of TTFs)
  ([log](friction/2026-10-02-expo-google-fonts-index-import-bundles-every-weight.md)).
- pino-http logs every supertest request in the API tests, headers included ([log](friction/2026-10-02-pino-http-logs-every-supertest-request.md)).
- Prisma `migrate dev` without `--name` blocks on a prompt in a non-interactive shell
  ([log](friction/2026-10-02-prisma-migrate-dev-without-a-name-blocks-in-a-non-interactive-shell.md)).
- react-native-svg pulls React Native's Flow source into vitest, so render tests need a mock
  ([log](friction/2026-10-02-react-native-svg-flow-source-breaks-vitest.md)).
- react-test-renderer prints a deprecation warning per render under React 19
  ([log](friction/2026-10-02-react-test-renderer-deprecation-warning-floods-react-19-test-output.md)).

## 4. Onboarding quality

- Time from zero to first app on device: **TBD by human** hours.
- Record to place around it: the repository was created on 2026-09-14; the first Fire OS playback on the stick through the kit was on
  2026-09-26 (`../vega-media-kit/docs/device-matrix.md`). The Vega SDK was not installed: at Gate B (2026-09-26) the SDK install alone was
  ~20 GB plus an unknown day with the kill date twelve days out, so the human chose Fire OS primary and Vega experimental
  (`../vega-media-kit/docs/decisions/0001-week0-gates.md`). If the Vega Virtual Device checklist (apps/vega/README.md) is run, add its hours here.

## 5. Would you build with these tools again? Yes / No — rationale

**TBD by human** (Yes/No is the human's call). The record the rationale can draw on: the AWS AI services were cheap and well documented,
with quality work needed around Transcribe punctuation and Nova Lite glosses; Fire OS worked through the community react-native-tvos fork
and the kit; Vega's version story and SDK size kept it experimental.
