# vega playbackrate tveventhandler backhandler limits

Task attempted: Design the LING-003 player for both Fire OS and Vega OS from one `shared-ui`: a "Slower" (0.75×) option,
word focus with the remote while paused, remote keys (seek, Play/Pause, Menu) while playing, and Back to close the Explain
sheet.
Steps:
  1. Read the Vega W3C media package README, the Vega TVEventHandler, focus-management and BackHandler pages.
  2. Map each player interaction to a Vega API.
Expected: `playbackRate` works on the Vega `HTMLMediaElement` as on the web; a key handler can consume a key so native focus
does not also move; Back reaches the app while a modal sheet is open.
Actual:
  - The `@amazon-devices/react-native-w3cmedia` README lists `playbackRate` under unsupported `HTMLMediaElement` features,
    so 0.75× is not available on Vega (it is device-verified on the Fire TV Stick via react-native-video `rate`).
  - `useTVEventHandler` (from `@amazon-devices/react-native-kepler`) "doesn't allow overriding the default behavior": key
    events are observed, never consumed, so native focus moves regardless.
  - `BackHandler` publishes nothing while a React Native `<Modal>` is open, and there is no long-press Back.
Severity: Medium — shapes the design: Slower is hidden on Vega (`caps`), paused-state navigation must use native focus
(no key consumption), and the Explain sheet cannot be an RN `<Modal>` if Back must close it. Device behaviour is still
unverified (spike S2 waits for a Vega Virtual Device).
Workaround: Feature caps per platform (`capsFor('kepler').rate = false`; flip if S2 shows it works); paused navigation uses
focusable `Pressable`s with `nextFocus*`; remote events enter `shared-ui` through a `RemoteSource` prop so the native import
stays in `apps/vega`; the sheet is a view inside the screen, not a `<Modal>`.
Suggestion: Document a supported way to slow playback on Vega (or the plan for `playbackRate`); add a consume/preventDefault
option to `useTVEventHandler`; let `BackHandler` receive events while a `<Modal>` is shown, or say in the Modal page what
replaces it.
Environment: Vega SDK docs 0.22 / React Native for Vega 0.72 docs, read 2026-10-01; no Vega device or VVD run yet.
Links:
  - W3C media README (`playbackRate` unsupported): https://www.npmjs.com/package/@amazon-devices/react-native-w3cmedia
  - Vega media player overview: https://developer.amazon.com/docs/vega/0.22/media-player.html
  - TVEventHandler (no override): https://developer.amazon.com/docs/react-native-vega/0.72/using_tveventhandler.html
  - Focus management: https://developer.amazon.com/docs/vega/0.22/focus-management
  - BackHandler (no events behind a Modal): https://developer.amazon.com/docs/react-native-vega/0.72/backhandler.html
  - `docs/decisions/0006-word-focus.md`, `docs/plans/LING-003.md` (spike S2)
