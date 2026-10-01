# Design QA — screenshot procedure

When: after LING-005, LING-006 and LING-007 merge and before the **Oct 15 freeze**; repeat for every screen a fix changes. Capture is done by
the human (no device in the agent sandbox). Each round fills one copy of [TEMPLATE.md](TEMPLATE.md) as `docs/design-qa/2026-10-<dd>/SHEET.md`.
The same captures feed the README status slots and the video (LING-009). Rules being checked: CLAUDE.md, docs/PLAN.md §8–9,
`packages/shared-ui/src/theme/tokens.ts`, docs/decisions/0002-wording.md.

## 1. Capture, in this order of preference

1. **Fire TV Stick**: once per session, on a screen without video (Home), try
   `adb exec-out screencap -p > fireos-home-loaded.png`. It is reported black on this stick
   ([friction log](../friction/2026-10-01-fire-tv-stick-adb-screencap-returns-a-black-image.md)); record in the sheet whether UI-only
   screens are black too, then fall back.
2. **Android TV emulator** running the same Fire OS APK: AVD "Television (1080p)", Android 9 / API 28 (Fire OS 7 is Android 9).
   `adb -s emulator-5554 install <apk>` then `adb -s emulator-5554 exec-out screencap -p > emu-<screen>-<state>.png`
   (https://developer.android.com/tools/adb). Pixel-exact for layout and colour; label the sheet "emulator" — it is not device evidence.
3. **Photo on a tripod** of the TV for device evidence (also B-roll for the video): straight on, the whole frame, no room light on the panel.
4. **Vega**: the Vega Virtual Device window, method from the VVD checklist step 11 (apps/vega/README.md) — TBD until that run.
5. **Phone**: `adb exec-out screencap -p > phone-<screen>-<state>.png` (Android) or the OS screenshot (iOS).

## 2. Files

`docs/design-qa/2026-10-<dd>/<platform>-<screen>-<state>.png`, platform = `fireos`, `emu`, `vega` or `phone`
(e.g. `emu-quiz-incorrect.png`). Keep each ≤ 400 KB: `ffmpeg -i in.png -compression_level 9 out.png`, or JPEG quality 85 for photos
(`ffmpeg -i in.jpg -q:v 4 out.jpg`). Total ≤ 15 MB per round.

## 3. Screen × state matrix

Rows for screens owned by LING-005/006/007 are captured when those land; mark "n/a (not merged)" otherwise.

TV
- First run: P1 "I'm learning"; P2 "I speak"; P3 placement (a cue + Yes/Mostly/No); P4 pair (QR + code), and the "<name>'s phone connected" state.
- Home: loaded with focus on hero Watch; rail open; skeleton cards; offline message; Continue row hidden when empty.
- Clip: normal (Words you'll meet, attribution); "Preparing subtitles — about 3 minutes."
- Player: playing with dual cue + marker; Challenge mode with the Menu reveal; status line; settings sheet; auto-pause bar.
- Explain: focus on Save; focus on a word chip; saved; free-tier daily limit reached.
- Summary: with words; with no words.
- Quiz (TV): question; correct; incorrect.
- Words: list; empty; each filter (All / Due today / Learned).
- Settings; Lingo Plus; About & attributions; Vega playback-unavailable message (once LING-005 renders it for `caps.playback === false`).

Phone
- Join; Live (word chips; "Quiz me now"); Quiz (card front; back with the four grades); Progress; Welcome back.

## 4. Checks per screenshot (sheet columns: pass / fail + note)

1. **Cues**: target cue bright `#EFF1EE`, larger (44 px at 1080p); native cue `#9FC9D8`, smaller (32 px) and above it; ≤ 2 lines each.
2. **Marker** `#E3C77A` only on words to learn, dark text on it; never on buttons or errors.
3. **Focus**: exactly one focused element; focus = 4 px off-white outline, 3 px offset, visible 1.04 scale (words in a cue: 3 px outline,
   2 px offset, no scale).
4. **No pure white**: an eyedropper on the brightest text reads `#EFF1EE`, not `#FFFFFF`.
5. **Safe zone**: nothing interactive or textual within 96 px (left/right) and 54 px (top/bottom) of a 1920×1080 frame (5 %, kit defaults).
6. **Type**: smallest text ≥ 24 px at 1080p (label token 28 px); Noto Sans everywhere, Manrope only for display; SemiBold does not look
   synthetically bolded (tokens pair `NotoSans-SemiBold` with weight 700 — packages/shared-ui/assets/fonts/README.md).
7. **Never colour alone**: quiz correct has a check; incorrect shows the right answer; level chips use surface-2, not a colour per level.
8. **Wording**: "Welcome back"; no "wrong" or "failed"; levels say "approximate" where shown (docs/decisions/0002-wording.md).
9. **Empty / error / offline**: text present, focus lands somewhere.

Not a screenshot: with VoiceView (Fire OS) or TalkBack (phone) on, the spoken label of the focused element on each screen is a purpose
("Save word: warten"); write down the text you hear.

## 5. Findings

One line per failure in the sheet's Findings table with the owning ticket (LING-005 TV screens, LING-006 phone, LING-007 Plus,
LING-003 player, LING-008 fonts). The orchestrator files them in TASKS.md; fix before the freeze, then re-capture only the affected rows.
