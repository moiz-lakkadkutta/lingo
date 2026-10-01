# Lingo: demo video script

The shot-by-shot plan for the Lingo demo video (ticket LING-009): what each shot shows, what is said, what is true today, and what to do when a feature is not ready.

Status as of 2026-10-01; re-check §1 of docs/plans/LING-009.md before the shoot (Oct 15 freeze, Oct 16–18 shoot).
Voice-over word count: 230 words on the "if built" path, 223 on the all-fallback path (budget ≤ 380 at 2:45; counted from §3).
Placeholders follow docs/plans/LING-009.md §1.1; `grep -n "PLACEHOLDER" docs/video-script.md` lists every one. None may remain on Oct 21.

## 1. Hard limits and must-shows

- Runtime **< 3:00** (rules: "<3 minute demo video", https://amazonappdev2026.devpost.com/rules). Target cut **2:40–2:55**. This script is timed at **2:45**.
- Must show (runbook §9, ticket):
  - the app working on the real device (Fire TV Stick, filmed);
  - a moment of Fire OS and a moment of Vega, or, if Lingo does not run on Vega, the honest label of S08's fallback;
  - at least two tripod camera shots (runbook §10 note), in practice S01, S05 and S09;
  - **the save moment with both screens in one frame** (S05, the ticket's shot).
- Device legend, used in every row:
  - **FOS** = Fire TV Stick (Fire OS), filmed on a tripod.
  - **FOS-cap** = clean capture of the stick (`adb shell screenrecord`), used only as an insert.
  - **VVD** = Vega Virtual Device screen recording, always captioned "Vega Virtual Device".
  - **PH** = phone, filmed in frame.
  - **PH-cap** = phone screen recording (B-roll), always captioned "Phone screen recording".
  - **GFX** = diagram or title card made in the editor.
- Voice-over budget: about 150 words per minute → ≤ 380 words at 2:45. The script is about 230 words, which leaves room for pauses and for the uninterrupted S05 moment.
- On-screen captions: the whole voice-over is burnt in as English captions, following Lingo's own cue rules: ≤ 42 characters per line, ≤ 2 lines, ≤ 20 characters per second. Source footnotes (¹ ² ³) appear as a small caption line at the bottom of the frame while the number is spoken.
- Clip footage: every shot that shows clip video carries the clip's attribution string from docs/content.md, verbatim, as a lower caption on its first appearance, and again on the end card, with the change note "Excerpt, trimmed; subtitles and glosses added by Lingo." (CC BY requires attribution and an indication of changes; docs/content.md §5).
- Music: none, or CC0 only, named on the end card. No commercial music (Content ID risk on YouTube).
- Wording: decision 0002 applies to the voice-over and captions (docs/decisions/0002-wording.md). Levels are always "about A2" / "approximate". Feedback copy shows the right answer. No claim of a feature whose Status below is not Built or Code done, unless the take shows it working.

## 2. Demo clip and demo state

- **Primary demo clip:** `terra-x-so-trinken-baeume`, "So trinken Bäume (Terra X)", A2–B1 (approx.), CC BY 4.0 (docs/content.md §2 row 6), if LING-008 has prepared it by Oct 15.
  Its credit line is cut off in docs/content.md (footnote g5, "… Jochen …"). Copy the full line from the ZDF clip page before the shoot:
  https://www.zdf.de/dokumentation/terra-x/so-trinken-baeume-creative-commons-clip-100.html
  `[PLACEHOLDER: full attribution string for terra-x-so-trinken-baeume · owner Moiz · due Oct 15 · ticket LING-008]`
- **Fallback clip:** `terra-x-friedlaender`, "Interview mit Holocaust-Überlebender Margot Friedländer (Terra X)", B1 (approx.), CC BY 4.0, already prepared (Gate A).
  Attribution (verbatim): "ZDF/TerraX/Leonie Schöler/Julia Geiß/Michael Fandel/Benjamin Leng/Margot Friedländer Zeitzeugin/Maximilian Mohr — CC BY 4.0".
  Editorial note (docs/content.md §6): this is a Holocaust survivor's testimony. Choose a segment and a save word that are neutral (no Theresienstadt-specific vocabulary as the saved word) and keep the tone plain.
- **Clip used on the day:** `[PLACEHOLDER: demo clip slug (so-trinken-baeume or friedlaender) · owner Orchestrator · due Oct 15 · ticket LING-008]`
- **Save word:** chosen from that clip's `clip.json` highlights, and only a word whose gloss passed the spot check (docs/spot-checks/). Do not invent one.
  `[PLACEHOLDER: save word, cue index and cue timecode · owner Moiz · due Oct 16 · ticket LING-009]`
- **Learner state before each take:**
  - fresh learner (new `x-device-id`, or a DB reset);
  - level A2, learning `de`, native `en`;
  - phone paired;
  - zero saves today, so the free-tier line "That's 20 today. Lingo Plus removes the limit." cannot appear by accident;
  - Plus off until shot S07b.

## 3. Shot-by-shot script (2:45)

Status words (plan §1): **Built** = code on the branch, tests pass · **Code done, not on device** = built but not yet run on the stick or VVD · **Planned / Not built** = ticket open, nothing on the branch. A shot with an unbuilt feature carries an "if built" voice-over and a fallback voice-over. The fallback never names the unbuilt feature.

| # | Time | Dur | Device / camera | On-screen action | Voice-over | Caption (burnt in) | Status | Fallback |
|---|---|---|---|---|---|---|---|---|
| S01 | 0:00–0:15 | 15 s | Tripod 1, wide: sofa, TV (FOS, Lingo Home), phone on the sofa arm, remote in hand | Lingo Home on the TV; a slow push-in is fine, no zoom | "You already watch more than an hour of TV a day.¹ Lingo turns it into your German lesson." | VO captions. Footnote line: ¹ "AGF Videoforschung, TV year 2024: 79 min a day, ages 14–49" | Home: Code done, not on device (LING-005) | If Home is not finished: open on the Player paused on a cue (S03 framing). Same voice-over |
| S02 | 0:15–0:35 | 20 s | Tripod 1, medium; remote and hand in frame | **If Content Launcher works:** voice search for the clip title → Lingo appears in the results → opens on the Clip page. **Otherwise:** Fire TV home → Lingo tile → Lingo Home → hero "Watch" focused (focus outline and 1.04 scale visible) → Select | If built: "Ask for a clip by voice, and Lingo opens it." Fallback: "Lingo sits on the Fire TV home screen. One press, and today's clip at your level is playing." | VO captions. The level chip reads "about A2" (levels are approximate CEFR, decision 0002) | Content Launcher: **Not built** (LING-007; kit Fire OS binding is a runtime no-op) | Fallback action and voice-over in the cells to the left. Never say "search" or "Alexa" unless the take shows it working |
| S03 | 0:35–0:50 | 15 s | Tripod 2, tight on the TV, cues legible | Player running: German line 44 px, bright; English line 32 px, cooler, above it; one marker word | "Two subtitle lines: German, large and bright; English, small and quiet. The marked word is the one worth learning at your level." | VO captions + clip attribution (verbatim from docs/content.md) + change note | Code done, not on device (LING-003; spikes S1/S2 pending) | FOS-cap insert of the same moment if the camera image of the cues is soft. The real device must still appear on camera in S01 and S05 |
| S04 | 0:50–1:05 | 15 s | Tripod 2 | Press Select → video pauses on the cue → Explain card: word · lemma · "rank N · about B1" chip, gloss, grammar note, the cue as example; actions Save word / Replay / Slower | "Pause on any line. Lingo explains the marked word: what it means, one grammar note, and the line itself as the example." | VO captions | Code done, not on device (LING-003); gloss quality depends on Gate C, not yet passing (LING-002) | Pick a save word whose gloss is spot-checked (§2, F5). FOS-cap insert if the card is soft on camera |
| **S05** | 1:05–1:20 | 15 s | **Tripod 3: both screens in one frame.** TV fills the upper two thirds; phone on a small stand in the lower-right foreground, Live screen, brightness matched to the TV. **One continuous take, no cut** between the press and the phone | Focus on "Save word" → Select → the TV shows the saved state ("Saved. …") → within a second the marker chip appears on the phone's Live list | "Save it, and it's on your phone a second later." | None during the moment: let it breathe. (The VO line runs before the press.) | Socket path **Built** (< 1 s p95, decision 0005, `apps/api/test/realtime.test.ts`); Explain Save UI Code done, not on device (LING-003); phone Live list partly built (LING-006) | See §5 F1. Never fake the timing: if the phone is composited, caption "Phone screen recorded in the same take" and keep the real delay. Before the shoot, the saved line must read correctly for n = 1 (risk R3, §5) |
| S06 | 1:20–1:35 | 15 s | Tripod 3, then PH close-up | Clip ends → Summary "N neue Wörter" with chips → focus "Quiz on your phone" → the phone flips a card, taps Good → **if built:** the TV shows the score | If built: "At the end, a two-minute quiz on your phone. Tomorrow it asks again, spaced further out each time you get it right." Fallback: "At the end, a two-minute quiz, on the TV or on your phone. Tomorrow it asks again, spaced further out each time you get it right." | VO captions + "Spacing: SM-2, as in Anki" (no number) | Summary: Code done (LING-005); phone quiz deck: Built, no EAS build yet (LING-006); **score on the TV: Not built** (`quiz:result` is relayed by `apps/api/src/sockets.ts:49` but the phone never emits it and the TV never shows it) | If the TV score is not built: end on the phone's last card, then cut to the TV Quiz screen ("8 of 10 right") taken from the **TV quiz**, with the fallback voice-over |
| S07a | 1:35–1:55 | 20 s | GFX over FOS-cap, or a terminal capture of `pnpm pipeline prepare` step timings | Diagram builds left to right: Transcribe → segment (42 chars × 2, 20 cps) → Translate → lemmatize + frequency rank → highlights → Nova Lite glosses & quiz → Shaka Packager → S3 + CloudFront | "Amazon Transcribe writes the German line with word timings, and Amazon Translate the English one. Every line is cut to subtitle reading limits.² Amazon Nova Lite on Bedrock writes the glosses and the quiz." | VO captions. Footnote line: ² "Netflix Timed Text Style Guide: 42 characters per line, 20 characters per second" | **Built** (Gate A passed on two real clips, decision 0001; `packages/pipeline/src/*`; `infra/`) | — |
| S07b | 1:55–1:57 | **2 s** | FOS-cap, or tripod 2 | Plus screen ("Challenge mode, unlimited saved words, slower playback.", price, Subscribe) → Amazon App Tester purchase dialog | (VO continues across the cut) If built: "Lingo Plus is a subscription through Amazon's in-app purchasing, shown here in sandbox." Fallback: no Plus sentence | "Amazon Appstore IAP · sandbox (App Tester)" | **Client IAP: Not built** (LING-007); server receipt check against RVS sandbox Built (`apps/api/src/routes/iap.ts`) | If the client flow is not built: cut S07b and drop the Plus sentence; give the 2 s to S07a. If the sandbox is flaky (PLAN §14): show the Plus screen and the App Tester dialog only; never show a "purchased" state that did not happen |
| S07c | 1:57–2:05 | 8 s | FOS-cap | Back to Home: the Continue row shows the clip with its resume position | **Only if built:** "Your place in each clip is kept, through Fire TV Personalization." Fallback: no voice-over | VO captions if built | Personalization: **Not built** (LING-007; kit no-op on both OSes; no `PUT /me/progress` route yet) | Without it, hold the S07a diagram on its last node and say nothing about resume |
| S08 | 2:05–2:30 | 25 s | Split screen: left FOS (tripod 1 frame), right VVD capture; then GFX repo map | Same Home screen on both halves. Then a card listing: vega-media-kit (MIT, npm), `packages/shared-ui`, `infra/` (CDK), `docs/friction/` (N logs) | If built: "Lingo shares vega-media-kit, our open-source player and subtitle library, with our other entry, Described. One UI package targets Fire OS and Vega. The AWS stack is CDK, and every rough edge we hit is a friction log in the repo." Fallback: "Lingo shares vega-media-kit, our open-source player and subtitle library, with our other entry, Described. One UI package, written for Fire OS and Vega; Vega support is experimental. The AWS stack is CDK, and every rough edge we hit is a friction log in the repo." | Right half captioned "Vega Virtual Device". Friction count N = `ls docs/friction/*.md` minus README (10 on 2026-10-01) | Vega app: **Not created** (LING-008; `apps/vega` holds templates only); kit Vega adapter experimental, not device-verified | See §5 F3. If no Lingo screen runs on the VVD, show no VVD: use the fallback voice-over over the code layout (`apps/expo`, `apps/vega`, `packages/shared-ui`) |
| S09 | 2:30–2:45 | 15 s | Tripod 1 wide, morning light; PH close-up of a review card | The phone review the next morning; end card | "Lingo is for adults learning German or English at home, like the 363,466 people who started an integration course in Germany in 2024.³ Next: more languages, through Translate." | Footnote line: ³ "BAMF, Integrationskursgeschäftsstatistik 2024". End card: repo URL https://github.com/moiz-lakkadkutta/lingo, MIT, "Built for Build, Ship, Shape: Amazon Developer Hackathon", clip attribution(s) with change note, music credit if any | Built (copy only) | — |

Footnote sources (also in docs/submission.md, Sources):
¹ AGF Videoforschung press release, 2025-01-08: https://www.agf.de/fileadmin/agf/service/Pressemitteilungen/2025/250108_PM_Jahresbilanz_2024/250108_AGF_PM_TV_Jahresbilanz_2024.pdf
² Netflix English (USA) Timed Text Style Guide: https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide
³ BAMF, Bericht zur Integrationskursgeschäftsstatistik für das Jahr 2024: https://www.bamf.de/SharedDocs/Anlagen/DE/Statistik/Integrationskurszahlen/Bundesweit/2024-integrationskursgeschaeftsstatistik-gesamt_bund.pdf?__blob=publicationFile&v=2

Per-shot decision on Oct 8 (kill date): for each row with a Not built feature, the Orchestrator asks Moiz once whether the take will use the feature or the fallback, and records the answer here.

| Shot | Feature | Decision (if built / fallback) |
|---|---|---|
| S02 | Content Launcher | `[PLACEHOLDER: S02 decision · owner Orchestrator · due Oct 8 · ticket LING-007]` |
| S06 | Quiz score on the TV | `[PLACEHOLDER: S06 decision · owner Orchestrator · due Oct 8 · ticket LING-006]` |
| S07b | Client IAP | `[PLACEHOLDER: S07b decision · owner Orchestrator · due Oct 8 · ticket LING-007]` |
| S07c | Personalization | `[PLACEHOLDER: S07c decision · owner Orchestrator · due Oct 8 · ticket LING-007]` |
| S08 | Lingo on the VVD | `[PLACEHOLDER: S08 decision · owner Orchestrator · due Oct 8 · ticket LING-008]` |

## 4. Shot list (one row per physical setup)

The shoot is three tripod positions plus captures.

| Setup | Shots | Camera | Notes |
|---|---|---|---|
| Tripod 1 (wide: sofa + TV + phone + remote) | S01, S02, S08 left, S09 | Phone or camera at sofa height, 1080p, 25 fps, shutter 1/50 (50 Hz mains, avoids TV flicker) | Remote and hand visible in S02 |
| Tripod 2 (tight on the TV) | S03, S04, S07b (alt) | Same settings, manual focus on the screen, exposure locked to the TV | Cues must be readable at 1080p; check one test frame before the take |
| Tripod 3 (TV + phone in one frame) | S05, S06 | Slightly above eye level; phone on a stand angled to the lens; phone brightness ~70 %; TV picture mode "Standard" | The ticket's shot. Three good takes minimum |
| FOS-cap | Inserts for S03, S04, S07, S08 | `adb shell screenrecord --bit-rate 8000000 /sdcard/s.mp4` (stops at 180 s), then `adb pull /sdcard/s.mp4` | Inserts only; the device must also appear on camera |
| PH-cap | B-roll for S05, S06 | Android built-in screen recorder, or iOS Control Center recording | Captioned "Phone screen recording" whenever used |
| VVD | S08 right | macOS screen recording of the VVD window | Captioned "Vega Virtual Device" |
| Voice-over | All | Separate quiet recording, one take per row, then edit | Read from §3 |

## 5. Recording checklist with fallbacks

### Pre-shoot (Oct 16–18, owner Moiz)

- [ ] Stick and phone on the same Wi-Fi as the API host; API running and reachable from both (`curl http://<host>:4000/health` from a laptop on that Wi-Fi).
- [ ] Demo clip published and playable on the stick (§2).
- [ ] Learner reset (§2): new `x-device-id` or DB reset; level A2, `de`/`en`; zero saves today; Plus off.
- [ ] Phone app installed (EAS dev build or Expo Go) and paired; the TV shows "<name>'s phone connected".
- [ ] If S07b is in: Amazon App Tester installed on the stick and `apps/expo/amazon.sdktester.json` copied to `/sdcard/` (README step 4).
- [ ] The saved line reads correctly for one word (risk R3: `packages/shared-ui/src/strings.ts` `explain.saved(1)` renders "Saved. 1 words this clip."). Fix owner: LING-005 implementer, before Oct 15. `[PLACEHOLDER: R3 plural fix confirmed · owner LING-005 implementer · due Oct 15 · ticket LING-005]`
- [ ] Save word gloss passed the spot check (risk R4, Gate C not yet passing).
- [ ] Phone: Do Not Disturb on, notifications off, auto-lock off, battery > 80 %.
- [ ] TV: screensaver off; picture mode "Standard".
- [ ] Tripods level (spirit level); one test frame per setup checked on a laptop for cue legibility.

### Fallbacks (each with its trigger)

- **F1 · the two-device save does not work on the day** (no chip within ~2 s, or the phone loses the room): re-pair and retry once. If it still does not work, film the TV on tripod 3 and record PH-cap in the same take, then composite the phone recording into the phone's position with the caption "Phone screen recorded in the same take". Never shorten the real delay. Log a friction entry (`pnpm friction "<title>"`).
- **F2 · the stick misbehaves** (crash, no remote events, spike S1 still open): use FOS-cap for the UI and keep at least two tripod shots of the real stick running (S01, S05). If no stick is available at all: write that here and escalate to the Orchestrator; do not substitute an emulator without a caption naming it.
- **F3 · Vega:** if a Lingo screen runs on the VVD, use it, captioned "Vega Virtual Device". If not, use S08's fallback. The definition of done allows "documents exactly why Vega is experimental" (runbook §9); docs/submission-checklist.md links that note.
- **F4 · IAP sandbox flaky:** use the S07b fallback; turn the Plus feature flag off in the shoot build if needed (PLAN §14).
- **F5 · a gloss on screen is incorrect:** re-take with a different save word. Never show a gloss that did not pass the spot check.

### Edit and export (owner Moiz, Oct 19)

- [ ] Cut to 2:40–2:55.
- [ ] `ffprobe -v error -show_entries format=duration -of csv=p=0 lingo.mp4` prints a number < 180.
- [ ] 1080p, H.264.
- [ ] Captions burnt in, plus an `.srt` uploaded to YouTube.
- [ ] Loudness about −14 LUFS.
- [ ] Watch once with the sound off to check the captions.
- [ ] Reviewer (fable) watches the cut against the claims register in docs/submission.md §15: every spoken claim matches a Built or Code-done row, or the take shows it working.
- [ ] Upload Oct 20 (docs/submission-checklist.md). `[PLACEHOLDER: YouTube URL · owner Moiz · due Oct 20 · ticket LING-009]`

## 6. Open questions

- [QUESTION for Moiz: YouTube visibility. The runbook says "unlisted" in week 5 and "public" in its definition of done. The default is **public** unless the rules page (https://amazonappdev2026.devpost.com/rules) says otherwise. Confirm.]
