# Content status (LING-008)

Where each of the 12 shortlist clips (docs/content.md §2) stands. Updated by the batch runs; the source of truth for metadata stays
docs/content.md and content/clips.json. Work dirs live in `packages/pipeline/work/<slug>/` (gitignored), sources in
`packages/pipeline/work/sources/`. Bucket: `s3://lingo-media-dev-128425594526/clips/`.

Last updated: 2026-10-10 (batch 2).

## Inventory

"Processed" means `prepare` ran with AI glosses and quiz (`--no-publish`) and the work dir with `transcript.json` exists on disk.
"Trim used" is the segment actually cut; it differs from content.md where the planned point fell inside speech.

| # | Slug | Lang | Licence | Source | Segment (content.md) | Trim used | Duration | Source res. | In S3 | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | jung-naiv-drogen | de | CC BY 3.0 | [Commons](https://commons.wikimedia.org/wiki/File:Drogen_-_Jung_&_Naiv_Folge_81_-_YouTube.webm) | 02:00–08:00 (unconfirmed) | — | 6:00 (of 48:33) | 1920×1080 | no | not started; 800 MB source; sensitive topic (drugs) |
| 2 | openhpi-vandalismus | de | CC BY-SA 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:2019-11-13_Gespräch_zu_Vandalismus_–_Trolle,_Hass_und_Fake-News_–_Wie_können_wir_das_Internet_retten%3F_(openHPI).webm) | 00:00–07:00 (unconfirmed) | — | 7:00 (of 18:50) | 960×540 | no | not started; FORMAL; BY-SA → `--vtt-note` |
| 3 | terra-x-friedlaender | de | CC BY 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:Interview_mit_Holocaust-Überlebender_Margot_Friedländer.webm) | 00:00–03:46 | whole file | 3:46 (226.3 s) | 1920×1080 | yes (`.webm`) | **processed** (batch 2, `--reuse` of the orchestrator's re-prepared mezzanine + transcript; no new Transcribe) |
| 4 | terra-x-klimafaktoren | de | CC BY 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:Die_wichtigsten_Klimafaktoren_(ZDF,_Terra_X)_720p_50FPS.webm) | 00:00–07:14 | whole file | 7:15 (434.8 s) | 1280×720 | yes (`.webm`) | **processed** (batch 1) |
| 5 | terra-x-becker-interview | de | CC BY-SA 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:Interview_mit_dem_Virologen_Prof._Stephan_Becker_zur_Corona-Pandemie.webm) | 00:00–04:49 | whole file | 4:49 (289.2 s) | 1280×768 (SAR 273:256) | yes (`.webm`) | **processed** (batch 2); BY-SA `NOTE` in every VTT |
| 6 | terra-x-so-trinken-baeume | de | CC BY 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:So_trinken_Bäume.webm) | 00:00–04:19 | whole file | 4:20 (259.9 s) | 1920×1080 | yes (`.webm`) | **processed** (batch 1); attribution still cut at "Jochen …" (content.md [^g5]) — blocks publish, not prepare |
| 7 | what-to-do-on-a-date-1950 | en | Public domain (US) | [IA](https://archive.org/details/WhattoDo1950) | 00:16–07:55 | 00:16–07:55 | 7:39 (459.0 s) | 640×480 | yes (`.mp4`) | **processed** (batch 2: new Transcribe + timing-only retime) |
| 8 | sprite-fright | en | CC BY 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:Sprite_Fright_-_Blender_Open_Movie-full_movie.webm) | 00:00–06:00 (unconfirmed) | 00:00–06:03 | 6:03 (363.0 s) | 2048×858 (IA .mkv) → 1920×804 | yes (`.mp4`) | **processed** (batch 2) |
| 9 | shy-guy-1947 | en | Public domain (US) | [IA](https://archive.org/details/ShyGuy1947) | 00:00–07:00 (unconfirmed) | 00:16–07:09 | 6:53 (413.0 s) | 640×480 | yes (`.mp4`) | **processed** (batch 1) |
| 10 | cosmos-laundromat | en | CC BY-SA 3.0 (treat as) | [IA](https://archive.org/details/CosmosLaundromatFirstCycle) | 00:00–05:30 (unconfirmed) | — | 5:30 (of 12:10) | 1920×1080 | no | not started; BY-SA → `--vtt-note`; rated 13+ |
| 11 | tears-of-steel | en | CC BY 3.0 | [IA](https://archive.org/details/Tears-of-Steel) | 00:00–04:30 (unconfirmed) | 00:00–04:30 | 4:30 (270.0 s) | 1920×800 (IA 1080p .webm) | yes (`.mp4`) | **processed** (batch 2) but weak: 30 cues, 3 highlights, no quiz — consider a later, denser segment |
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
- The two Terra X clips were uploaded as the original `.webm`, untrimmed (whole file), as `terra-x-friedlaender` was.

## Proposed batch 3

- `openhpi-vandalismus` (de, FORMAL, BY-SA → `--vtt-note`; confirm 00:00–07:00).
- `cosmos-laundromat` (en, BY-SA 3.0 → `--vtt-note`, 13+; confirm 00:00–05:30).
- `jung-naiv-drogen` (de, 800 MB source, sensitive topic; confirm 02:00–08:00, numbers-only).
- Optional: a denser `tears-of-steel` segment, since the current one yields 3 highlights and no quiz.
