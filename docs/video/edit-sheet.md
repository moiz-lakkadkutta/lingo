# Lingo: video edit sheet

The edit decision list for the LING-009 demo video, built from docs/video-script.md §3 (the 2:45 cold-open cut, decided 2026-10-14). One row per shot in cut order: where the footage comes from, the in/out to aim for, the running time, the voice-over, the on-screen text, and the claim it backs in docs/submission.md §15.

Written 2026-10-19 for the Oct 19 edit (docs/submission-checklist.md §2 "Oct 19 (edit)"). If docs/video-script.md changes after this date, it wins; update this sheet and docs/video/lingo.srt together.

## 0. Hard rules for the cut

- Runtime **under 3:00** (rules: https://amazonappdev2026.devpost.com/rules). Target **2:40–2:55**. This sheet is timed at **2:45** (165 s).
- English voice-over and captions. Captions burnt in **and** `docs/video/lingo.srt` uploaded to YouTube.
- Lingo must be seen on the **real Fire TV Stick** on camera (S05, S01, S02, S09 at least), with a moment of **Fire OS** (all tripod shots) and of **Vega** (S08 right half, captioned "Vega Virtual Device").
- Loudness about **−14 LUFS** integrated, true peak ≤ −1 dBTP. Check with `scripts/check-video.sh <file>`.
- Export 1920×1080, H.264, 25 fps (the shoot frame rate), AAC 48 kHz.
- Wording (docs/decisions/0002-wording.md): levels always "about A2" / "approximate"; no "wrong", "failed" or "streak broken" anywhere on screen. `scripts/check-video.sh --srt docs/video/lingo.srt` checks the captions file.
- Never claim what the take does not show (docs/submission.md §15 C36): no voice search or "Alexa", no "Personalization", no Polly, no video on Vega, no "purchased" state.

Legend for the Source column (docs/video-script.md §1): **T1/T2/T3** = tripod 1 (wide sofa), 2 (tight on TV), 3 (TV + phone in one frame) · **FOS-cap** = `adb shell screenrecord` of the stick · **PH-cap** = phone screen recording · **VVD** = Vega Virtual Device screen recording · **GFX** = made in the editor · **VO** = voice-over track.

## 1. Edit decision list (2:45)

"In/out" is the target position on the timeline. "Source in" says which part of the take to use. SRT column = cue numbers in docs/video/lingo.srt.

| # | Shot | In → Out | Dur | Running | Source | Source in (what to pick from the take) | Voice-over | On-screen text (burnt in, besides the VO captions) | SRT | Claims (§15) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **S05** cold open | 0:00.0 → 0:20.0 | 20 s | 0:20 | **T3**, one continuous take, no cut (PH-cap only under fallback F1) | Start ~1 s before the Explain card on **registrieren** (cue 9, clip time 0:39.2) is fully open; include focus → "Save word" → Select → TV "Saved. 1 word this clip." → chip on the phone's Live list. Keep the real delay | "Pause on a German line. Save the word, and it's on your phone a second later." Spoken **before** the press, then silence to 0:20 | Lower third from 0:01 to ~0:07: clip attribution card (§3 below) + change note. Under F1 only: "Phone screen recorded in the same take" | 1–2 | C5 (< 1 s p95), C4 |
| 2 | **S01** hook | 0:20.0 → 0:30.0 | 10 s | 0:30 | **T1** wide | Lingo Home on the TV, phone on the sofa arm, remote in hand. Slow push-in allowed, no zoom | "You already watch more than an hour of TV a day.¹ Lingo turns it into your German lesson." | Footnote line, small, bottom, 0:21–0:25: "¹ AGF Videoforschung, TV year 2024: 79 min a day, ages 14–49" | 3–4 | C22 |
| 3 | **S02** launch | 0:30.0 → 0:45.0 | 15 s | 0:45 | **T1** medium, remote + hand in frame (FOS-cap insert if soft) | Fire TV home → Lingo tile → Lingo Home → "Watch" focused (outline + 1.04 scale visible) → Select → playback starts | "Lingo sits on the Fire TV home screen. One press, and today's clip at your level is playing." | The level chip must read "about A2" in frame | 5–6 | C3 (approximate level). Never say "search" or "Alexa" (C36) |
| 4 | **S03** two lines | 0:45.0 → 1:00.0 | 15 s | 1:00 | **T2** tight on TV (FOS-cap insert if cues are soft) | Player running on `terra-x-friedlaender`: German line large and bright, English line smaller above it, one marked word | "Two subtitle lines: German, large and bright; English, small and quiet. The marked word is the one worth learning at your level." | Clip attribution card again only if S05 used PH-cap/F1 composite (otherwise S05 covered the first appearance) | 7–9 | C1, C3 |
| 5 | **S04** explain | 1:00.0 → 1:12.0 | 12 s | 1:12 | **T2** (FOS-cap insert if the card is soft) | Select → pause on cue 11 → Explain card on **Konsulat**: "rank 9496 · about B2", gloss "consulate", "noun, das Konsulat, pl. Konsulate"; actions Save word / Replay / Slower | "Pause, and Lingo explains the marked word: what it means, and one grammar note." | — | 10–11 | C4 |
| 6 | **S06** quiz | 1:12.0 → 1:30.0 | 18 s | 1:30 | **T3**, then PH close-up | Clip end → Summary with word chips → "Quiz on your phone" → phone flips a card, grades → "Sent to your TV" → TV Summary shows the score | "At the end, a two-minute quiz on your phone. Tomorrow it asks again, spaced further out each time you get it right." | "Spacing: SM-2" (small, 1:20–1:25) | 12–14 | C6, C17. TV score: C36 (only if the take shows it) |
| 7 | **S07c** resume | 1:30.0 → 1:36.0 | 6 s | 1:36 | **FOS-cap** | Home → Continue row with "Resume from m:ss" | "Your place in each clip is kept." | — | 15 | C36 / C33: never say "Personalization" |
| 8 | **S07a** pipeline | 1:36.0 → 1:56.0 | 20 s | 1:56 | **GFX** over FOS-cap, or terminal capture of `pnpm pipeline prepare` | Diagram builds left to right in step with the VO: Transcribe → segment (42 × 2, 20 cps) → Translate → lemmatize + frequency rank → highlights → Nova Pro glosses → quiz built by code → Shaka Packager → S3 + CloudFront | "Amazon Transcribe writes the German line with word timings, and Amazon Translate the English one. Every line is cut to subtitle reading limits.² Amazon Nova Pro on Bedrock writes the glosses, and code builds the quiz from them." | Footnote line 1:44–1:48: "² Broadcast subtitle guidelines: 42 characters per line, 20 characters per second" (no brand name) | 16–20 | C8, C9, C10, C11, C14, C15 |
| 9 | **S07d** cost | 1:56.0 → 2:04.0 | 8 s | 2:04 | **GFX**: last diagram node held | Label appears at 1:57 | "Preparing a clip costs about 25 cents in AWS calls, so the same pipeline can run on licensed catalogues." | "about 25 cents a clip (estimate)" | 21–22 | C39 |
| 10 | **S07b** Plus | 2:04.0 → 2:06.0 | **2 s** | 2:06 | **FOS-cap** or T2 | Plus screen → Amazon App Tester purchase dialog. The dialog only | "Lingo Plus is a subscription through Amazon's in-app purchasing, shown here in sandbox." Runs on over the cut into S08 until ~2:09 | "Amazon Appstore IAP · sandbox (App Tester)" | 23–24 | C7 (only if the App Tester dialog is in the take) |
| 11 | **S08** Fire OS + Vega | 2:06.0 → 2:28.0 | 22 s | 2:28 | Split: left **T1** (Lingo Home on the stick), right **VVD** (`docs/spikes/2026-10-14-vega-home-to-words.mp4` or a fresh take); from ~2:20 **GFX** repo card | Both halves on Lingo Home; no playback on the Vega half. Card: vega-media-kit (MIT, npm), `packages/shared-ui`, `infra/` (CDK), `docs/friction/` (36 logs) | (2:09.2 on) "Lingo shares vega-media-kit, our open-source player and subtitle library, with our other entry, Described. One UI package, written for Fire OS and Vega; Vega support is experimental. The AWS stack is CDK, and every rough edge we hit is a friction log in the repo." | Right half, whole time: "Vega Virtual Device". Left half: "Fire TV Stick (Fire OS)" | 25–30 | C19, C20, C26, C28 |
| 12 | **S09** close | 2:28.0 → 2:41.5 | 13.5 s | 2:41.5 | **T1** wide, morning light, then PH close-up of a review card | Phone review the next morning | "Lingo is for adults learning German or English at home, like the 363,466 people who started an integration course in Germany in 2024.³ Next: more languages, through Translate." | Footnote line 2:32–2:38: "³ BAMF, Integrationskursgeschäftsstatistik 2024" | 31–34 | C21, C33 (next step, not a claim) |
| 13 | End card | 2:41.5 → 2:45.0 | 3.5 s | **2:45** | **GFX** | — | (silence) | End card text, §3 below | — | C26 (MIT) |

Total: 165 s = **2:45**. Room to grow to 2:55 if a take needs air: S05 (let the moment breathe) or the end card.

### Footnote count check

Re-count the friction logs just before making the S08 card: `ls docs/friction/*.md | grep -v README | wc -l` (36 on 2026-10-19).

## 2. Fallback swaps (from docs/video-script.md §3 decisions and §5)

Apply these if the shoot used the fallback. Each swap keeps the total at 2:45; then edit the matching SRT cues.

| Trigger | Change on the timeline | VO / captions change | SRT |
|---|---|---|---|
| S07b: no App Tester dialog in the footage (F4) | Delete row 10; S08 starts at 2:04 (24 s) | Drop the Plus sentence; never caption demo mode as IAP | Delete cues 23–24; S08 VO can start at 2:05 |
| S06: the score did not reach the TV | End on the phone's last card, cut to the TV Quiz screen | VO: "At the end, a two-minute quiz, on the TV or on your phone. Tomorrow it asks again, spaced further out each time you get it right." | Cue 12 → "At the end, a two-minute quiz,\non the TV or on your phone." (00:01:12,500 → 00:01:16,800) |
| S07c: no resume position on Home | Delete row 7; hold the S07a diagram 6 s longer (S07a 1:30–1:56) | Drop "Your place in each clip is kept." | Delete cue 15 |
| S07d: no defensible cost number | Delete row 9; give the 8 s to S08 | Drop the cost sentence; delete the GFX label | Delete cues 21–22 |
| S05: the two-device save did not work (F1) | TV from T3 + PH-cap composited in the phone's position, real delay kept | Same VO | Add a burnt-in line "Phone screen recorded in the same take" (not in the SRT) |
| S08: no VVD footage (F3) | Right half → code-layout card (`apps/expo`, `apps/vega`, `packages/shared-ui`) | Same VO; no "Vega Virtual Device" label | — |

## 3. Attribution card and end card

### Clip attribution card (S05 lower third, and on the end card)

Verbatim from docs/content.md §2 row 3 (`terra-x-friedlaender`), with the change note required by CC BY (docs/content.md §5). Do not shorten the credit line to "ZDF".

> Interview mit Holocaust-Überlebender Margot Friedländer (Terra X)
> ZDF/TerraX/Leonie Schöler/Julia Geiß/Michael Fandel/Benjamin Leng/Margot Friedländer Zeitzeugin/Maximilian Mohr — CC BY 4.0
> https://creativecommons.org/licenses/by/4.0
> Excerpt, trimmed; subtitles and glosses added by Lingo.

Editorial note (docs/content.md §6): this is a Holocaust survivor's testimony. Keep the tone plain; the saved word (registrieren) and the explained word (Konsulat) are neutral by choice.

Only this clip is shown on screen. If another clip appears in any take (Home posters on the rail count), add its row from docs/content.md §2 to the end card too.

### End card (2:41.5–2:45)

> **Lingo**
> https://github.com/moiz-lakkadkutta/lingo · MIT
> Built for Build, Ship, Shape: Amazon Developer Hackathon
>
> Demo clip: "Interview mit Holocaust-Überlebender Margot Friedländer (Terra X)", ZDF/TerraX/Leonie Schöler/Julia Geiß/Michael Fandel/Benjamin Leng/Margot Friedländer Zeitzeugin/Maximilian Mohr — CC BY 4.0 (creativecommons.org/licenses/by/4.0). Excerpt, trimmed; subtitles and glosses added by Lingo.
> Sources: ¹ AGF Videoforschung 2025 · ² broadcast subtitle guidelines · ³ BAMF 2024
> Music: none

Hold the end card at least 3 s so it can be paused and read.

## 4. Music and sound

- **No music** in this cut (docs/video-script.md §1). If a bed is added, it must be CC0 and named on the end card ("Music: <title> by <author>, CC0"); never commercial music (Content ID claims on YouTube).
- The clip's own audio (Margot Friedländer speaking) stays under the shots that show the Player: duck it to about −24 LUFS under the VO, and let it come up to dialogue level in the silent part of S05 (after the press) so the save moment is heard as it happened.
- VO: one quiet room, one take per row (docs/video-script.md §4), high-pass at about 80 Hz, light compression. Keep VO peaks ≤ −3 dBFS before the master pass.
- Master: export, then `scripts/check-video.sh <export>.mp4`, run the printed second loudnorm pass to −14 LUFS, check again, then burn in the captions (or burn them in the editor before the loudness pass; either order, as long as the final file is checked).

## 5. Final checks before upload

1. `scripts/check-video.sh lingo-final.mp4` → duration under 180 s, "OK 1080p H.264", I within −15..−13 LUFS.
2. `scripts/check-video.sh --srt docs/video/lingo.srt` after any caption edit → "caption rules hold".
3. Watch once with the sound off: every VO line is readable in time; footnotes appear while the number is spoken.
4. The Reviewer watches the cut against docs/submission.md §15 (docs/submission-checklist.md §2 "Oct 19 (edit)").
5. Upload with docs/video/upload.md.
