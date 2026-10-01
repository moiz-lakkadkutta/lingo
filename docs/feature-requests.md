# Feature requests (with priority)

Derived from the Suggestion field of each friction log (docs/friction/README.md); add a row when a log lands.

Priority scale: **P1** blocked a feature or cost a planning/implementation cycle · **P2** cost hours, a workaround exists · **P3** papercut.

| Priority | Platform | Request | Why (friction log) |
|---|---|---|---|
| P1 | Vega | Publish one version matrix (SDK ↔ RN for Vega ↔ `react-native-kepler` ↔ React ↔ runtime-module ↔ svg/w3cmedia lines), name the default for new projects, and align the two samples | [Vega RN version](friction/2026-10-01-vega-react-native-version-docs-npm-and-samples-disagree.md) |
| P1 | Vega | `playbackRate` on `@amazon-devices/react-native-w3cmedia` (or a documented way to slow playback) | [Vega playbackRate / TVEventHandler / BackHandler](friction/2026-10-01-vega-playbackrate-tveventhandler-backhandler-limits.md) |
| P1 | Vega | Shaka Player for Vega as an installable, versioned package instead of a postinstall that clones v4.8.5 and applies a 44-patch series; a minimal VideoPlayer + `KeplerVideoSurfaceView` + Shaka component in w3cmedia | [Vega Shaka / VideoPlayer](friction/2026-10-01-vega-shaka-is-a-patched-postinstall-build-and-videoplayer-is-a-class.md) |
| P1 | AWS Transcribe | Mark disfluency stops apart from sentence ends (or a punctuation confidence); an option to suppress non-speech tokens | [Transcribe punctuation](friction/2026-10-01-transcribe-punctuation-and-diarization-unreliable.md) |
| P1 | AWS Translate | A context field (untranslated neighbouring segments) for subtitle translation; a keep-as-is pattern for spelled letters | [Translate register](friction/2026-10-01-translate-per-cue-register-and-spelled-letters.md) |
| P2 | Vega | `useTVEventHandler` option to consume a key; `BackHandler` events while a `Modal` is open | [Vega playbackRate / TVEventHandler / BackHandler](friction/2026-10-01-vega-playbackrate-tveventhandler-backhandler-limits.md) |
| P2 | Fire OS | A starter on react-native-tvos + `@react-native-tvos/config-tv`, or a doc line that plain React Native gets no media keys | [Fire OS template](friction/2026-10-01-fire-os-expo-template-has-no-tv-event-handler.md) |
| P2 | Fire OS | A documented way to take a screenshot of the Fire TV Stick screen (`adb screencap` returns black) | [adb screencap](friction/2026-10-01-fire-tv-stick-adb-screencap-returns-a-black-image.md) |
| P2 | Fire OS | react-native-tvos: export the TV types from its own `types/index.d.ts` rather than a `declare module 'react-native'` augmentation, or document the `paths` pin for monorepos | [react-native-tvos types](friction/2026-10-01-react-native-tvos-tv-types-attach-to-the-hoisted-plain-react-native-under-pnpm.md) |
| P2 | Bedrock / Nova | Structured outputs for Nova Lite; one temperature minimum across the tool-use and request-schema pages; a current lifecycle date on the Nova Lite v1 card | [Nova Lite](friction/2026-10-01-bedrock-nova-lite-temperature-structured-outputs-eol.md) |
| P2 | AWS CDK | Fail (or require `--force`) when deploying as root; require a stack selector with `--require-approval never` in multi-stack apps | [CDK root](friction/2026-10-01-cdk-deploy-as-root-user-cannot-assume-bootstrap-roles.md), [CDK both stacks](friction/2026-10-01-infra-deploy-script-deploys-both-stacks.md) |
| P3 | Shaka Packager | INFO logging off by default for non-interactive use | [stderr flood](friction/2026-10-01-shaka-packager-and-ffmpeg-flood-stderr.md) |
| P3 | pnpm | Document that `link:` overrides resolve from the workspace root (breaks in git worktrees) | [pnpm worktrees](friction/2026-10-01-pnpm-worktrees-break-link-override-and-prisma-client.md) |

Not a request yet: "A way to typecheck and bundle a Vega app in CI without the full SDK" was planned as P1, but on 2026-10-01 `npm install`,
`tsc` and `react-native bundle --platform kepler` all worked without the SDK (apps/vega/README.md). Whether building the `.vpkg` and running
need the full SDK is the open part (friction log N5, waiting on the VVD checklist).
