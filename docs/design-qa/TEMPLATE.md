# Design QA sheet — round <n>, 2026-10-<dd>

Copy to `docs/design-qa/2026-10-<dd>/SHEET.md`. Procedure and the meaning of checks 1–9: [README.md](README.md).

- Captured by: <name> · Build: Fire OS APK <git sha> / Vega <git sha or n/a> / phone <git sha>
- Capture method per platform (stick / emulator / photo / VVD / phone): <…>
- Stick `adb screencap` on a UI-only screen: black / works (record once per round)

## Screens

Write `P` (pass), `F` (fail — add a Findings row) or `–` (not applicable) per check.

| File | Platform | Screen · state | 1 Cues | 2 Marker | 3 Focus | 4 No white | 5 Safe zone | 6 Type | 7 Not colour alone | 8 Wording | 9 Empty/error | Spoken label (VoiceView/TalkBack) | Note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| emu-home-loaded.png | emulator | Home · loaded, focus on hero Watch | – | | | | | | | | | | |
| emu-player-dual-cue.png | emulator | Player · playing, dual cue + marker | | | | | | | | | | | |
| … | | | | | | | | | | | | | |

## Findings

| # | File | Check | What is wrong | Owner ticket | Fixed in (commit) |
|---|---|---|---|---|---|
| 1 | | | | | |
