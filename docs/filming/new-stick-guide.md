# Filming Lingo on a new Fire TV Stick

Step-by-step checklist for setting up a brand-new stick on any network and filming the demo video. Shots: [shot-sheet.md](shot-sheet.md). Script: [../video-script.md](../video-script.md). Tester guide: [../try-on-fire-tv.md](../try-on-fire-tv.md). AI agent with a shell: [run it over adb](#for-an-ai-agent-run-it-over-adb).

```text
LINGO ON A BRAND-NEW FIRE TV STICK, ON ANY NETWORK (for filming the demo)
2026-10-23

Lingo runs from the internet: the TV app and the phone page talk to an always-on server
(https://demo-51-102-187-91.sslip.io). Nothing runs on the Mac, so any Wi-Fi with normal internet works.
The TV and the phone do NOT need to be on the same Wi-Fi.

======================================================================
0. BEFORE YOU LEAVE (on the Mac, 5 minutes)
======================================================================
[ ] Publish release "fire-tv-judging-2" (Claude gives you the one-line command). Until it is published,
    the download link below gives build 1, which lacks today's fixes (phone pairing with an old code,
    Words list layout, About credits). Check: https://github.com/moiz-lakkadkutta/lingo/releases/latest
    shows "judging build 2".
[ ] Take the shot sheet with you (print it or keep it on the laptop/phone): docs/filming/shot-sheet.md
[ ] Bring: stick + power adapter (not a TV USB port), remote with batteries, HDMI access, phone (charged),
    phone stand, tripod(s).

======================================================================
1. SET UP THE NEW STICK (about 10 minutes)
======================================================================
[ ] Plug in, follow Amazon's setup: language, Wi-Fi, sign in with an Amazon account, skip offers.
    Hotel / office Wi-Fi with a login page: finish the login page on the TV when it asks; test that
    the YouTube or Prime Video app plays something before going on.
[ ] Screensaver off: Settings > Display & Sounds > Screensaver > Start Time > Never.
[ ] Install "Downloader" (by AFTVnews): Home > Find > Search > type Downloader > select the orange app > Get.
[ ] Turn on Developer options: Settings > My Fire TV. If "Developer options" is missing:
    About > press Select 7 times on the first entry (the device name) > Back.
[ ] Settings > My Fire TV > Developer options > Install unknown apps > Downloader: ON
    (older Fire OS: "Apps from Unknown Sources": ON).

======================================================================
2. INSTALL LINGO PLUS DEMO (about 5 minutes)
======================================================================
[ ] Open Downloader. Allow file access if asked.
[ ] In the address box on the Home tab type exactly, then Go:
        https://github.com/moiz-lakkadkutta/lingo/releases/latest/download/lingo-demo.apk
    (about 49 MB; it can take a few minutes on slow Wi-Fi)
[ ] Install > Open. When Downloader offers to delete the file: Delete (the app stays).
[ ] Optional, only if you film S07b (the Lingo Plus purchase screen): same steps with
        https://github.com/moiz-lakkadkutta/lingo/releases/latest/download/lingo-iap.apk
    That installs "Lingo". On a stick without Amazon App Tester its Plus screen shows
    "Price unavailable right now." (no Subscribe button) - film it only if that is what the shot needs.

======================================================================
3. FIRST LAUNCH: SET IT UP FOR THE VIDEO (2 minutes)
======================================================================
[ ] I'm learning: Deutsch > Select.   I speak: English > Continue.
[ ] Level check: choose "Skip · start at about A2" (it only offers A2 there).
[ ] Pair screen: choose "Later" (you pair the real phone on camera, or in prep).
[ ] Set the level to B1, so Home shows the demo clip:
    Left (opens the menu) > Down to Settings > Select > Level: Right until "B1" ("Saved." appears) > Back.
[ ] Home now shows "Interview mit Holocaust-Überlebender Margot Friedländer (Terra X)", about B1, 4 min,
    and a row "Just right for you · about B1". If Home looks empty, wait a few seconds (posters load).

======================================================================
4. PAIR THE PHONE
======================================================================
[ ] Phone: Do Not Disturb on, auto-lock off, brightness about 70 % (match the TV).
[ ] TV: Left > Settings > "Pair phone" > Select. A QR code and a 6-character code appear.
[ ] Phone: scan the QR with the normal camera app and open the link (a web page, nothing to install).
    TV shows "Your phone connected"; phone shows "Connected to your TV". Back to Home on the TV.
[ ] No luck scanning? On the phone open https://phone-demo-51-102-187-91.sslip.io, type the 6 characters, Join.
[ ] If the phone page says it is connected to an OLD TV: tap "Use another TV" (or use a private tab).

======================================================================
5. FILM - follow docs/filming/shot-sheet.md
======================================================================
Key moments (let the clip play; press SELECT while the line is on screen - don't count Right presses):
- ~0:39  "Sie wollte sich für Amerika registrieren."  -> card "registrieren" -> Save word (S05, the phone shows it)
- ~0:47  "... und sie zum Konsulat gegangen ist,"      -> card "Konsulat" ("consulate") (S04)
- Select pauses and opens the card; Back (or Play/Pause) closes it and playback continues.

======================================================================
6. RESET BETWEEN TAKES (the saved word stays saved otherwise)
======================================================================
[ ] TV: Home button > Settings > Applications > Manage Installed Applications > Lingo Plus Demo > Clear data.
[ ] Open Lingo Plus Demo again and repeat section 3 (Deutsch, English, Skip, Later, Level B1).
[ ] Phone: refresh the page; if it shows the old TV, "Use another TV"; pair again (section 4).

======================================================================
7. IF SOMETHING GOES WRONG
======================================================================
- Downloader says the file can't be found / 404: the address has a typo; check "lingo-demo.apk" at the end.
- "App not installed": an older Lingo build with another signature is on the stick: uninstall it first
  (Settings > Applications > Manage Installed Applications > ... > Uninstall).
- Red screen "Unable to load script ... Metro": that is a developer build, not the release. Uninstall it,
  install from the link above.
- Clip page opens but video stays black: check the Wi-Fi has internet (another streaming app plays?).
- Server check from the phone browser: https://demo-51-102-187-91.sslip.io/health
  should show {"success":true,"data":{"ok":true,...}}. If not, message Claude.
- First Left press on Home sometimes does nothing: press Left again (known issue).
- "No TV with that code": the code changed or expired; open Pair phone on the TV again and use the new code.
```

## For an AI agent: run it over adb

This part lets an AI coding agent with a shell (Claude Code, for example) install, start and drive Lingo on the stick by itself, and
drive the phone page in a browser. The agent presses the remote's keys over adb and looks at screenshots. Section 1 above still
applies (a set-up stick, screensaver off); Downloader is not needed. [`scripts/fire-tv.sh`](../../scripts/fire-tv.sh) wraps
every step; the raw adb commands are listed under each step as the reference.

Checked on 2026-10-23 without a device: launcher activity, deep-link schemes and sha256 from the build 2 APKs (`aapt dump badging`),
the clip slug from the demo server, the script with `shellcheck` and a stub adb. The adb commands are standard Android ones but were
**not** run on a stick for this guide; where a result is not certain, it says "should".

| App | Package | Activity | Deep link | Server | Phone page |
|---|---|---|---|---|---|
| Lingo Plus Demo | `dev.moizp.lingo.demo` | `dev.moizp.lingo.demo/.MainActivity` | `lingodemo://clip/<slug>?t=<seconds>` | https://demo-51-102-187-91.sslip.io | https://phone-demo-51-102-187-91.sslip.io |
| Lingo | `dev.moizp.lingo` | `dev.moizp.lingo/.MainActivity` | `lingo://clip/<slug>?t=<seconds>` | https://iap-51-102-187-91.sslip.io | https://phone-iap-51-102-187-91.sslip.io |

The demo clip "Interview mit Holocaust-Überlebender Margot Friedländer (Terra X)" (about B1, 3:46) has the slug `terra-x-friedlaender`.

### 1. What the human does once (5 minutes)

1. TV: **Settings** → **My Fire TV** → **Developer options** → **ADB debugging**: ON. (No Developer options? See section 1 above.)
2. TV: note the IP address: **Settings** → **My Fire TV** → **About** → **Network**.
3. The computer that runs the agent must be on the **same network as the TV**. adb needs that; the app itself only needs internet.
4. Get the script and the tools (adb, curl, unzip; it installs what is missing):

   ```sh
   curl -fsSLO https://raw.githubusercontent.com/moiz-lakkadkutta/lingo/main/scripts/fire-tv.sh && bash fire-tv.sh setup
   ```

   In a clone of the repo, use `bash scripts/fire-tv.sh setup`. On macOS it uses Homebrew (`brew install --cask
   android-platform-tools`) if you have it, otherwise it puts Google's platform-tools in `~/.lingo/platform-tools`. On Windows, use WSL.
5. **On a Mac, connect from your own Terminal app**, not from the agent:

   ```sh
   adb kill-server; adb connect <tv-ip>:5555
   ```

   (If adb came from `~/.lingo/platform-tools`, type `~/.lingo/platform-tools/adb` instead of `adb`.) The TV asks "Allow USB
   debugging?": tick **Always allow from this computer** and select **OK**. `adb devices` then shows `<tv-ip>:5555  device`.
   Why: macOS Local Network privacy can block an adb server that a sandboxed agent starts ("No route to host"). The agent's adb
   commands reuse the server you started. On Linux the agent can run `fire-tv.sh connect <tv-ip>` itself.
6. Give the agent the prompt below.

### 2. Prompt for the agent (copy, fill in the IP)

```text
You have a shell. A Fire TV Stick is at <tv-ip>:5555 and adb is already connected to it.
Never run "adb kill-server" or "adb start-server": on macOS that breaks the connection.
Read the section "For an AI agent: run it over adb" in
https://github.com/moiz-lakkadkutta/lingo/blob/main/docs/filming/new-stick-guide.md and use scripts/fire-tv.sh from that repo.
Set LINGO_TV=<tv-ip>:5555 for every command.
1. Run "fire-tv.sh doctor" and "fire-tv.sh health". Run "fire-tv.sh setup" only if doctor says something is missing.
2. "fire-tv.sh connect <tv-ip>", then "fire-tv.sh install demo" (it checks the sha256), then "fire-tv.sh launch demo".
3. Finish first launch: Deutsch, English, "Skip · start at about A2", "Later", then Settings > Level to about B1.
   Look, press, look: take a screenshot (fire-tv.sh shot) and read it before every key, press one key, look again.
4. Check that Home shows "Interview mit Holocaust-Überlebender Margot Friedländer (Terra X)".
5. Report each step, what you saw, the screenshot paths, and anything that did not match the guide.
```

### 3. Commands

`bash scripts/fire-tv.sh --help` lists them all. Set `LINGO_TV=<tv-ip>:5555` (or `ANDROID_SERIAL`) when more than one device is
attached. Lingo Plus Demo is the default; add `iap` for "Lingo".

| Script | What it does | Raw adb (reference) |
|---|---|---|
| `doctor` | Lists the tools present and missing, the adb version and the devices | `adb version`, `adb devices -l` |
| `setup` | Installs what is missing | `brew install --cask android-platform-tools`, or the zip from https://dl.google.com/android/repository/platform-tools-latest-darwin.zip (`-linux.zip` on Linux) |
| `connect <tv-ip>` | Connects, waits for the device, prints model and Fire OS version | `adb connect <tv-ip>:5555`, `adb shell getprop ro.product.model`, `adb shell getprop ro.build.version.name` |
| `install` | Downloads the APK into `~/.lingo/apks`, checks the sha256, installs, prints the version | see below |
| `launch` | Starts the app | `adb shell am start -n dev.moizp.lingo.demo/.MainActivity`, or `adb shell monkey -p dev.moizp.lingo.demo -c android.intent.category.LEANBACK_LAUNCHER 1` |
| `clip [demo\|iap] [t]` | Opens the Margot Friedländer clip in the player, at `t` seconds | `adb shell "am start -a android.intent.action.VIEW -d 'lingodemo://clip/terra-x-friedlaender?t=36'"` |
| `key <name>... [xN]` | Presses remote keys, 0.6 s apart; `key down x3` presses Down 3 times | `adb shell input keyevent KEYCODE_DPAD_DOWN` (table below) |
| `shot [file]` | Screenshot to `./lingo-shots/<time>.png`; prints the path | `adb exec-out screencap -p > shot.png` |
| `ui` | Labels and text on screen, the focused item marked `>` | `adb shell uiautomator dump /sdcard/ui.xml && adb exec-out cat /sdcard/ui.xml` |
| `record [s]` | Screen recording, 1 to 180 s, pulled into `./lingo-shots` | `adb shell screenrecord --time-limit 60 /sdcard/take.mp4`, then `adb pull /sdcard/take.mp4` |
| `logs` / `logs crash` | App log (follows) / crash log | `adb logcat -s ReactNativeJS:V ReactNative:V` / `adb logcat -d -b crash` |
| `reset` | Clears the app's data (like section 6) | `adb shell pm clear dev.moizp.lingo.demo` |
| `uninstall` | Removes the app | `adb uninstall dev.moizp.lingo.demo` |
| `health` | Checks both servers | `curl https://demo-51-102-187-91.sslip.io/health` → `{"success":true,"data":{"ok":true,...}}` |

Install by hand (what `install` does):

```sh
curl -fLO https://github.com/moiz-lakkadkutta/lingo/releases/latest/download/lingo-demo.apk
echo "a274df46b867ec993bcc2f1f5802838ca16fc2c5ddd71a87b0701c543e326928  lingo-demo.apk" | shasum -a 256 -c
# lingo-iap.apk: ca033426bc9a5464ee48223b1a3c65568039e8f8c7f7b9a23e5d8bbcc44c06f9 (Linux: sha256sum -c)
adb install -r lingo-demo.apk
adb shell dumpsys package dev.moizp.lingo.demo | grep versionName   # versionName=0.1.0
```

The hashes are for release fire-tv-judging-2 (build 2). If a newer release is out, the check stops; compare with the release page.

Remote keys (`adb shell input keyevent <name>`):

| Script | Key | Code | Remote button |
|---|---|---|---|
| `up` `down` `left` `right` | `KEYCODE_DPAD_UP` / `_DOWN` / `_LEFT` / `_RIGHT` | 19 / 20 / 21 / 22 | D-pad |
| `select` | `KEYCODE_DPAD_CENTER` | 23 | Select (centre) |
| `back` | `KEYCODE_BACK` | 4 | Back |
| `home` | `KEYCODE_HOME` | 3 | Home |
| `play` | `KEYCODE_MEDIA_PLAY_PAUSE` | 85 | Play/Pause |
| `menu` | `KEYCODE_MENU` | 82 | Menu (three lines) |

Deep link notes: it opens the player directly (not the clip page). It works only after first launch, once Home has loaded, and only
for a clip Home lists (at about A2 or B1 the Margot Friedländer clip is there); another slug is ignored without a message. Lines to
aim for are in section 5 (`t=36` starts just before "registrieren" at about 0:39).

### 4. Look, press, look

The robust way to drive the app: **take a screenshot, read it, press one key, take another screenshot.** Don't send long key
sequences blind: focus can start in a different place (for example after a slow network), and the first Left on Home sometimes does
nothing (known issue, press it again).

- `shot` shows what the human sees; focus is an outline plus a slight zoom. If the video area is black in a screenshot while it plays
  on the TV, that is the capture, not the app.
- `ui` reads the screen as text. Every focusable item in Lingo has a label stating its purpose, which should show up as
  `content-desc` (not yet checked on a stick). The dump can fail while a video plays; use `shot` then.
- Expected first launch (section 3): "I'm learning": focus a **Deutsch** tile, Select → "I speak": **English** with **Continue**,
  Select → level check: move to **"Skip · start at about A2"**, Select → pair screen: move to **Later**, Select → Home. Then Left
  (opens the menu) → Down to **Settings** → Select → **Level**: Right until "about B1" and "Saved." → Back.
- Keep the TV awake: the screensaver step in section 1 does that. `key` presses wake it too; `adb shell input keyevent
  KEYCODE_WAKEUP` wakes it without pressing anything in the app. Don't change system settings for this.

### 5. The phone page

An agent with a browser tool (Playwright, Chrome) can stand in for the phone:

1. TV: open the pair screen (first launch, or Left → **Settings** → **Pair phone**). Read the 6-character code from a screenshot. The
   QR code's label should also give it in the `ui` output: "QR code to pair your phone, code A B C 2 3 4". Codes use letters and the
   digits 2–9.
2. Browser: open https://phone-demo-51-102-187-91.sslip.io (https://phone-iap-51-102-187-91.sslip.io for "Lingo"). Under "Enter the
   code on your TV" are six boxes ("Code character 1 of 6" …). Type the code and select **Join**.
3. The page shows "Connected to your TV"; the TV shows "Your phone connected". A word saved on the TV shows up in the page's **Live** tab
   within about a second.

### 6. If something goes wrong (agent)

| What you see | What to do |
|---|---|
| `No route to host` / `failed to connect` on a Mac | Ask the human to run `adb kill-server; adb connect <tv-ip>:5555` in their own Terminal (step 1.5). Don't run kill-server yourself. |
| `failed to connect` elsewhere | Same network as the TV? ADB debugging on? IP still current (it can change after a restart)? |
| `unauthorized` in `adb devices` | The human accepts the prompt on the TV ("Always allow from this computer"). |
| `more than one device/emulator` | Set `LINGO_TV=<tv-ip>:5555`. |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | Another Lingo build with a different signature is installed: `uninstall`, then `install`. |
| sha256 check stops | Download again; if it still differs, a newer release is out: compare with the release page. |
| `clip` opens the app but no player | Finish first launch first, and check Home lists the clip. |
| A red "Unable to load script" screen | A developer build is installed, not the release: `uninstall`, `install`. |
| The app closes by itself | `logs crash`, and `logs` while you repeat the step. |
