# Filming Lingo on a new Fire TV Stick

Step-by-step checklist for setting up a brand-new stick on any network and filming the demo video. Shots: [shot-sheet.md](shot-sheet.md). Script: [../video-script.md](../video-script.md). Tester guide: [../try-on-fire-tv.md](../try-on-fire-tv.md).

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
