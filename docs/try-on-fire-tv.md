# Try Lingo on a Fire TV Stick

Install Lingo on your own Fire TV Stick and try it in about 15 minutes, with no developer tools: the TV app is a ready-made APK, the
servers are always on, and your phone needs no install. If something here doesn't match what you see, please
[open an issue](#report-a-problem).

Lingo teaches German or English from short video clips: two subtitle lines, a pause that explains a word, and a phone that saves the
words and reviews them with you later.

## What you need

- An Amazon Fire TV device running **Fire OS 6 or later** (both APKs need Android 7.0, API level 24, or newer; Fire OS 6 is based on
  Android 7.1, Fire OS 7 on Android 9, Fire OS 8 on Android 10/11, per
  [Amazon's Fire OS overview](https://developer.amazon.com/docs/fire-tv/fire-os-overview.html)). Lingo was tested on one Fire TV Stick.
  The APKs carry code for `armeabi-v7a` and `arm64-v8a`.
  Devices with **Vega OS** can't install APKs, so this guide doesn't apply to them.
- The Fire TV remote. Rewind and Fast-forward buttons are handy but not required.
- Internet on the Fire TV. The app talks to a server on AWS (Frankfurt) and streams video from Amazon CloudFront.
- Optional: a phone with a camera and a web browser (tested with Chrome on Android). The phone does not need to be on the same Wi-Fi as
  the TV.
- Some free space on the Fire TV: each APK is about 49 MB, and the installed app needs more than that.

## Which app to install

Both apps are on the latest release page, [fire-tv-judging-2](https://github.com/moiz-lakkadkutta/lingo/releases/latest). They can be
installed side by side.

| File | Name on the Fire TV | Package | Lingo Plus | Download link |
|---|---|---|---|---|
| `lingo-demo.apk` | Lingo Plus Demo | `dev.moizp.lingo.demo` | On for everyone | https://github.com/moiz-lakkadkutta/lingo/releases/latest/download/lingo-demo.apk |
| `lingo-iap.apk` | Lingo | `dev.moizp.lingo` | Bought through the Amazon Appstore (see [Lingo Plus](#lingo-plus)) | https://github.com/moiz-lakkadkutta/lingo/releases/latest/download/lingo-iap.apk |

**Start with `lingo-demo.apk`.** It shows every feature. Install `lingo-iap.apk` as well if you want to see the free version: the daily
save limit and the Plus offers.

Both are release builds (everything is inside the APK) signed with a debug key, not apps from the Appstore. That is why the Fire TV
needs your permission to install them.

## Install with Downloader

Downloader is a free app by AFTVnews in the Amazon Appstore. It downloads and opens an APK from a web address.

1. On the Fire TV home screen, open **Find** → **Search**, type `Downloader`, select the orange Downloader app and choose **Get** (or
   **Download**).
2. Turn on Developer options, if you don't see them yet: **Settings** → **My Fire TV**. If there is no **Developer options** entry, open
   **About** and press Select on the first entry (your device's name) 7 times, then go back. Amazon's docs describe this as clicking 7 times
   on Settings → My Fire TV → About
   ([Amazon: connect to Fire TV through adb](https://developer.amazon.com/docs/fire-tv/connecting-adb-to-device.html)).
3. Allow Downloader to install apps: **Settings** → **My Fire TV** → **Developer options** → **Install unknown apps** → turn **Downloader**
   on. On Fire OS 6 and older the entry is a single switch called **Apps from Unknown Sources**; turn it on.
4. Open Downloader. Allow access to files if it asks.
5. In the address box on Downloader's Home tab, type this address and select **Go**:

   ```
   https://github.com/moiz-lakkadkutta/lingo/releases/latest/download/lingo-demo.apk
   ```

   For the other app, use the same address with `lingo-iap.apk` at the end. The address is long to type with the remote; it is the
   shortest stable link there is (we don't use a link shortener). Each file is about 49 MB.
6. When the download finishes, the Android installer opens. Select **Install**, then **Open** (or **Done** and open it later from
   **Your Apps & Channels**).
7. Downloader then offers to delete the APK file. Select **Delete** to free the space; the app stays installed.

## Install with adb

For people who already use adb:

1. On the Fire TV: **Settings** → **My Fire TV** → **Developer options** → turn on **ADB debugging**.
2. Find the TV's IP address: **Settings** → **My Fire TV** → **About** → **Network**.
3. On your computer:

   ```sh
   curl -LO https://github.com/moiz-lakkadkutta/lingo/releases/latest/download/lingo-demo.apk
   adb connect <tv-ip>:5555
   adb install -r lingo-demo.apk
   ```

   Accept the debugging prompt on the TV the first time. Start the app from **Your Apps & Channels**, or with
   `adb shell monkey -p dev.moizp.lingo.demo 1`.

## First launch

1. Open **Lingo Plus Demo**. You see "Loading", then the first-run screens.
2. **"I'm learning"**: choose **Deutsch** or **English**.
3. **"I speak"**: the other language is offered (German clips come with English lines, English clips with German lines). Select
   **Continue**.
4. **"A quick check of your level"**: six short lines, each with **Yes**, **Mostly** or **No**. For the tour, select
   **"Skip · start at about A2"**.
   - **English** has clips at A2, so Home is full at this level.
   - **Deutsch**: five of the six German clips are about B2, so at A2 Home shows a single German clip. After first run, open
     **Settings** → **Level** and press Right once to **about B1**: Home then shows a B1 clip under "Just right for you" and the B2
     clips under "A bit harder".
5. **"Pair your phone for quizzes?"**: a QR code, a six-character code and the line "Scan the code with your phone, or open the Lingo
   phone page and type it." Pair now ([step 2 of the tour](#a-15-minute-test-tour)) or select **Later**.

You land on Home. The app remembers you on this TV through a random install id; there is no account.

## A 15-minute test tour

Each step says what to press and what you should see. Labels in quotes are the app's own words.

### TV and phone

1. **Home.** At the top is a featured clip with **Watch** (or **Resume from …**), **"Words you'll meet"** and **"Your words"**. Below
   are rows such as "Continue", "Just right for you · about B1" and "A bit harder · about B2" (the levels follow yours). Press Left to
   open the menu on the left: **Watch**, **Review**, **Words**, **Plus**, **Settings**. Focus is shown by an outline and a slight zoom;
   the menu marks the screen you are on with a bar and a darker fill, not an outline.
2. **Pair your phone.** On the pairing screen (first run, or **Settings** → **Pair phone**), point your phone's camera app at the QR code
   and open the link. A web page opens and joins by itself; on the phone you see "Connected to your TV", on the TV a check mark and
   "… connected" (for example "Your phone connected"), and the button changes to **Start watching** (first run) or **Continue**.
   No camera app? Open https://phone-demo-51-102-187-91.sslip.io on the phone (for the "Lingo" app:
   https://phone-iap-51-102-187-91.sslip.io), type the six characters shown on the TV and tap **Join**.
3. **Open a clip.** Select a clip card (or **"Words you'll meet"** on the featured clip). The clip page shows the title, the level
   ("about A2") and length, the marked words under **"WORDS YOU'LL MEET"**, and the buttons **Watch** and **Watch in Challenge mode**
   (plus **Add to Continue** for a clip you haven't started).
4. **Watch.** Select **Watch**. The video plays with two subtitle lines: your own language, smaller, on top, and below it the
   language you learn, large and bright. One or two words per line are marked.
5. **Move between lines.** Press Right (or Fast-forward) to jump to the next line, Left (or Rewind) to go back to the start of the line.
   Hold Left for half a second to replay the line. A hint "‹ › previous or next line" and a progress strip show for a few seconds.
6. **Pause and explain.** Press Select (or Play/Pause). The video pauses and a card opens above the subtitles: the marked word, its
   dictionary form, a chip like "rank 1234 · about B1", the meaning, a grammar note and the whole line as the example. Buttons:
   **Save word**, **Replay**, **Slower**.
7. **Other words in the line.** If the line has more than one marked word, the hint reads "Up, then ‹ › for other words · Back to
   continue watching". Press Up to move into the subtitle line, Left/Right to pick another word (the card follows), Down to return to
   the buttons.
8. **Save a word.** Select **Save word**. The button reads "Saved to Words" and the card says "Saved. 1 word this clip." On the
   paired phone the word appears in the **Live** tab within about a second. Tap it on the phone to see its meaning; tap **Hear it** to
   hear it with the phone's own voice.
9. **Replay and slower.** Select **Replay**: the card closes, the line plays again and the video keeps playing (it doesn't pause
   again). Pause again and select **Slower**: playback runs at 0.75× and the status line at the bottom left shows "0.75×". Select
   **Normal speed** to go back.
10. **Continue watching.** Press Back or Play/Pause to close the card and keep watching.
11. **Playback settings.** While the video plays, press Up. A **Playback** panel opens with **Speed** (1× / 0.75×), **Native line**
    (Always / On pause / Never) and **Subtitle size** (100 % / 125 % / 150 %). Left/Right change the focused row; Back closes it.
12. **Challenge mode.** Press Back to leave the player (your place is kept: Home shows "Resume from …"). On the clip page select
    **Watch in Challenge mode**. Your own language's line is hidden and the status line says "Challenge". Press **Menu** (the button with
    three lines) to show it for the current line; press it again to hide it.
13. **End of the clip and TV quiz.** Watch a clip to the end (Right skips ahead line by line). The summary heading counts the new
    words you saved, in the language you learn (for example "2 neue Wörter"), with **Quiz on TV**, **Quiz on your phone** (when paired), **Watch again** and **Next clip**. Select **Quiz on TV**: questions
    are "What does it mean?" or "Fill the gap" with answer buttons, "Replay the line" for gap questions, and feedback such as
    "Right: …" or "The answer: …". The end shows "… of … right".
14. **Phone review.** Back on the summary select **Quiz on your phone**. The TV says "Quiz sent to your phone." and only then does
    the phone's **Live** tab offer **Quiz me now**. On the phone's **Review** tab, tap a card ("Tap to see the meaning"), then grade it **Again**, **Hard**, **Good** or **Easy**.
    The server schedules the next review (SM-2). When you finish, the phone shows "Done for today" and the TV summary shows
    "Phone quiz: … of … right."
15. **Phone progress.** On the phone's **Progress** tab you see "Day …", "Words known by level (approximate)" with a bar per level, clips
    watched and words due now or tomorrow.
16. **Words on the TV.** On the TV, open **Words** from the left menu (or **Your words** on Home). Left/Right switch between **All**,
    **Due today** and **Learned**. Select a word to play its line from the clip; Back closes the small player. **Review** in the menu
    opens the same list on "Due today".
17. **Settings.** Open **Settings**: **Learning language**, **I speak**, **Level**, **Native line**, **Pause at the end of each line**,
    **Subtitle size**, **Pair phone**, **Lingo Plus**, **About & attributions**. Left/Right change a value; you see "Saved.". Turn on
    **Pause at the end of each line** and the player stops briefly after each line. **About & attributions** lists the licences and the
    credit line of every one of the 12 clips, in both languages and at every level (it says "Loading the clip credits…" for a moment
    first).
18. **Plus screen.** Select **Plus** in the menu. In the demo app it says "Lingo Plus is on for everyone in this demo."

### Content

12 clips, 3–8 minutes each, all under open licences (CC BY, CC BY-SA or public domain; credits in **About & attributions**):

- German (Deutsch): four from Terra X (ZDF), among them "So trinken Bäume" and "Die wichtigsten Klimafaktoren", one from Jung & Naiv
  and one conversation from openHPI. *(6 clips)*
- English: Blender open movies (Sprite Fright, Cosmos Laundromat, Elephants Dream) and 1940s–50s public-domain films (Shy Guy, What to Do
  on a Date, Duck and Cover). *(6 clips)*

Home shows only clips in the language you learn. Switch it in **Settings** → **Learning language** to see the others.

## Remote cheat sheet

| Where | Button | What it does |
|---|---|---|
| Everywhere | D-pad (Up, Down, Left, Right) | Move focus |
| Everywhere | Select (centre) | Open or press the focused item |
| Everywhere | Back | Go back one screen; on Home it leaves the app |
| Home | Left | Open the menu: Watch, Review, Words, Plus, Settings |
| Player, playing | Select or Play/Pause | Pause and open the explain card |
| Player, playing | Right or Fast-forward | Next line |
| Player, playing | Left or Rewind | Start of this line (pressed again within a second: the line before) |
| Player, playing | Hold Left | Replay this line |
| Player, playing | Up | Playback panel: Speed, Native line, Subtitle size (Left/Right change, Back closes) |
| Player | Menu (three lines) | Show or hide your own language's line for the current line (useful in Challenge mode) |
| Player, playing | Back | Leave the player; your place is kept |
| Explain card | Left/Right | Move between Save word, Replay, Slower |
| Explain card | Up, then Left/Right | Pick another marked word in the line; Down returns to the buttons |
| Explain card | Back or Play/Pause | Close the card and continue watching |
| Words | Left/Right | All · Due today · Learned |
| Words | Select | Play the word's line |
| Settings | Left/Right | Change the focused value |

## Lingo Plus

Lingo Plus adds Challenge mode, unlimited saved words and slower playback at 0.75×. The free version saves 20 words a day.

- **Lingo Plus Demo** (`lingo-demo.apk`): Plus is on for everyone. Use it to try all features.
- **Lingo** (`lingo-iap.apk`): Plus is a monthly subscription bought through the Amazon Appstore. Without it you see the free version:
  **"Challenge mode · Plus"** on the clip page, **"Slower · Plus"** on the explain card, and after 20 saves in a day the card says
  "That's 20 today. Lingo Plus removes the limit." with a **See Lingo Plus** button. With Amazon App Tester set up, the Plus screen
  shows the price with **Subscribe** and **Restore purchase**.

On a sideloaded copy, buying Lingo Plus only works with Amazon App Tester installed on the Fire TV: the purchase belongs to the
Amazon Appstore, and the server checks each receipt with Amazon's test service (the RVS sandbox). Without App Tester, the Plus screen
says "Checking Lingo Plus…" for several seconds, then "Price unavailable right now." with **Restore purchase** and **Back**, and no
**Subscribe**. That is expected. To try the Plus features, use the demo app.
You are not charged for anything in either app.

## Troubleshooting

| What you see | What to do |
|---|---|
| Downloader is missing from **Install unknown apps** | Install Downloader first, then open the list again. A Fire OS bug sometimes shows the list before it is complete: leave the screen, wait a few seconds and open it again, or restart the Fire TV. |
| "Install blocked" or the installer doesn't open | Turn on **Install unknown apps** → **Downloader** (or **Apps from Unknown Sources**), as in [step 3](#install-with-downloader). |
| "App not installed", or adb says `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | An earlier Lingo build with a different signature is installed. Uninstall it ([Uninstall](#uninstall)), then install again. |
| "There was a problem parsing the package" | The download is incomplete. Delete the file in Downloader and download it again (about 49 MB). |
| A red screen "Unable to load script" that mentions Metro | That is an old development build, not one of these release builds. Uninstall it and install from the [release page](https://github.com/moiz-lakkadkutta/lingo/releases/latest). |
| "Can't reach Lingo. Check the network and press Select to retry." | Check the Fire TV's internet connection, then select **Try again**. If it stays, check the server (last row). |
| Black screen or no video in the player | Check the internet connection, press Back and open the clip again. The video comes from Amazon CloudFront; a very slow connection can take a few seconds to start. |
| The phone page doesn't open from the QR code | Open the phone page by hand (https://phone-demo-51-102-187-91.sslip.io for Lingo Plus Demo, https://phone-iap-51-102-187-91.sslip.io for Lingo) and type the six-character code from the TV. |
| "No TV with that code. Check the code on the TV." | The code belongs to the other app's server, or it changed. Use the phone page that matches the TV app (see above) and the code currently on the TV. Codes use letters and the digits 2–9, never 0, O, 1 or I. |
| "Can't reach Lingo. Check that the phone is on the same Wi-Fi." | With these servers, same Wi-Fi isn't needed; the phone needs internet. Reload the page, and check the server (last row). |
| "That's 20 today. Lingo Plus removes the limit." | That is the free limit in the "Lingo" app. Use **Lingo Plus Demo**, or save more words the next day. |
| "Lingo Plus isn't available on this device yet." or "Price unavailable right now." | The Appstore purchase isn't available to this sideloaded copy. Use **Lingo Plus Demo** for the Plus features. |
| Home shows only one German clip | At about A2 there is one German clip; the others are about B2. Set **Settings** → **Level** to about B1 (see [First launch](#first-launch)), or learn English. |
| The first Left on Home after coming back from a clip page doesn't open the menu | A known issue on Fire OS: press Left again. |
| Almost every word is marked | Your level is very low (about A1). Set **Settings** → **Level** to A2 or higher. |
| Is the server up? | On any computer: `curl https://demo-51-102-187-91.sslip.io/health` (or open it in a browser) should return `{"success":true,"data":{"ok":true,"service":"lingo-api"}}`. For the "Lingo" app use `https://iap-51-102-187-91.sslip.io/health`. If it doesn't, [open an issue](#report-a-problem). |

## Uninstall

On the Fire TV: **Settings** → **Applications** → **Manage Installed Applications** → **Lingo Plus Demo** (or **Lingo**) →
**Uninstall**. To start fresh without uninstalling, choose **Clear data** instead. With adb: `adb uninstall dev.moizp.lingo.demo` or
`adb uninstall dev.moizp.lingo`.

## Privacy

No account, no ads, no analytics. The server keeps your settings, saved words and review schedule under a random install id, on AWS in
Frankfurt, for the judging period only. Details: [docs/privacy.md](privacy.md).

## Report a problem

Open an issue at https://github.com/moiz-lakkadkutta/lingo/issues. Mention your Fire TV model and Fire OS version
(**Settings** → **My Fire TV** → **About**), which app you used, and what you pressed and saw. Don't post anything personal.
