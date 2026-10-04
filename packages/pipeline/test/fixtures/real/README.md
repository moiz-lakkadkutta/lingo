# Real Transcribe fixtures (docs/decisions/0008, decision 13)

Regression fixtures from the first real two-clip run (2026-10-01). They are committed Amazon Transcribe output, never regenerated
by `gen:fixtures --transcribe`; only their lemma tables (`lemmas-*-*.json`) are generated (`gen:fixtures --lemmas`).
Output format: https://docs.aws.amazon.com/transcribe/latest/dg/how-input.html#how-it-works-output

## `transcribe-friedlaender-de.json`

- Amazon Transcribe output (de-DE, speaker labels) for "Interview mit Holocaust-Überlebender Margot Friedländer" (Terra X),
  0:00–3:46 (226.3 s).
- Source: https://commons.wikimedia.org/wiki/File:Interview_mit_Holocaust-Überlebender_Margot_Friedländer.webm
- Licence: **CC BY 4.0** — https://creativecommons.org/licenses/by/4.0
- Attribution (docs/content.md row 3): "ZDF/TerraX/Leonie Schöler/Julia Geiß/Michael Fandel/Benjamin Leng/Margot Friedländer
  Zeitzeugin/Maximilian Mohr — CC BY 4.0".
- The transcript is a machine transcription of the clip's speech and is shared under the same licence, with the same attribution.
- Shape: 428 items, 2 speakers, 19 audio segments.

## `transcribe-voa01-en.json`

- Amazon Transcribe output (en-US, speaker labels) for "Let's Learn English – Lesson 1: Welcome!" (VOA Learning English),
  0:00–5:00 (300.4 s).
- Source: https://learningenglish.voanews.com/a/lets-learn-english-lesson-one/3111026.html
- Licence: **US public domain** (VOA-produced; terms https://learningenglish.voanews.com/p/6021.html).
- Credit: "Voice of America (VOA Learning English)".
- Shape: 244 items, 4 speakers, 43 audio segments. Kept as the regression case for "0 highlights + warning" even if the
  demo clip is swapped.

## Both

- `accountId` removed; `jobName`, `status`, `results` (transcripts, items, speaker_labels, audio_segments) kept verbatim,
  re-serialised as compact JSON with a trailing newline.
- Use: `fixtureDeps(lang, { transcript: 'real/friedlaender' })` / `--fixture real/friedlaender` (and `real/voa01`).
