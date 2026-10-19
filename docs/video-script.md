# Lingo: demo video script

The shot-by-shot plan for the Lingo demo video (ticket LING-009): what each shot shows, what is said, what is true today, and what to do when a feature is not ready.

Status as of 2026-10-01; re-check §1 of docs/plans/LING-009.md before the shoot (Oct 15 freeze, Oct 16–18 shoot).
Updated 2026-10-19: the full device run passed (docs/spot-checks/2026-10-14-device-run.md, run on device 2026-10-15..18, all rows passed (reported by Moiz 2026-10-19)); the video was filmed with the save words of §2 (registrieren, Konsulat), and is not cut or uploaded yet (reported by Moiz 2026-10-19).
Updated 2026-10-14: the five shot decisions are recorded (§3, decided by the user), the script is re-cut to the 2:45 cold open (the save moment first), the demo clip is `terra-x-friedlaender`, and the shoot schedule is in §4.
Voice-over word count: 260 words on the decided path, 247 if S07b is cut (budget ≤ 380 at 2:45; counted from §3 on 2026-10-14).
Placeholders follow docs/plans/LING-009.md §1.1; since 2026-10-15 the open items only Moiz can supply are `<!-- HUMAN: ... -->` notes, and `grep -n "PLACEHOLDER\|HUMAN:" docs/video-script.md` lists every one. None may remain on Oct 21.

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
- Voice-over budget: about 150 words per minute → ≤ 380 words at 2:45. The script is about 260 words, which leaves room for pauses and for the uninterrupted S05 moment.
- On-screen captions: the whole voice-over is burnt in as English captions, following Lingo's own cue rules: ≤ 42 characters per line, ≤ 2 lines, ≤ 20 characters per second. Source footnotes (¹ ² ³) appear as a small caption line at the bottom of the frame while the number is spoken.
- Clip footage: every shot that shows clip video carries the clip's attribution string from docs/content.md, verbatim, as a lower caption on its first appearance, and again on the end card, with the change note "Excerpt, trimmed; subtitles and glosses added by Lingo." (CC BY requires attribution and an indication of changes; docs/content.md §5).
- Music: none, or CC0 only, named on the end card. No commercial music (Content ID risk on YouTube).
- Wording: decision 0002 applies to the voice-over and captions (docs/decisions/0002-wording.md). Levels are always "about A2" / "approximate". Feedback copy shows the right answer. No claim of a feature whose Status below is not Built or Code done, unless the take shows it working.

## 2. Demo clip and demo state

- **Demo clip (decided 2026-10-14, by the user):** `terra-x-friedlaender`, "Interview mit Holocaust-Überlebender Margot Friedländer (Terra X)", B1 (approx.), CC BY 4.0, published 2026-10-14 (docs/content-status.md §Published: B1, 54 cues, 13 highlights, 6 quiz items; docs/content.md §2 row 3).
  Attribution (verbatim, as in docs/content.md row 3 and the local `Clip` row): "ZDF/TerraX/Leonie Schöler/Julia Geiß/Michael Fandel/Benjamin Leng/Margot Friedländer Zeitzeugin/Maximilian Mohr — CC BY 4.0".
  Editorial note (docs/content.md §6): this is a Holocaust survivor's testimony. Choose a segment and a save word that are neutral (no Theresienstadt-specific vocabulary as the saved word) and keep the tone plain.
