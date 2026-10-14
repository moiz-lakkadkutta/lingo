# Device run 2026-10-14: Fire TV Stick + phone (LING-003 M2, S1 open rows, LING-006, LING-007 A)

The human holds the remote and the phone; everything else is already running on the Mac (section 0). Each row: do the action,
compare with "Expected", tick Pass or Fail, and write one line under Notes when it fails (what you saw, the time, so the Metro
and API logs can be matched). **Video** marks the rows the shoot needs (docs/video-script.md §3 shot ids). Rows are in the order
to run them; rows 30–34 (Plus / App Tester) need one install on the stick first (row 30).

Do not fix anything during the run. Bugs go to the report with the row number.

## 0. What is running (started by the spike agent, 2026-10-14 ~13:50)

| What | Where | Command (restart) | Stop |
|---|---|---|---|
| Postgres (Homebrew) | `localhost:5432`, DB `lingo` | already running as a service | leave it |
| API, Plus in **iap sandbox** mode, CloudFront manifests | `http://localhost:4000` on the Mac, `http://192.168.1.122:4000` on the LAN, `http://localhost:4000` on the stick through `adb reverse` | `cd apps/api && DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lingo CLOUDFRONT_DOMAIN=d15iq6m6ohqp4j.cloudfront.net LINGO_PLUS_MODE=iap RVS_ENV=sandbox RVS_SHARED_SECRET=sandbox PHONE_URL=http://192.168.1.122:8083/join pnpm dev` (`PHONE_URL` makes the TV's QR a web link to the phone app, rows 4a and 8) | `lsof -nP -iTCP:4000 -sTCP:LISTEN` → `kill <pid>` |
| TV Metro (debug build loads JS from here) | `localhost:8082` → stick sees it as 8081 | `cd apps/expo && CI=1 EXPO_TV=1 EXPO_PUBLIC_API_URL=http://localhost:4000 EXPO_PUBLIC_LINGO_SPIKE=1 npx expo start --port 8082` | `lsof -nP -iTCP:8082 -sTCP:LISTEN` → `kill <pid>` |
| Phone Metro (Expo Go) | `exp://192.168.1.122:8083` | `cd apps/phone && CI=1 EXPO_PUBLIC_API_URL=http://192.168.1.122:4000 npx expo start --port 8083 --lan` | `lsof -nP -iTCP:8083 -sTCP:LISTEN` → `kill <pid>` |
| File server with the Expo Go SDK 54 APK and the phone QR | `http://192.168.1.122:8070/` | `cd <scratchpad>/downloads && python3 -m http.server 8070 --bind 0.0.0.0` | `lsof -nP -iTCP:8070 -sTCP:LISTEN` → `kill <pid>` |
| adb | stick `192.168.1.232:5555`; `adb reverse --list` shows `tcp:4000 tcp:4000` and `tcp:8081 tcp:8082` | `adb connect 192.168.1.232; adb reverse tcp:4000 tcp:4000; adb reverse tcp:8081 tcp:8082` | — |

Logs: `<scratchpad>/api.log`, `tv-metro.log` (every `LINGO-SPIKE <key> <0|1> <ms>` line and every TV `console.log`),
`phone-metro.log`. `<scratchpad>` = the spike agent's session scratchpad directory on the Mac (a temporary folder; ask the orchestrator for the path).
Both Metros run in CI mode (no file watching): after a code change, stop and restart that Metro, then reload the app
(TV: `adb shell am force-stop dev.moizp.lingo && adb shell am start -n dev.moizp.lingo/.MainActivity`; phone: shake → Reload).

State found at the start: TV learner `tv-d89665c8-…`, level **about A1** (every highlight shows), learning de, native en, first run
done, session code **N3N3PR** (created 2026-10-04, reused by `POST /sessions`), no phone connected, 12 published clips from
CloudFront, Home shows the 6 German clips. The installed TV app is the **debug** build (lastUpdateTime 2026-10-14 11:30). A
release APK built 12:50 sits in `apps/expo/android/app/build/outputs/apk/release/` with an unknown baked API URL; it is **not**
installed (see row 29). macOS firewall: off, so the phone reaches 4000/8083/8070 without a prompt.

**Before filming (and before rows 11–25): reset the learner level on the stick to A2.** At about A1 every word is marked, which is
not the state the video shows. TV: Home → ◄ to the rail → Settings → ▼ to "Level: about A1" → ► once → "about A2". Or from the Mac:
`curl -s -X PUT http://localhost:4000/me/level -H 'content-type: application/json' -H 'x-device-id: tv-d89665c8-7ebf-4e04-accf-619f5797b4ce' -d '{"source":"settings","level":"A2"}'`,
then restart Lingo on the stick. Exact steps and the check: docs/video-script.md §5 pre-shoot.

## 1. Phone setup (Android phone; see "If the phone is an iPhone" below)

| # | Action | Expected | Pass | Fail | Video |
|---|---|---|---|---|---|
| 1 | Phone on the same Wi-Fi as the Mac (192.168.1.x). Open Chrome on the phone → `http://192.168.1.122:8070/` | A file listing with `Expo-Go-54.0.8.apk` and `expo-go-qr.png` | [ ] | [ ] | |
| 2 | Tap `Expo-Go-54.0.8.apk` → allow "install unknown apps" for Chrome if asked → Install. **Do not** use Expo Go from the Play Store (it is SDK 57 and refuses an SDK 54 project) | Expo Go 54.0.8 installed | [ ] | [ ] | |
| 3 | Open Expo Go → "Enter URL manually" → `exp://192.168.1.122:8083` → Connect. (Or scan `expo-go-qr.png` on the Mac screen with Expo Go's scanner; the same URL) | Bundle downloads (about 9.7 MB, 10–40 s on first open), then the dark Join screen with six code boxes, Noto Sans, no long white flash (D1) | [ ] | [ ] | S05 |
| 4 | Join screen footer: the server address | Reads `http://192.168.1.122:4000` (baked by `EXPO_PUBLIC_API_URL`). If not, tap it and set it to that | [ ] | [ ] | |
| 4a | **Web route (decided 14:50: the phone has Android Advanced Protection, which blocks sideloaded APKs, so rows 2–3 cannot run).** Phone Chrome → scan `<scratchpad>/phone-web-qr.png` (also at `http://192.168.1.122:8070/phone-web-qr.png`) or type `http://192.168.1.122:8083/` | The same phone Metro serves the app as a web page (react-native-web, bundle 2.3 MB, 3–10 s first load); dark Join screen, six code boxes, footer `http://192.168.1.122:4000`. **No Scan button on web** (a browser gives the camera to https pages only): in row 8 the phone's camera app reads the TV QR instead; everything else (rows 5–7, 9–28) runs the same. With the API started with `PHONE_URL=http://192.168.1.122:8083/join` (§0), the TV's pair QR carries `http://192.168.1.122:8083/join/<code>`: scanning it with the phone's **camera app** opens this web app, which joins by itself (row 8). Checked 14:50 from a headless Chrome at 412×915: Join → `N3N3PR` → Live "Connected to your TV", no console errors; the API saw the join from origin `:8083` | [ ] | [ ] | |
| 4b | Web route, row 9 equivalent: close the Chrome tab, reopen the URL | Live directly (TV remembered in the browser's localStorage) | [ ] | [ ] | |

**If the phone is an iPhone:** Expo Go on the App Store is SDK 57 only and Apple allows no older sideload, so the SDK 54 phone app
cannot run on an iPhone today without an EAS iOS dev build (paid Apple Developer membership, decision 0011 pending) or an upgrade of
`apps/phone` to SDK 57 (code change, not for today). Use an Android phone for this run and the shoot.

## 2. Pairing (LING-004/005/006; decision 0005)

| # | Action | Expected | Pass | Fail | Video |
|---|---|---|---|---|---|
| 5 | TV: rail (◄ from the first card) → Settings → "Pair phone: Not paired" → Select | Pair panel: a 320 px QR and a six-character code (likely `N3N3PR`); label reads the code | [ ] | [ ] | |
| 6 | Phone: type the code slowly; type an `O` once | Each box advances by itself; `O` shows the 0/O/1/I hint and the box stays empty; Backspace on an empty box clears the previous one (D2) | [ ] | [ ] | |
| 7 | Finish the code | Within 2 s the phone shows Live "Connected to your TV"; the TV panel shows a check and "<phone name> connected" (plan 005 §10 step 3) | [ ] | [ ] | S01 (phone paired) |
| 8 | **Web route (API with `PHONE_URL`, §0):** phone camera app → point at the TV's pair QR → open the link. **Native app (API without `PHONE_URL`):** Live → "Use another TV" → Join → Scan → allow the camera (Lingo's own text) → point at the TV QR | Web route: the QR carries `http://192.168.1.122:8083/join/<code>`; Chrome opens the web app, which joins by itself and shows Live "Connected to your TV" (checked 2026-10-14 in a 412×915 browser). Native app: the QR is `lingo://join/<code>`; the in-app scanner reads it and joins; Live again (D5); the phone's camera app cannot open that link into Expo Go | [ ] | [ ] | |
| 9 | Phone: force-quit Expo Go, reopen, reconnect to the same URL | Live directly (TV remembered), "Connected to your TV" again (D4) | [ ] | [ ] | |
| 10 | TV: Back from the Pair panel | Settings shows "Pair phone: <name>" (or paired); Back → Home | [ ] | [ ] | |

## 3. Player: S1 open rows and LING-003 M2 (keys while playing)

Open `Interview mit Holocaust-Überlebender Margot Friedländer (Terra X)`, the video's demo clip since 2026-10-14 (hero Watch or ▼ to its card). For rows 12, 22 and 25 use the video's words: **Konsulat** (cue 11, 0:47) for the Explain card and **registrieren** (cue 9, 0:39) for the save (docs/video-script.md §2). Leave the stage focused. Read `tv-metro.log` for the
`LINGO-SPIKE` lines when a row asks for the log (`tail -f <scratchpad>/tv-metro.log | grep LINGO-SPIKE`).

| # | Action | Expected | Pass | Fail | Video |
|---|---|---|---|---|---|
| 11 | Select Watch | Video from CloudFront starts within ~3 s; German line large and bright, English line smaller above it; a marked word on some lines (S03). Status line bottom-left | [ ] | [ ] | S02, S03 |
| 12 | **Play/Pause** short press (S1 open row) | Log `playPause 0`, `playPause 1`. Video pauses and the Explain card opens on the current line (word, lemma, rank chip, gloss, grammar note, the cue; Save word / Replay / Slower). On a line with no marked word the card is empty-ish: the stage stays focused with a "paused" hint | [ ] | [ ] | S04 |
| 13 | **Play/Pause** again (card open) | Log `playPause …`; the card closes and playback resumes | [ ] | [ ] | |
| 14 | Hold **Play/Pause** ~1 s (S1 open row) | Log: `playPause 0` repeats (no long form); the Player toggles once per repeat at most, never gets stuck paused with no card | [ ] | [ ] | |
| 15 | **Rewind** short press, then **Fast-forward** short press (S1 open row; both keys sit on the AFTSS remote) | Log `rewind 0/1`, `fastForward 0/1`; act as ◄ / ► short: jump to the start of the current line, then to the next line. **The Explain card must not open** | [ ] | [ ] | |
| 16 | **LING-003 M2:** press ► five times quickly, then hold ◄ ~1 s (replay), while watching for a rebuffer spinner | Playback seeks and keeps playing. If the Explain card opens by itself after a seek or a rebuffer, that is M2: the kit reports react-native-video `isPlaying=false` as `paused` and `machine.ts` treats `playerState 'paused'` as a pause (`packages/shared-ui/src/screens/player/machine.ts:127` and `:200`). Note the time; `adb logcat -d | grep -i -E "exoplayer|buffer"` around it is the evidence | [ ] | [ ] | |
| 17 | M2 again on a slow network: `adb shell svc wifi disable` is **not** available on the stick without root, so instead press ► to a line about 3 min in (segments not yet buffered) three times in a row | Same expectation as row 16 | [ ] | [ ] | |
| 18 | ◄ short, ◄ held ~1 s, ► short, ▲ (S1 rows that passed 2026-10-05; regression) | ◄ start of line / replay while held / next line / settings sheet opens and playback continues | [ ] | [ ] | |
| 19 | **Menu** (S1 open row, Player effect) | Debug build: the React Native Dev Menu opens over the Player (expected; log `menu 0`, `menu 1`). The native-line toggle can only be checked on a release build (row 29). Pass = log lines present | [ ] | [ ] | |
| 20 | **Back** with the card open, then ► | Card closes, playback resumes, ► jumps to the next line (stage regained focus) | [ ] | [ ] | |
| 21 | Back while playing | Clip detail; Home's Continue row later shows "Resume from m:ss" (row 36) | [ ] | [ ] | S07c |

## 4. Explain card: word focus and Save → phone (decision 0006; LING-004; S05)

Open the card (Select or Play/Pause) on a line **with a marked word**.

| # | Action | Expected | Pass | Fail | Video |
|---|---|---|---|---|---|
| 22 | Card opens | Focus on **Save word**: light fill, dark text, outline a few px outside, 1.04 scale, readable from the sofa (S1 side finding: the earlier pale fill was hard to read). Photo | [ ] | [ ] | S04 |
| 23 | ▲ | The marked word chip in the cue line takes focus: 3 px outline, no scale. ▲ again: stays on the chip (pinned since 2026-10-10) | [ ] | [ ] | |
| 24 | ▼, then ▼ again | Back to Save word; stays on Save word (pinned), never a chip | [ ] | [ ] | |
| 25 | Phone on the Live screen, in frame. Select **Save word**. Start counting | TV: "Saved. 1 word this clip." (check the n = 1 wording, video risk R3). Phone: the word chip appears in the Live list **under 1 s** (decision 0005 p95). Do this three times on three lines: three chips, in order | [ ] | [ ] | **S05** |
| 26 | Phone: tap a chip | Gloss + example open and the word is spoken in German (needs a German TTS voice on the phone; D7) | [ ] | [ ] | S06 |
| 27 | TV: Replay in the card | The line plays from its start and the card closes / reopens as designed | [ ] | [ ] | |
| 28 | TV: Slower in the card (free learner) | Leads to the Plus offer or is disabled with a Plus hint: never silently 0.75× for a free learner | [ ] | [ ] | |
| 29 | **Optional, release build (Menu effect, S1):** `cd apps/expo && EXPO_PUBLIC_API_URL=http://localhost:4000 EXPO_PUBLIC_LINGO_SPIKE=1 pnpm --filter @lingo/expo android:release` (several minutes, replaces the debug build; `adb reverse tcp:4000 tcp:4000` must stay). In the Player set Native line = Never in the sheet, then Menu | The native line toggles for this line only. Reinstall the debug build afterwards (`adb install -r apps/expo/android/app/build/outputs/apk/debug/app-debug.apk`) | [ ] | [ ] | |

## 5. Lingo Plus and App Tester (LING-007 A; decision 0012)

App Tester is **not** on the stick (`adb shell pm list packages | grep sdktestclient` is empty). No `AppstoreAuthenticationKey.pem`
is in `apps/expo/amazon/`, so App Tester will answer `AUTH_TOKEN_VERIFICATION_FAILURE` on purchase until the PEM from Developer
Console → app → Public Key is added and the app is rebuilt (`EXPO_TV=1 npx expo prebuild --clean` copies it). The API is already in
`LINGO_PLUS_MODE=iap RVS_ENV=sandbox`.

| # | Action | Expected | Pass | Fail | Video |
|---|---|---|---|---|---|
| 30 | Stick: Fire TV home → Find → Search "Amazon App Tester" (not Web App Tester) → Get. Then on the Mac: `adb shell appops set com.amazon.sdktestclient SYSTEM_ALERT_WINDOW allow`; `adb push apps/expo/amazon.sdktester.json /sdcard/amazon.sdktester.json`; `adb shell setprop debug.amazon.sandboxmode debug`; `adb shell getprop debug.amazon.sandboxmode` | `pm list packages` shows `com.amazon.sdktestclient`; "1 file pushed"; `debug`. Amazon gives no adb/APK path for App Tester on a stick (friction log of today) | [ ] | [ ] | |
| 31 | TV: restart Lingo (`adb shell am force-stop dev.moizp.lingo && adb shell am start -n dev.moizp.lingo/.MainActivity`), rail → **Plus** | Price from `amazon.sdktester.json` (2.99), focus on **Subscribe**, label "Subscribe to Lingo Plus for … per month". Without App Tester the TV log showed `[RN-IAP] Failed to initialize IAP connection … This build targets the amazon store, not Google Play` at launch (friction log of today); with App Tester and sandbox on, that line should be gone | [ ] | [ ] | S07b |
| 32 | Select **Subscribe** | The App Tester purchase dialog appears (this is the S07b shot). Without the PEM: a failure message in the Plus screen and `AUTH_TOKEN_VERIFICATION_FAILURE` in `adb logcat`; with the PEM: confirm → "Confirming with Amazon…" → "You have Lingo Plus."; API log `POST /iap/verify` 200 | [ ] | [ ] | **S07b** |
| 33 | Back inside the dialog (cancel) | The offer returns, no message, focus on Subscribe (A12) | [ ] | [ ] | |
| 34 | Afterwards: `adb shell setprop debug.amazon.sandboxmode none`. For filming without the sandbox, restart the API with `LINGO_PLUS_MODE=demo` (Plus says it is on for everyone in this demo) | Sandbox off; Plus screen wording matches the mode | [ ] | [ ] | |

## 6. Home, Summary, quiz on the phone, TV quiz (LING-005 §10; LING-006 D8–D13)

| # | Action | Expected | Pass | Fail | Video |
|---|---|---|---|---|---|
| 35 | Home: ▼ to a card in the second row, ► twice, Select → Clip; Back | The same card has focus (focus memory) and the row is scrolled to it | [ ] | [ ] | |
| 36 | Home after row 21 | Continue row shows the clip with a resume bar and "Resume from m:ss" | [ ] | [ ] | S07c |
| 37 | Watch to the end of a short clip (or ► through it; `Cosmos Laundromat` is 3:37 if you switch Learning language to English in Settings, else `Margot Friedländer` 3:46) | Summary: "N neue Wörter" with chips, focus on Quiz on TV; with the phone connected, "Quiz on your phone" is offered | [ ] | [ ] | S06 |
| 38 | Select **Quiz on your phone** | Phone shows "Quiz me now" (announced by TalkBack if on) and does not change screen by itself (D8) | [ ] | [ ] | S06 |
| 39 | Phone: Quiz me now | Header "0 due · N new"; the front shows only the word; tap → gloss, the cue with the word marked, the native line; four equal grade buttons at the bottom, each ≥ 56 dp (D9) | [ ] | [ ] | S06 |
| 40 | Grade **Again** on the first word, **Good** on the rest | The Again word returns after the others; then "Done for today", "N words reviewed…", "Sent to your TV"; the TV Summary shows the phone's score (D10; video S06 "if built") | [ ] | [ ] | **S06** |
| 41 | Mac: `psql postgresql://postgres:postgres@localhost:5432/lingo -c "select reps, \"intervalD\", due, lapses from \"SavedWord\" order by \"createdAt\" desc limit 3"` | Good words: intervalD 1, due ≈ now + 24 h; the Again word: lapses 1 (D11) | [ ] | [ ] | |
| 42 | Phone: Progress tab | "Day 1", four approximate-level bars, "N words to review tomorrow" (D12) | [ ] | [ ] | S09 |
| 43 | TV: Quiz on TV (from a Summary) | Correct: blue ring + check, moves on after ~0.6 s; incorrect: coral ring on the pick, the answer ringed blue, native line shown, focus on Continue. No timer | [ ] | [ ] | |
| 44 | TV: rail → Words | Rows sorted by due; ◄► switches All / Due today / Learned; Select plays the line in the mini player; Back closes it | [ ] | [ ] | |
| 45 | Phone: Wi-Fi off, then on | Live shows "Reconnecting…", Review shows the load error with Try again; reconnects by itself (D14) | [ ] | [ ] | |

## 7. Review lows that need a device (TASKS.md)

| # | Action | Expected | Pass | Fail | Video |
|---|---|---|---|---|---|
| 46 | **B-L4:** stop the API (`kill` the pid on 4000), cold-start Lingo on the stick → offline screen → Back | Back should leave the app or stay on the offline screen; the low says it pops a hidden stack. Then restart the API, Retry → Home. Note what Back did | [ ] | [ ] | |
| 47 | **B-L5:** while a clip plays, `adb shell am start -a android.intent.action.VIEW -d "lingo://clip/jung-naiv-drogen?t=30"` | The new clip opens at 0:30. The low: the old clip's position and saved words are dropped. Check Home's Continue row for the old clip afterwards | [ ] | [ ] | |
| 48 | **A-L3** (API, no device): `curl -s http://localhost:4000/me` with no `x-device-id` | Still answers for the shared `anon` learner (the low). Record the status code | [ ] | [ ] | |
| 49 | **L6 (LING-006):** phone on Quiz, stop the API, tap a grade | The grade buttons stay disabled (no fetch timeout, the low); restart the API and note whether they recover | [ ] | [ ] | |
| 50 | **LING-005 step 15, two pairing codes:** only if a second device is at hand (second stick or the VVD) | Different codes on the two devices; `select "deviceId" from "Learner" order by "lastActive" desc limit 2` shows two `tv-<uuid>` ids | [ ] | [ ] | S08 (if the VVD runs) |

## Notes (row → what happened, time)

-
