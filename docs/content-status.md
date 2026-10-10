# Content status (LING-008)

Where each of the 12 shortlist clips (docs/content.md §2) stands. Updated by the batch runs; the source of truth for metadata stays
docs/content.md and content/clips.json. Work dirs live in `packages/pipeline/work/<slug>/` (gitignored), sources in
`packages/pipeline/work/sources/`. Bucket: `s3://lingo-media-dev-128425594526/clips/`.

Last updated: 2026-10-10 (elephants-dream swap; content staged in content/).

## Inventory

"Processed" means `prepare` ran with AI glosses and quiz (`--no-publish`) and the work dir with `transcript.json` exists on disk.
"Trim used" is the segment actually cut; it differs from content.md where the planned point fell inside speech.

| # | Slug | Lang | Licence | Source | Segment (content.md) | Trim used | Duration | Source res. | In S3 | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | jung-naiv-drogen | de | CC BY 3.0 | [Commons](https://commons.wikimedia.org/wiki/File:Drogen_-_Jung_&_Naiv_Folge_81_-_YouTube.webm) | 02:00–08:00 (unconfirmed) | 01:56.3–08:00.8 | 6:05 (364.6 s) | 1920×1080 | yes (`.mp4`) | **processed** (batch 3); sensitive topic (drugs), handled numbers-only |
| 2 | openhpi-vandalismus | de | CC BY-SA 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:2019-11-13_Gespräch_zu_Vandalismus_–_Trolle,_Hass_und_Fake-News_–_Wie_können_wir_das_Internet_retten%3F_(openHPI).webm) | 00:00–07:00 (unconfirmed) | 00:00–07:03.2 | 7:03 (423.2 s) | 960×540 | yes (`.mp4`) | **processed** (batch 3); FORMAL; BY-SA `NOTE` in every VTT |
| 3 | terra-x-friedlaender | de | CC BY 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:Interview_mit_Holocaust-Überlebender_Margot_Friedländer.webm) | 00:00–03:46 | whole file | 3:46 (226.3 s) | 1920×1080 | yes (`.webm`) | **processed** (batch 2, `--reuse` of the orchestrator's re-prepared mezzanine + transcript; no new Transcribe) |
| 4 | terra-x-klimafaktoren | de | CC BY 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:Die_wichtigsten_Klimafaktoren_(ZDF,_Terra_X)_720p_50FPS.webm) | 00:00–07:14 | whole file | 7:15 (434.8 s) | 1280×720 | yes (`.webm`) | **processed** (batch 1) |
| 5 | terra-x-becker-interview | de | CC BY-SA 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:Interview_mit_dem_Virologen_Prof._Stephan_Becker_zur_Corona-Pandemie.webm) | 00:00–04:49 | whole file | 4:49 (289.2 s) | 1280×768 (SAR 273:256) | yes (`.webm`) | **processed** (batch 2); BY-SA `NOTE` in every VTT |
| 6 | terra-x-so-trinken-baeume | de | CC BY 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:So_trinken_Bäume.webm) | 00:00–04:19 | whole file | 4:20 (259.9 s) | 1920×1080 | yes (`.webm`) | **processed** (batch 1); attribution still cut at "Jochen …" (content.md [^g5]) — blocks publish, not prepare |
| 7 | what-to-do-on-a-date-1950 | en | Public domain (US) | [IA](https://archive.org/details/WhattoDo1950) | 00:16–07:55 | 00:16–07:55 | 7:39 (459.0 s) | 640×480 | yes (`.mp4`) | **processed** (batch 2: new Transcribe + timing-only retime) |
| 8 | sprite-fright | en | CC BY 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:Sprite_Fright_-_Blender_Open_Movie-full_movie.webm) | 00:00–06:00 (unconfirmed) | 00:13–06:03 (recut, human-confirmed) | 5:50 (350.0 s) | 2048×858 (IA .mkv) → 1920×804 | yes (`.mp4`) | **processed** (recut 2026-10-10) |
| 9 | shy-guy-1947 | en | Public domain (US) | [IA](https://archive.org/details/ShyGuy1947) | 00:00–07:00 (unconfirmed) | 00:16–07:09 | 6:53 (413.0 s) | 640×480 | yes (`.mp4`) | **processed** (batch 1) |
| 10 | cosmos-laundromat | en | CC BY-SA 3.0 (treat as) | [IA](https://archive.org/details/CosmosLaundromatFirstCycle) | 00:00–05:30 (unconfirmed) | 02:15–05:52 (recut, human-confirmed) | 3:37 (217.0 s) | 1920×804 | yes (`.mp4`) | **processed** (recut 2026-10-10); BY-SA `NOTE` in every VTT; rated 13+ |
| 11 | elephants-dream (reserve R10) | en | CC BY 2.5 (Commons file) | [Commons](https://commons.wikimedia.org/wiki/File:Elephants_Dream_(2006).webm) | 00:00–05:30 (R10 row) | 00:45–08:22.5 | 7:38 (457.5 s) | 1920×1080 | yes (`.mp4`) | **processed** (2026-10-10), replaces tears-of-steel |
| — | tears-of-steel | en | CC BY 3.0 | [IA](https://archive.org/details/Tears-of-Steel) | 00:00–04:30 | 00:00–04:30, then 03:09–07:13 | — | 1920×800 | yes (`.mp4`, `-b.mp4`) | **dropped (too sparse)**: 3 and 6 highlights, no quiz in either segment |
| 12 | duck-and-cover | en | Public domain (US) | [IA](https://archive.org/details/DuckandC1951) | 01:00–07:30 | 01:03–07:31 | 6:28 (388.0 s) | 368×480 anamorphic → 640×480 | yes (`.mp4`) | **processed** (batch 1); sensitive topic (nuclear attack drill) |

Not in S3 any more / reserve: `voa-lets-learn-english-01` (reserve R8) is still in the bucket.

## Batch 1 (2026-10-10)

Run: `pnpm pipeline prepare` with AI (Nova Pro v1 glosses, quiz planned by code), `--no-publish`, `--formality INFORMAL`, natives
`en` for German and `de` for English, `AWS_PROFILE=described-dev` (the `default` profile's login session had expired). German and
sensitive clips were handled numbers-only: no cue or gloss text was read or printed.

| Slug | Gate (first run) | `--cues` retime | Cues | Level (coverage rank) | Highlights | Gloss ok / soft / rejected (dropped) | Quiz (meaning + cloze) | Review warnings |
|---|---|---|---|---|---|---|---|---|
| terra-x-klimafaktoren | fail: 21 × cps > 20 | yes: 30 of 115 cues moved, 10 starts moved > 0.5 s, max start shift 3.4 s, max end shift 2.4 s | 115 | B2 (7267) | 43 | 40 / 3 / 11 (11) | 10 (6 + 4) | 26 rare highlight, 6 possible name, 3 asr, 1 unranked tokens |
| terra-x-so-trinken-baeume | pass | no | 52 | B2 (6183) | 17 | 17 / 0 / 10 (10) | 7 (4 + 3) | 14 rare highlight, 2 possible name, 2 asr |
| duck-and-cover | fail: 4 × cps > 20 | yes: 4 of 109 cues moved, max start shift 0.47 s | 109 | A2 (1869) | 20 | 20 / 0 / 3 (3) | 10 (6 + 4) | 4 rare highlight |
| shy-guy-1947 | fail: 11 × cps > 20 | yes: 17 of 112 cues moved, 3 starts moved > 0.5 s, max start shift 0.8 s | 112 | A2 (1722) | 33 | 33 / 0 / 0 (0) | 10 (6 + 4) | 2 rare highlight, 2 asr |

All four gates failed only on reading speed (cps); no cue was too long, too short or over two lines. The retime pass changes timings
only (script check: same tokens in the same order, no split or merge was needed): it stretches a cue into the pause after or before
it, and where that is not enough it repacks up to two neighbours on each side between the surrounding pauses, each cue as close to its
own start as the order allows. The retimed files are `packages/pipeline/work/<slug>/<lang>.retimed.vtt` (not yet in `content/cues/`).
Terra X narration is dense: on `terra-x-klimafaktoren` a few cues now appear up to 3.4 s before their words are spoken. Check these by
ear before publishing.

Step timings (seconds; the first run did media and Transcribe, the `--cues` run did the rest; five ffmpeg jobs shared the CPU):

| Slug | Media normalise | Transcribe | Translate | Lemmatise | Glosses + quiz | Package | USD Bedrock (clip.json) |
|---|---|---|---|---|---|---|---|
| terra-x-klimafaktoren | 372.5 | 77.6 | 14.8 | 0.7 | 99.6 | 0.2 | 0.1208 (72 calls) |
| terra-x-so-trinken-baeume | 357.0 | 41.7 | 6.6 | 0.7 | 55.8 | 0.3 | 0.0679 (40 calls) |
| duck-and-cover | 321.7 | 46.9 | 14.1 | 0.2 | 48.3 | 0.2 | 0.0443 (27 calls) |
| shy-guy-1947 | 315.5 | 47.1 | 7.3 | 0.2 | 32.2 | 0.3 | 0.0164 + 0.0476 in a run that Bedrock throttled |

### Spend, batch 1 (estimates at the repo's unverified prices, docs/aws.md)

| Service | Quantity | USD |
|---|---|---|
| Transcribe | 24.9 min (434.8 + 259.9 + 388.0 + 413.0 s) × $0.024 | 0.60 |
| Translate | ≈ 24 200 characters (shy-guy translated twice because of the throttled run) × $15 / M | 0.36 |
| Bedrock Nova Pro v1 | sum of `usd=` in the logs | 0.30 |
| S3 | 0.52 GB stored, uploads free | < 0.02 / month |
| **Total** | | **≈ 1.26** |

Logs: `packages/pipeline/work/logs/<slug>.prepare*.log` (contain cue text; do not paste them anywhere).

## Batch 2 (2026-10-10)

Same run settings as batch 1. Bedrock steps ran one clip at a time (no throttling). German clips numbers-only.

| Slug | Gate (first run) | `--cues` retime | Cues | Level (coverage rank) | Highlights | Gloss ok / soft / rejected (dropped) | Quiz (meaning + cloze) | Review warnings |
|---|---|---|---|---|---|---|---|---|
| terra-x-friedlaender | pass (`--reuse`) | no | 54 | B1 (3199) | 13 | 12 / 1 / 1 (1) | 6 (5 + 1) | 3 rare highlight, 1 possible name, 1 asr |
| terra-x-becker-interview | fail: 19 × cps | yes: 28 of 75 moved, 3 starts > 0.5 s, max start shift 1.8 s | 75 | B2 (5350) | 26 | 25 / 1 / 3 (3) | 10 (6 + 4) | 15 rare highlight, 1 possible name |
| tears-of-steel | fail: 1 × cps, 1 × tooShort | yes: 4 of 30 moved, max start shift 0.56 s | 30 | B1 (2144) | 3 | 3 / 0 / 0 (0) | 0 (fewer than 4 testable highlights) | 2 rare highlight |
| what-to-do-on-a-date-1950 | fail: 7 × cps, 2 × tooShort | yes: 15 of 113 moved, max start shift 0.74 s | 113 | A2 (1307) | 17 | 17 / 0 / 0 (0) | 10 (6 + 4) | 8 rare highlight, 1 asr |
| sprite-fright | fail: 2 × cps, 1 × tooShort (2 cues dropped by the segmenter) | yes: 15 of 72 moved, max start shift 0.33 s | 72 | B2 (4222) | 18 | 18 / 0 / 1 (1) | 9 (5 + 4) | 8 rare highlight |

Step timings (seconds; first run = media + Transcribe, `--cues` run = the rest; batch 2 ran one clip at a time):

| Slug | Media normalise | Transcribe | Translate | Lemmatise | Glosses + quiz | Package | USD Bedrock |
|---|---|---|---|---|---|---|---|
| terra-x-friedlaender | reused | reused | 3.1 | 0.8 | 2.6 (13 of 15 calls cached) | 0.2 | 0.0034 |
| terra-x-becker-interview | 189.2 | 51.7 | 9.4 | 0.7 | 49.9 | 0.2 | 0.0643 |
| tears-of-steel | 91.2 | 26.5 | 3.8 | 0.2 | 7.7 | 0.1 | 0.0065 |
| what-to-do-on-a-date-1950 | 82.9 | 46.5 | 12.1 | 0.2 | 25.2 (11 cached) | 1.6 | 0.0115 |
| sprite-fright | 88.1 | 41.8 | 8.3 | 0.2 | 43.9 | 0.3 | 0.0380 |

### Spend, batch 2

| Service | Quantity | USD |
|---|---|---|
| Transcribe | 23.0 min (289.2 + 270.0 + 459.0 + 363.0 s) × $0.024 | 0.55 |
| Translate | ≈ 13 200 characters × $15 / M | 0.20 |
| Bedrock Nova Pro v1 | sum of `usd=` in the logs | 0.12 |
| S3 | + 0.45 GB stored | < 0.02 / month |
| **Total batch 2** | | **≈ 0.87** |
| **Total batches 1 + 2** | | **≈ 2.13** |

## Batch 3 (2026-10-10)

Same run settings. Bedrock steps one clip at a time. `jung-naiv-drogen` and `openhpi-vandalismus` handled numbers-only.

| Slug | Gate (first run) | `--cues` retime | Cues | Level (coverage rank) | Highlights | Gloss ok / soft / rejected (dropped) | Quiz (meaning + cloze) | Review warnings |
|---|---|---|---|---|---|---|---|---|
| jung-naiv-drogen | fail: 17 × cps | yes: 31 of 106 moved, 4 starts > 0.5 s, max shift 0.93 s | 106 | B2 (6067) | 34 | 34 / 0 / 7 (7) | 10 (6 + 4) | 23 rare highlight, 3 possible name |
| openhpi-vandalismus (FORMAL) | fail: 34 × cps, 1 × tooShort | yes: 55 of 128 moved, 11 starts > 0.5 s, max start shift 1.4 s, max end shift 1.7 s | 128 | B2 (5830) | 37 | 37 / 0 / 6 (6) | 10 (6 + 4) | 18 rare highlight, 5 possible name, 3 asr |
| cosmos-laundromat | pass | no | 60 | A2 (1908) | 12 | 12 / 0 / 0 (0) | 7 (4 + 3) | 3 rare highlight |
| tears-of-steel-b (03:09–07:13) | pass | no | 37 | A2 (1709) | 6 | 6 / 0 / 0 (0) | 0 (fewer than 4 testable highlights) | 1 rare highlight |

Step timings (seconds):

| Slug | Media normalise | Transcribe | Translate | Lemmatise | Glosses + quiz | Package | USD Bedrock |
|---|---|---|---|---|---|---|---|
| jung-naiv-drogen | 91.5 | 123.0 | 13.0 | 0.8 | 73.2 | 0.2 | 0.0946 |
| openhpi-vandalismus | 68.2 | 87.2 | 14.1 | 1.3 | 74.9 | 0.2 | 0.0958 |
| cosmos-laundromat | 117.9 | 31.1 | 6.8 | 0.4 | 32.9 | 0.4 | 0.0195 |
| tears-of-steel-b | 132.1 | 26.2 | 3.6 | 0.2 | 11.6 | 0.2 | 0.0114 |

### Tears of Steel: swap for reserve

The film has 76 subtitle cues in 12:14. The densest 4–8 min window by characters per minute (Commons en subtitles) is 03:10–07:10
(257 chars/min, 51 cues), cut as 03:09–07:13 in subtitle gaps and uploaded as `clips/tears-of-steel-b.mp4`. It gave 6 highlights and
no quiz, under the bar of 8 highlights and a quiz. Proposed replacement: **`elephants-dream`** (R10, CC BY, en, nearly all dialogue in
00:00–05:30, en + de subtitles to check against). Runner-up: `dating-dos-and-donts-1949` (R9, same Coronet family as
`what-to-do-on-a-date-1950`, which gave 17 highlights at A2, but US-PD). Not processed.

### Spend, batch 3

| Service | Quantity | USD |
|---|---|---|
| Transcribe | 23.1 min (244.0 + 364.6 + 423.2 + 352.0 s) × $0.024 | 0.55 |
| Translate | ≈ 14 700 characters × $15 / M | 0.22 |
| Bedrock Nova Pro v1 | sum of `usd=` in the logs | 0.22 |
| **Total batch 3** | | **≈ 0.99** |
| **Total batches 1–3** | | **≈ 3.12** |

## Elephants Dream (replacement for row 11, 2026-10-10)

| Slug | Gate (first run) | `--cues` retime | Cues | Level (coverage rank) | Highlights | Gloss ok / soft / rejected (dropped) | Quiz (meaning + cloze) | Review warnings |
|---|---|---|---|---|---|---|---|---|
| elephants-dream | fail: 1 × cps (1 cue dropped by the segmenter) | yes: 8 of 73 moved, max start shift 0.10 s | 73 | A1 (803) | 10 | 10 / 0 / 0 (0) | 8 (5 + 3) | 2 rare highlight, 1 asr |

Timings: media 233.5 s, Transcribe 41.3 s, Translate 6.9 s, glosses + quiz 22.7 s. The cut is 00:45–08:22.5 of the Commons 1920×1080 webm
(840 MB; the IA `ed_hd.mp4` is 640×360). Both ends are in subtitle gaps (Commons en subtitles: 30.1–46.6 s and 501.7–531.0 s); the
window holds 75 of the film's 85 subtitle cues. Spend: Transcribe 7.6 min ≈ $0.18, Translate ≈ $0.02, Bedrock $0.02 → **≈ $0.22**.
**Total batches 1–3 + swap ≈ $3.34.**

## Recut: cosmos-laundromat and sprite-fright (2026-10-10)

The human chose new in-points just before the first line, skipping the Blender studio logos. Both were re-cut from the same sources with
the same encode, uploaded over `clips/<slug>.mp4`, and prepared again with AI into fresh work dirs (old ones kept as `<slug>.old-cut`).
New 10 s previews are in `packages/pipeline/work/trim-preview/`.

| Slug | Segment | Gate (first run) | `--cues` retime | Cues | Level (coverage rank) | Highlights | Gloss ok / soft / rejected (dropped) | Quiz (meaning + cloze) | Review warnings | USD Bedrock |
|---|---|---|---|---|---|---|---|---|---|---|
| cosmos-laundromat | 02:15–05:52 (217 s) | pass | no | 50 | A2 (1908) | 12 | 12 / 0 / 0 (0) | 7 (4 + 3) | 3 rare highlight | 0.0049 (9 of 12 calls cached) |
| sprite-fright | 00:13–06:03 (350 s) | fail: 4 × cps, 2 × tooShort (1 cue dropped by the segmenter) | yes: 16 of 72 moved, max shift 0.25 s | 72 | B2 (4222) | 16 | 16 / 0 / 0 (0) | 9 (5 + 4) | 8 rare highlight, 5 asr | 0.0231 |

Spend: Transcribe 9.45 min ≈ $0.23, Translate ≈ 3 800 characters ≈ $0.06, Bedrock $0.03 → **≈ $0.31**. **Total so far ≈ $3.65.**

## Staged for the app (2026-10-10, not published)

- `content/cues/<slug>.<lang>.vtt` for all 12 clips: the final target VTT of each clip's last `prepare` run (the timing-only retime
  where there was one). Timings checked equal to `work/<slug>/clip.json` and to the retimed file; BY-SA clips carry the `NOTE` line.
- `content/clips.json`: row 11 is now `elephants-dream`. Every row has `sourceS3: s3://$S3_BUCKET_MEDIA/clips/<slug>.<ext>`
  (`downloadUrl: null`, as the schema requires exactly one; the download URLs stay in docs/content.md), the trim actually used as
  `segment` with `expectedDurationS` = the cut's duration, `cues` set, trim notes in `editorialNote`, and an informational `prepared`
  block (level, coverage rank, cues, highlights, quiz, retimed, `published: false`) that the manifest schema ignores. Rows whose trim
  was picked by an agent keep `segment.confirmed: false` until a human has watched the ends.
- Publishing stays blocked by: `gateC: "pending"`; `terra-x-so-trinken-baeume`'s attribution (cut at "Jochen …", a manifest problem
  that blocks only that clip); and the four Terra X rows' manual licence checks (`verifiedOn: null` fails `verify` in a real run).
- `pnpm pipeline batch content/clips.json --dry-run` now says "Transcribe will run for: no clip"; every clip re-runs from its `--cues` file.

## Trim notes

- `shy-guy-1947`: speech starts at 00:19 (IA ASR .srt); 00:00–00:16 is title music. The planned out-point 07:00 falls inside an utterance
  (06:59.6–07:06.1 in the .srt), so the cut ends at 07:09, in the next gap. Chosen from the .srt, not by viewing.
- `duck-and-cover`: the planned in-point 01:00 falls inside speech; 01:03 is in a 1.4 s silence (62.8–64.3 s). The out-point 07:30
  falls in a 0.9 s burst of speech; 07:31 is in the next silence. The IA `.mp4` is 368×480 with square pixels but the picture is
  horizontally squeezed (4:3 content): the cut is scaled to 640×480 with `setsar=1` to restore the aspect (width only; no height upscale).
- `tears-of-steel`: the IA `tears_of_steel_1080p.mp4` named in content.md is really 864×360; the cut uses the IA `tears_of_steel_1080p.webm`
  (1920×800). The out-point 04:30 lies in a dialogue gap (Commons en subtitles: 04:08–04:52), so it was kept; speech starts at 00:23.
- `sprite-fright`: the IA `.mp4` is 1146×480; the cut uses the IA `.mkv` (2048×858), scaled down to 1920 wide. The out-point 06:00 was
  0.37 s after a line ends (embedded en subtitles: 05:57.6–05:59.6, next line 06:07.1); moved to 06:03, mid-gap. Music under the whole
  clip, so subtitle timings were used instead of silence detection.
- `terra-x-becker-interview`: whole file, uploaded as the original `.webm`.
- `jung-naiv-drogen`: 02:00 falls inside speech; nearest pause 01:56.1–01:56.4 → in 01:56.3. 08:00 falls in a pause
  (08:00.3–08:01.4) → out 08:00.8. Chosen by silence detection (-30 dB), not by listening.
- `openhpi-vandalismus`: in 00:00 (3.3 s of silence at the start). 07:00 falls inside speech; nearest pause 07:03.0–07:03.4 → out 07:03.2.
- `cosmos-laundromat`: the dialogue runs 02:20–05:50 (IA en .srt); 05:30 cuts mid-dialogue, so the out-point moved to 05:52, after the
  scene's last line, rather than back to the 05:27–05:29 gap, which would drop the end of the conversation. 00:00–02:20 has no dialogue;
  starting at 01:55 would make it a 4-min clip with the same text.
- The two Terra X clips were uploaded as the original `.webm`, untrimmed (whole file), as `terra-x-friedlaender` was.

## Next

All 12 rows are processed and staged (see "Staged for the app"). Nothing is published.