- **Not used:** `terra-x-so-trinken-baeume`. It now rates about B2, not A2–B1 (docs/content-status.md §Published table), so the video makes no level claim for it.
- **Words (from the clip's own data, both gloss rows have status "ok" in the German Gate C sheet docs/spot-checks/2026-10-10-gate-c-de-r3.md (rows 5 and 6; Gate C passed 2026-10-10, decision 0001); same values in `packages/pipeline/work/terra-x-friedlaender/clip.json` and the local `Highlight` rows):**
  - S05 save word: **registrieren** (lemma registrieren, rank 4274), cue 9, 0:39.2–0:42.6, "Sie wollte sich für Amerika registrieren." / "She wanted to register for America."; gloss "to register"; grammar "verb: registrieren, registrierte, hat registriert".
  - S04 explained word (a different word, so the two shots do not repeat): **Konsulat** (lemma Konsulat, rank 9496), cue 11, 0:47.0–0:51.4, "aus Brasilien und sie zum / Konsulat gegangen ist," / "from Brazil and she went to the consulate"; gloss "consulate"; grammar "noun, das Konsulat, pl. Konsulate".
  - Both are neutral words. Every highlight of this clip is stored as band B2, so the rank chip reads "about B2"; at learner level A2 the floor is rank 2000 (`BANDS` in `packages/contracts/src/base.ts`, `highlightFloor` in `apps/api/src/routes/clips.ts`), so both words are marked.
  - Confirmed: both passed the device run (docs/spot-checks/2026-10-14-device-run.md rows 12 and 25), and the video was filmed with registrieren (cue 9, 0:39.2) and Konsulat (cue 11, 0:47.0) as planned (reported by Moiz 2026-10-19). F5 was not needed.
- **Learner state before each take:**
  - fresh learner (new `x-device-id`, or a DB reset);
  - level about A2, learning `de`, native `en` (the stick was found at about A1 on 2026-10-14: reset it, §5 pre-shoot);
  - phone paired;
  - zero saves today, so the free-tier line "That's 20 today. Lingo Plus removes the limit." cannot appear by accident;
  - Plus off until shot S07b.

## 3. Shot-by-shot script (2:45)

Status words (plan §1): **Built** = code on the branch, tests pass · **Code done, not on device** = built but not yet run on the stick or VVD · **Planned / Not built** = ticket open, nothing on the branch. Since 2026-10-19 a row may also read **run on device**: it passed the full Fire TV Stick device run (2026-10-15..18, reported by Moiz 2026-10-19). A shot with an unbuilt feature carries an "if built" voice-over and a fallback voice-over. The fallback never names the unbuilt feature.

Rows are in cut order (the 2:45 cold-open cut, approved 2026-10-14). Shot ids are unchanged, so references elsewhere (device run, checklist) still work: S05 moved to the cold open, S01 is the hook after it, S07c now comes before S07a, and S07d (the cost line) is new. Durations sum to 165 s = 2:45.

| # | Time | Dur | Device / camera | On-screen action | Voice-over | Caption (burnt in) | Status | Fallback |
|---|---|---|---|---|---|---|---|---|
| **S05** (cold open) | 0:00–0:20 | 20 s | **Tripod 3: both screens in one frame.** TV fills the upper two thirds; phone on a small stand in the lower-right foreground, Live screen, brightness matched to the TV. **One continuous take, no cut** between the card opening, the press and the phone | Player paused on cue 9 → Explain card open on **registrieren** (§2) → focus on "Save word" → Select → the TV shows the saved state ("Saved. …") → within a second the marker chip appears on the phone's Live list | Before the press: "Pause on a German line. Save the word, and it's on your phone a second later." Then silence | VO captions before the press, none during the moment: let it breathe. Clip attribution (verbatim, §2) + change note: this is the clip's first appearance | Socket path **Built** (< 1 s p95, decision 0005, `apps/api/test/realtime.test.ts`); Explain Save UI and phone Live list run on device 2026-10-15..18, all rows passed (reported by Moiz 2026-10-19) (LING-003, LING-006; no EAS build). Device run rows 22–25 (docs/spot-checks/2026-10-14-device-run.md) | See §5 F1. Never fake the timing: if the phone is composited, caption "Phone screen recorded in the same take" and keep the real delay. Before the shoot, the saved line must read correctly for n = 1 (risk R3, §5) |
| S01 (hook) | 0:20–0:30 | 10 s | Tripod 1, wide: sofa, TV (FOS, Lingo Home), phone on the sofa arm, remote in hand | Lingo Home on the TV; a slow push-in is fine, no zoom | "You already watch more than an hour of TV a day.¹ Lingo turns it into your German lesson." | VO captions. Footnote line: ¹ "AGF Videoforschung, TV year 2024: 79 min a day, ages 14–49" | Home: run on device 2026-10-15..18, all rows passed (reported by Moiz 2026-10-19) (LING-005; device run rows 11, 35) | If Home is not finished: open on the Player paused on a cue (S03 framing). Same voice-over |
| S02 | 0:30–0:45 | 15 s | Tripod 1, medium; remote and hand in frame | **Decided: fallback path.** Fire TV home → Lingo tile → Lingo Home → hero "Watch" focused (focus outline and 1.04 scale visible) → Select | "Lingo sits on the Fire TV home screen. One press, and today's clip at your level is playing." | VO captions. The level chip reads "about A2" (levels are approximate CEFR, decision 0002) | Lingo Home → Watch: device run row 11. Content Launcher: the Fire OS deep link `lingo://clip/<slug>` ran on the stick (device run row 47, reported by Moiz 2026-10-19; `apps/expo/LaunchBridge.tsx`); Vega launch handling code done, not on device (`apps/vega/src/platform/contentLauncher.ts`); **voice search: Not built** (Fire TV catalog not ingested; the kit's Fire OS binding is a runtime no-op), so it is not filmed | FOS-cap insert of the same path, same voice-over. Never say "search" or "Alexa" |
| S03 | 0:45–1:00 | 15 s | Tripod 2, tight on the TV, cues legible | Player running: German line 44 px, bright; English line 32 px, cooler, above it; one marker word | "Two subtitle lines: German, large and bright; English, small and quiet. The marked word is the one worth learning at your level." | VO captions + clip attribution (verbatim, §2) + change note | Run on device 2026-10-15..18, all rows passed (reported by Moiz 2026-10-19) (LING-003); device run row 11 | FOS-cap insert of the same moment if the camera image of the cues is soft. The real device must still appear on camera in S01 and S05 |
| S04 | 1:00–1:12 | 12 s | Tripod 2 | Press Select → video pauses on cue 11 → Explain card on **Konsulat** (a different word from S05; §2): word · lemma · "rank 9496 · about B2" chip, gloss "consulate", grammar note "noun, das Konsulat, pl. Konsulate", the cue as example; actions Save word / Replay / Slower | "Pause, and Lingo explains the marked word: what it means, and one grammar note." | VO captions | Run on device 2026-10-15..18, all rows passed (reported by Moiz 2026-10-19) (LING-003); gloss quality: Gate C passed 2026-10-10 (decision 0001); the word's own row is "ok" in docs/spot-checks/2026-10-10-gate-c-de-r3.md (row 6). Device run rows 12, 22 | If the gloss looks off on the TV, re-take with another "ok" word from the same sheet (F5). FOS-cap insert if the card is soft on camera |
| S06 | 1:12–1:30 | 18 s | Tripod 3, then PH close-up | Clip ends → Summary "N neue Wörter" with chips → focus "Quiz on your phone" → the phone flips a card, grades → "Sent to your TV" → the TV Summary shows the score (**decided: if-built path**) | "At the end, a two-minute quiz on your phone. Tomorrow it asks again, spaced further out each time you get it right." | VO captions + "Spacing: SM-2" (no number) | Summary, phone quiz deck and the score on the TV: run on device 2026-10-15..18, all rows passed (reported by Moiz 2026-10-19) (LING-005, LING-006; no EAS build; the phone emits `quiz:result` after the deck, `apps/phone/src/lib/link.ts`; `apps/api/src/sockets.ts` relays it; the TV Summary shows it, `packages/shared-ui/src/session/useSession.ts`). Device run rows 37–40 | If the score does not reach the TV on the day: end on the phone's last card, then cut to the TV Quiz screen (device run row 43) with the fallback voice-over "At the end, a two-minute quiz, on the TV or on your phone. Tomorrow it asks again, spaced further out each time you get it right." |
| S07c | 1:30–1:36 | 6 s | FOS-cap | Back to Home: the Continue row shows the clip with "Resume from m:ss" (**decided: partial**) | "Your place in each clip is kept." Never say "Personalization" | VO captions | Continue row with resume: run on device 2026-10-15..18, all rows passed (reported by Moiz 2026-10-19) (`PUT /me/progress`, `apps/api/src/routes/learning.ts`); device run rows 21, 36. **Fire TV Personalization: Not built** (the kit's `reportPlayback` is a no-op on both OSes, KIT-007), so it is never named | If the Continue row does not show the resume position: drop S07c and its line; hold the S07a diagram for the 6 s |
| S07a | 1:36–1:56 | 20 s | GFX over FOS-cap, or a terminal capture of `pnpm pipeline prepare` step timings | Diagram builds left to right: Transcribe → segment (42 chars × 2, 20 cps) → Translate → lemmatize + frequency rank → highlights → Nova Pro glosses → quiz built by code → Shaka Packager → S3 + CloudFront | "Amazon Transcribe writes the German line with word timings, and Amazon Translate the English one. Every line is cut to subtitle reading limits.² Amazon Nova Pro on Bedrock writes the glosses, and code builds the quiz from them." | VO captions. Footnote line: ² "Broadcast subtitle guidelines: 42 characters per line, 20 characters per second" (no brand name on screen) | **Built** (Gate A passed on two real clips; Gate C passed 2026-10-10 with Nova Pro v1, gloss prompt v7, quiz by code; decisions 0001, 0009; `packages/pipeline/src/*`; `infra/`) | — |
| S07d (cost line) | 1:56–2:04 | 8 s | GFX: the diagram's last node (S3 + CloudFront) held, with a cost label | Label "about 25 cents a clip (estimate)" | "Preparing a clip costs about 25 cents in AWS calls, so the same pipeline can run on licensed catalogues." | VO captions + "about 25 cents a clip (estimate)" | Estimate; Nova, Transcribe and Translate prices checked 2026-10-15. docs/aws.md "Cost per clip" table: ≈ $2.9 for the 12-clip batch, one native (≈ $0.24 a clip, rounded to "about 25 cents"; it read ≈ $3.9 and "about 35 cents" before Transcribe's current $0.006/min was checked). docs/content-status.md §Published: ≈ $5.21 spent so far, reruns and gate runs included; that is the project total, not the per-clip price, so the line says "estimate" and gives no exact figure | If the prices are checked before the VO session (docs/submission-checklist.md, Nova price check) and the estimate moves, change the number in this row, the VO and docs/submission.md §15 C39 together. If no number can be defended, drop S07d and give the 8 s to S08 |
| S07b | 2:04–2:06 | **2 s** | FOS-cap, or tripod 2 | Plus screen ("Challenge mode, unlimited saved words, slower playback.", price, Subscribe) → Amazon App Tester purchase dialog (**decided: attempt; the dialog only**) | (VO continues across the cut) "Lingo Plus is a subscription through Amazon's in-app purchasing, shown here in sandbox." | "Amazon Appstore IAP · sandbox (App Tester)" | Client IAP: a sandbox purchase completed in Amazon App Tester on the stick (device run §5, rows 30–34, reported by Moiz 2026-10-19; LING-007: `packages/shared-ui/src/plus/flow.ts`, `apps/expo/src/fireosStore.ts`); the shot still shows the purchase dialog only; server receipt check against RVS sandbox Built (`apps/api/src/routes/iap.ts`) | If the App Tester dialog does not appear by the end of Oct 17: cut S07b, drop the Plus sentence and give the 2 s to S08. Never show a "purchased" state. Demo mode (`LINGO_PLUS_MODE=demo`) is not Amazon IAP: never caption or voice it as IAP |
| S08 | 2:06–2:28 | 22 s | Split screen: left FOS (tripod 1 frame), right VVD capture (**decided: VVD Home, no video**); then GFX repo map | Lingo Home on both halves; no playback on the Vega half. Then a card listing: vega-media-kit (MIT, npm), `packages/shared-ui`, `infra/` (CDK), `docs/friction/` (N logs) | "Lingo shares vega-media-kit, our open-source player and subtitle library, with our other entry, Described. One UI package, written for Fire OS and Vega; Vega support is experimental. The AWS stack is CDK, and every rough edge we hit is a friction log in the repo." | Right half captioned "Vega Virtual Device". Friction count N = `ls docs/friction/*.md` minus README (36 on 2026-10-14; re-count before the GFX) | Vega app: Code done, not on device (experimental): runs on the Vega Virtual Device (SDK 0.24, 2026-10-14): Home, the rail, Clip and Words render with the live catalog; playback off on Vega, the Player says so on screen; no video until KIT-010 (docs/spikes/2026-10-14-vega-vvd.md: screenshots and `2026-10-14-vega-home-to-words.mp4`, 12 s, 1920×1080); kit Vega adapter experimental, not device-verified | See §5 F3. If no Lingo screen runs on the VVD by Oct 18: show no VVD; use the code-layout card (`apps/expo`, `apps/vega`, `packages/shared-ui`) with the same voice-over |
| S09 | 2:28–2:45 | 17 s | Tripod 1 wide, morning light; PH close-up of a review card | The phone review the next morning; end card | "Lingo is for adults learning German or English at home, like the 363,466 people who started an integration course in Germany in 2024.³ Next: more languages, through Translate." | Footnote line: ³ "BAMF, Integrationskursgeschäftsstatistik 2024". End card: repo URL https://github.com/moiz-lakkadkutta/lingo, MIT, "Built for Build, Ship, Shape: Amazon Developer Hackathon", clip attribution(s) with change note, music credit if any | Built (copy only); phone Progress: device run row 42 | — |

Footnote sources (also in docs/submission.md, Sources):
¹ AGF Videoforschung press release, 2025-01-08: https://www.agf.de/fileadmin/agf/service/Pressemitteilungen/2025/250108_PM_Jahresbilanz_2024/250108_AGF_PM_TV_Jahresbilanz_2024.pdf
² Timed text style guide, English (USA) (source for the 42 × 2 and 20 cps limits; cited here only, the on-screen footnote names no brand): https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide
⁴ (S07d, not shown as a footnote; the caption says "estimate") docs/aws.md "Cost per clip and for the 12-clip batch" (≈ $2.9 for 12 clips, one native; prices checked 2026-10-15) and docs/content-status.md §Published (≈ $5.21 spent so far, reruns included).
³ BAMF, Bericht zur Integrationskursgeschäftsstatistik für das Jahr 2024: https://www.bamf.de/SharedDocs/Anlagen/DE/Statistik/Integrationskurszahlen/Bundesweit/2024-integrationskursgeschaeftsstatistik-gesamt_bund.pdf?__blob=publicationFile&v=2

Per-shot decisions (planned for the Oct 8 kill date; recorded 2026-10-14, decided by the user, Moiz, from the video shot proposal of that day). Each row: what is filmed, the shoot-day fallback, and the honesty rule the take must keep.

| Shot | Feature | Decision (2026-10-14, the user) | Shoot-day fallback | Honesty constraint |
|---|---|---|---|---|
| S02 | Content Launcher | **Fallback path now:** Fire TV home → Lingo tile → Lingo Home → Watch, with the fallback voice-over. Voice search is Not built | FOS-cap insert of the same path | Never say "search" or "Alexa"; never show a voice request |
| S06 | Quiz score on the TV | **If built:** the phone grades → "Sent to your TV" → the TV Summary shows the score (device run row 40) | TV Quiz screen (device run row 43) with the fallback voice-over ("on the TV or on your phone") | Show only a score that reached the TV in the take; never composite one |
| S07b | Client IAP | **Attempt:** Plus screen → Amazon App Tester purchase dialog, 2 s (device run rows 30–33, Oct 17) | If App Tester is not available or the dialog does not appear by the end of Oct 17: cut S07b, drop the Plus sentence, give the 2 s to S08 | The purchase dialog only, never a "purchased" state. Demo mode (`LINGO_PLUS_MODE=demo`) is not Amazon IAP: never caption or voice it as IAP |
| S07c | Personalization | **Partial:** the Continue row with "Resume from m:ss" (device run rows 21, 36), voice-over "Your place in each clip is kept." | Drop S07c; hold the S07a diagram | Never say "Personalization": Fire TV Personalization is Not built |
| S08 | Lingo on the VVD | **VVD Home, no video:** Lingo Home on the Vega Virtual Device, captioned "Vega Virtual Device", with the "experimental" voice-over ("Vega support is experimental") | Code-layout card (`apps/expo`, `apps/vega`, `packages/shared-ui`) with the same voice-over | Always caption the VVD half "Vega Virtual Device"; never play video on it or imply Lingo plays video on Vega |

## 4. Shot list (one row per physical setup)

The shoot is three tripod positions plus captures.

| Setup | Shots | Camera | Notes |
|---|---|---|---|
| Tripod 1 (wide: sofa + TV + phone + remote) | S01, S02, S08 left, S09 | Phone or camera at sofa height, 1080p, 25 fps, shutter 1/50 (50 Hz mains, avoids TV flicker) | Remote and hand visible in S02 |
| Tripod 2 (tight on the TV) | S03, S04, S07b (alt) | Same settings, manual focus on the screen, exposure locked to the TV | Cues must be readable at 1080p; check one test frame before the take |
| Tripod 3 (TV + phone in one frame) | S05 (cold open), then S06 | Slightly above eye level; phone on a stand angled to the lens; phone brightness ~70 %; TV picture mode "Standard" | The ticket's shot. Film the cold open first, then S06 from the same setup. Three good takes minimum |
| FOS-cap | Inserts for S02, S03, S04, S07b, S07c, S08 | `adb shell screenrecord --bit-rate 8000000 /sdcard/s.mp4` (stops at 180 s), then `adb pull /sdcard/s.mp4` | Inserts only; the device must also appear on camera |
| PH-cap | B-roll for S05, S06 | Android built-in screen recorder, or iOS Control Center recording | Captioned "Phone screen recording" whenever used |
| VVD | S08 right | macOS screen recording of the VVD window | Captioned "Vega Virtual Device" |
| GFX | S07a, S07d, S08 card (or the code-layout fallback card), end card | Made in the editor | S07d waits for the price check (§3 S07d) |
| Voice-over | All | Separate quiet recording, one take per row, then edit | Read from §3 |

### Shoot schedule (decided 2026-10-14)

1. **Oct 15: device run.** docs/spot-checks/2026-10-14-device-run.md rows 1–7, 11–12, 22–25 and 37–43. These cover S05 (cold open), S03/S04 and S06, the riskiest and most valuable shots. Reset the learner level to about A2 first (§5 pre-shoot).
2. **Oct 16: both-screens setup (tripod 3).** The cold open (S05) first, then S06. At least three good takes; if the two-device save does not work, F1.
3. **Oct 16, after tripod 3: the other camera positions and the screen captures.** Tripod 1 (S01, S02, S09, S08 left), tripod 2 (S03, S04), FOS-cap inserts (S02, S07c).
4. **Oct 17: App Tester (S07b).** Install Amazon App Tester and the PEM (device run rows 30–33). If the purchase dialog has not appeared by the end of the day, stop and cut S07b (§3 decisions).
5. **Oct 17–18: VVD (S08).** Lingo already runs on the VVD (SDK installed 2026-10-14). Use docs/spikes/2026-10-14-vega-home-to-words.mp4 (12 s, Home → rail → Words) or record a fresh take with the commands in docs/spikes/2026-10-14-vega-vvd.md §4. The code-layout card is the ready fallback.
6. **Any time: graphics and voice-over.** GFX for S07a, S07d and the end card; the voice-over in one session, after the S07d price is fixed.

## 5. Recording checklist with fallbacks

### Pre-shoot (Oct 16–18, owner Moiz)

- [ ] Stick and phone on the same Wi-Fi as the API host; API running and reachable from both (`curl http://<host>:4000/health` from a laptop on that Wi-Fi).
- [ ] Demo clip published and playable on the stick (§2).
- [ ] Learner reset (§2): new `x-device-id` or DB reset; level A2, `de`/`en`; zero saves today; Plus off.
- [ ] **Reset the learner level on the stick to A2 before filming.** The stick's learner (`tv-d89665c8-7ebf-4e04-accf-619f5797b4ce`) was at about A1 on 2026-10-14 (docs/spot-checks/2026-10-14-device-run.md §0), which marks every word. Either path works; the first is what a viewer would do:
  1. **On the TV:** Home → ◄ from the first card to the rail → Settings → ▼ to the third row, "Level", which reads "about A1" → press ► once (or Select once) → it reads "about A2" and the new value is announced. ► stops at the ends; Select steps forward and wraps after B2 (`packages/shared-ui/src/screens/settings/model.ts`). Back → Home.
  2. **From the Mac (same call the Settings row makes):** `curl -s -X PUT http://localhost:4000/me/level -H 'content-type: application/json' -H 'x-device-id: tv-d89665c8-7ebf-4e04-accf-619f5797b4ce' -d '{"source":"settings","level":"A2"}'` → `{"level":"A2","changed":"set"}` in the response data (`apps/api/src/routes/learning.ts`, `PUT /me/level`; `LevelPut` in `packages/contracts/src/tv.ts`). Then restart Lingo on the stick (`adb shell am force-stop dev.moizp.lingo && adb shell am start -n dev.moizp.lingo/.MainActivity`) so Home reloads the learner.
  3. **Check:** `psql postgresql://postgres:postgres@localhost:5432/lingo -c "select \"deviceId\", level from \"Learner\" where \"deviceId\" like 'tv-%' order by \"lastActive\" desc limit 1"` prints `A2`; the S02 level chip reads "about A2". If a new `x-device-id` is used instead, finish the first run (its placement check sets a level of its own), then set A2 with step 1 or 2 and check with step 3.
- [ ] Phone app installed (EAS dev build or Expo Go) and paired; the TV shows "<name>'s phone connected".
- [ ] If S07b is in: Amazon App Tester installed on the stick and `apps/expo/amazon.sdktester.json` copied to `/sdcard/` (README step 4).
- [x] The saved line reads correctly for one word (risk R3). Fixed: `packages/shared-ui/src/strings.ts:20` `explain.saved(1)` renders "Saved. 1 word this clip." (checked 2026-10-15).
- [x] Save word gloss passed the spot check (risk R4; Gate C as a whole passed 2026-10-10, decision 0001). registrieren and Konsulat are judged "ok" in docs/spot-checks/2026-10-10-gate-c-de-r3.md rows 5 and 6.
- [ ] Phone: Do Not Disturb on, notifications off, auto-lock off, battery > 80 %.
- [ ] TV: screensaver off; picture mode "Standard".
- [ ] Tripods level (spirit level); one test frame per setup checked on a laptop for cue legibility.

### Fallbacks (each with its trigger)

- **F1 · the two-device save does not work on the day** (no chip within ~2 s, or the phone loses the room): re-pair and retry once. If it still does not work, film the TV on tripod 3 and record PH-cap in the same take, then composite the phone recording into the phone's position with the caption "Phone screen recorded in the same take". Never shorten the real delay. Log a friction entry (`pnpm friction "<title>"`).
- **F2 · the stick misbehaves** (crash, no remote events, spike S1 still open): use FOS-cap for the UI and keep at least two tripod shots of the real stick running (S01, S05). If no stick is available at all: write that here and escalate to the Orchestrator; do not substitute an emulator without a caption naming it.
- **F3 · Vega:** decided 2026-10-14: Lingo Home on the VVD, no video, captioned "Vega Virtual Device", with the "experimental" voice-over. If no Lingo screen runs on the VVD by Oct 18, use S08's fallback (the code-layout card, same voice-over). The definition of done allows "documents exactly why Vega is experimental" (runbook §9); docs/submission-checklist.md links that note.
- **F4 · IAP sandbox flaky or App Tester unavailable:** cut S07b and drop the Plus sentence (§3 decisions); turn the Plus feature flag off in the shoot build if needed (PLAN §14). Never film demo mode (`LINGO_PLUS_MODE=demo`) and caption it as Amazon IAP, and never show a "purchased" state.
- **F5 · a gloss on screen is incorrect:** re-take with a different save word. Never show a gloss that did not pass the spot check.

### Edit and export (owner Moiz, Oct 19)

- [ ] Cut to 2:40–2:55.
- [ ] `ffprobe -v error -show_entries format=duration -of csv=p=0 lingo.mp4` prints a number < 180.
- [ ] 1080p, H.264.
- [ ] Captions burnt in, plus an `.srt` uploaded to YouTube.
- [ ] Loudness about −14 LUFS.
- [ ] Watch once with the sound off to check the captions.
- [ ] Reviewer (fable) watches the cut against the claims register in docs/submission.md §15: every spoken claim matches a Built or Code-done row, or the take shows it working.
- [ ] Upload Oct 20 (docs/submission-checklist.md), **public** on YouTube or Vimeo, in English, under 3 minutes, showing Lingo on a real Fire TV device or the Fire TV / Vega simulator; no third-party trademarks or copyrighted footage, and ask the organisers before using CC footage (checked on the rules page 2026-10-14). CC clips: Moiz asked the organisers by email around 2026-10-14; no reply as of 2026-10-19 (reported by Moiz 2026-10-19); each clip's attribution is shown in full on screen (§1). <!-- HUMAN: paste the public YouTube or Vimeo URL here after the Oct 20 upload, and the same URL in docs/submission.md §13. -->

## 6. Open questions

- Resolved: video visibility is **public**, on YouTube or Vimeo (checked on the rules page 2026-10-14).
