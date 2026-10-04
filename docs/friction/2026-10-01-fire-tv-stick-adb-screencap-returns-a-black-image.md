# Fire TV Stick: `adb screencap` returns a black image

Task attempted: Capture screenshots of the app on the Fire TV Stick as evidence for the kit's device matrix (week-0 spike, 2026-09-26),
and plan Lingo's design-QA screenshots and README platform-integration evidence.
Steps:
  1. Connect the Fire TV Stick over adb and run the app (debug build).
  2. `adb exec-out screencap -p > shot.png` (or `adb shell screencap`) while the player shows video and subtitles.
Expected: A PNG of the TV frame, as on other Android 9 devices (https://developer.android.com/tools/adb, screencap).
Actual: The capture is black on this stick, so the spike's evidence is photos of the TV and logcat lines instead
(`../vega-media-kit/docs/device-matrix.md` Fire OS column note: "screencap is black on this stick; photos + logcat `KIT-SPIKE` lines";
`../vega-media-kit/docs/decisions/0001-week0-gates.md` consequence 6). Whether screens without video (Home, Settings) are also
black: TBD by human (docs/design-qa/README.md asks to try once per session).
Severity: Medium — no pixel-exact screenshots from the device for design QA, the README or the submission; photos need a tripod and
retakes (minutes lost: TBD by human).
Workaround: Photos on a tripod for device evidence; an Android TV emulator (API 28) running the same APK for pixel-exact layout and
colour checks, labelled "emulator" (docs/design-qa/README.md).
Suggestion: Document how to take a screenshot of a Fire TV Stick screen (or state that adb screencap is blocked, e.g. for protected
video surfaces, and what to use instead).
Environment: Platform: Fire OS. Fire OS 7.7.1.6 (Android 9 / API 28) on a Fire TV Stick `AFTSS`, 2026-09-26; debug build of the multi-TV sample + kit.
Links:
  - ../vega-media-kit/docs/device-matrix.md (Fire OS column note)
  - ../vega-media-kit/docs/decisions/0001-week0-gates.md (consequence 6)
  - https://developer.android.com/tools/adb
  - docs/design-qa/README.md (capture order)
