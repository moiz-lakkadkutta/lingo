# S1: Fire OS remote events and chip focus (react-native-tvos), first device run

Task attempted: Run spike S1 (docs/spikes/S1-fire-os-remote.md) on a Fire TV Stick: key events per remote key, long press timing,
chip focus in the Explain card, and stage focus after Back. Blocks merge of LING-003 G2/G3.
Steps:
  1. `EXPO_TV=1 npx expo prebuild --clean --platform android`, debug build with `EXPO_PUBLIC_LINGO_SPIKE=1`, installed over adb (Wi-Fi).
  2. Local API (`LINGO_PLUS_MODE=off`) and a test clip `s1-spike`: the `demo-de` pipeline fixture's 23 cues, two test highlights per
     cue, a 66 s ffmpeg `testsrc2` HLS stream. Not committed (setup notes below).
  3. Remote keys pressed by a person; chip focus moves also checked with `adb shell input keyevent` plus `uiautomator dump`.
Expected: The table in the spike doc, flag-on column.
Actual (2026-10-04, **flag on**: `MainApplication.kt` has `ReactFeatureFlags.enableKeyDownEvents = true`, and every key logs 0 then 1):

| Row | Log | Player | Result |
|---|---|---|---|
| ◄ short | `left 0`, `left 1` | jumps back | pass |
| ◄ held ~1 s | `left 0`, `longLeft 0` at **453–595 ms** (5 holds: 453, 487, 499, 595, 492), `longLeft 1` on release, no `left 1` | replays the line while the key is down, then plays on | pass. Replay latency about 0.45–0.6 s |
| ► short | `right 0`, `right 1` | jumps to the next line | pass |
| ► held | `right 0`, `longRight 0` at ~495 ms, `longRight 1` on release | not in the spike table | noted |
| ▲ | `up 0`, `up 1` | settings sheet opens, playback continues | pass |
| Menu | `menu 0`, `menu 1` | the React Native Dev Menu (Bridgeless) opens over the Player | log pass; Player effect **not checked** (debug builds catch Menu for the dev menu) |
| Play/Pause | nothing logged yet | not checked | **open** |
| Rewind / FF | nothing logged yet | not checked | **open** |
| Play/Pause held | not checked | | **open** |
| §2 Save word focus | | the card opens with Save word focused (on a cue with a highlight) | pass |
| §2 ▲ to chip | | the chip takes focus through `nextFocusUp`, 3 px ring, no scale (evidence screenshot) | pass |
| §2 ▼ back | | chip ▼ goes to Save word through `nextFocusDown` | pass |
| §3 Back, then ► | | the card closes, playback resumes, ► jumps to the next line | pass |

  Side findings:
  - The word chips sit in the cue line *below* the card, so Android's spatial focus search also links them the other way round:
    Save word ▼ goes to the chip, and chip ▲ goes to Replay. The ▲/▼ pair works as the plan says, but both directions lead between card
    and line, and on screen they look reversed. Seen with injected keys (`uiautomator dump`, checked twice per step).
  - A focused primary button (Watch on Clip detail, Save word in the card) draws a pale fill with light text that is hard to read on
    the TV (photos). Not an S1 item; check against the focus rule in CLAUDE.md.
  - On a cue without highlights the card opens on Replay with no chips and no Save word. Expected from `Explain.tsx`, but a spike
    tester has to open the card on a highlighted line for §2.

Severity: Medium. S1 is not complete: Play/Pause, Rewind/FF, the Play/Pause hold and the Menu effect on the Player are open. The run
stopped when the Mac left the stick's network (adb offline). The setup took about an hour (below).
Workaround: Setup friction met on the way, all solved without repo changes:
  - Port 8081 belonged to another project's Metro and the stick loaded that bundle ("React Native version mismatch", JS 0.83.10,
    native 0.81.5-2). Lingo's Metro ran on 8082 with `adb reverse tcp:8081 tcp:8082`. The app is not a dev-client build, so the
    `lingo://expo-development-client/?url=…` deep link is ignored.
  - `App.tsx` defaults the API to `http://10.0.2.2:4000` (the emulator host). On a stick: `EXPO_PUBLIC_API_URL=http://localhost:4000` and
    `adb reverse tcp:4000 …`.
  - There is no seed or local-media path. `manifestUrl` falls back to `http://localhost/<key>` (port 80), and the stick refuses
    `adb reverse tcp:80` ("cannot bind listener: Permission denied"). A small Node proxy served the HLS files, forwarded the API (and
    WebSockets), and rewrote `http://localhost/` to the proxy.
  - `/clips/:slug` only returns highlights at or above the learner's rank floor, so 6 of 23 cues showed chips.
Suggestion:
  - Finish the open rows. In a debug build Menu opens the dev menu, so either check the Menu row on a release build or accept the log
    alone.
  - Add a dev seed (`pnpm --filter @lingo/api seed:dev`) that publishes a fixture clip with cues and highlights, and a `MEDIA_BASE_URL`
    (http, any port) for local media, so a device spike needs no proxy.
  - Decide whether Save word ▼ and chip ▲ should be pinned (`nextFocusDown` on the card buttons, `nextFocusUp` on chips) to stop the
    spatial wrap.
Environment: Fire TV Stick AFTSS (sheldon), Fire OS 7.7.1.7 (PS7717/5741), Android 9 (API 28). Remote: "Amazon Fire TV Remote", Bluetooth,
vendor 0x0171 product 0x042f (printed model not read). react-native-tvos 0.81.5-2, Fabric, debug build. macOS host, Homebrew Postgres.
Links:
  - docs/spikes/S1-fire-os-remote.md, docs/plans/LING-003.md §Spikes, docs/decisions/0006-word-focus.md
  - docs/spikes/S1-evidence/2026-10-04-logcat-keys.txt (`LINGO-SPIKE` key lines, epoch seconds; focus/blur lines dropped)
  - docs/spikes/S1-evidence/2026-10-04-chip-focus-dreimal.png (device screenshot: the chip ring, Save word unfocused)
  - packages/shared-ui/src/screens/Player.tsx:144-147, packages/shared-ui/src/screens/Explain.tsx:35-44, components/WordChip.tsx:47-50
