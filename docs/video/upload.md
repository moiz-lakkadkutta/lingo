# Lingo: YouTube upload checklist

Step-by-step upload of the LING-009 demo video, due **Oct 20** (docs/submission-checklist.md). Rules (https://amazonappdev2026.devpost.com/rules, checked 2026-10-14): **public** on YouTube or Vimeo, in English, under 3 minutes, Lingo shown on a real Fire TV device or the Fire TV / Vega simulator.

## 1. Before you open YouTube

- [ ] `scripts/check-video.sh lingo-final.mp4` → Result OK: under 180 s, 1080p H.264, I within −15..−13 LUFS.
- [ ] `scripts/check-video.sh --srt docs/video/lingo.srt` → "caption rules hold" (after your timing nudges).
- [ ] The Reviewer has watched the cut against docs/submission.md §15.
- [ ] Every line in the description below that names a feature still matches what the cut shows (delete the IAP line if S07b was cut).

## 2. Upload (YouTube Studio → Create → Upload videos)

| Field | Value |
|---|---|
| File | `lingo-final.mp4` (captions burnt in, −14 LUFS) |
| Title (≤ 100 characters) | `Lingo: learn German from the TV you already watch (Fire TV + Vega demo)` |
| Description | §3 below, pasted as it stands (≈ 2,000 characters; limit 5,000) |
| Thumbnail | A still from S05: Explain card on the TV with the phone in frame |
| Playlist | none |
| Audience | **No, it's not made for kids** |
| Age restriction | none |
| Show more → Paid promotion | not ticked |
| Show more → Altered content | **No** (real footage, no synthetic people or events) |
| Show more → Tags | §4 below |
| Show more → Language | Video language **English**; caption certification "None" |
| Show more → License | Standard YouTube License |
| Show more → Category | Science & Technology |
| Show more → Comments | on (optional) |
| Video elements → Subtitles | Add → **English** → Upload file → **With timing** → `docs/video/lingo.srt` → Publish |
| Checks | wait for "No issues found" (copyright check). A Content ID claim on the clip footage: dispute with the CC BY 4.0 attribution from §3 |
| Visibility | **Public** → Publish (not Unlisted, not Scheduled) |

## 3. Description (paste)

```text
Lingo is a Fire TV app for adults learning German or English from TV they already watch. Two subtitle lines (German large and bright, English small), one marked word per line at your level, a pause that explains the word, and a phone that saves it within a second and quizzes you the next day.

Shown in this video: Lingo on a Fire TV Stick (Fire OS) and Lingo Home on the Vega Virtual Device (Vega support is experimental; no video playback on Vega yet).

Built for Build, Ship, Shape: Amazon Developer Hackathon.

Code (MIT): https://github.com/moiz-lakkadkutta/lingo
Player and subtitle library (MIT): https://github.com/moiz-lakkadkutta/vega-media-kit

AWS services used:
- Amazon Transcribe: the German line with word timings
- Amazon Translate: the English line, one-to-one with the German cues
- Amazon Bedrock (Amazon Nova Pro): glosses and grammar notes for the marked words
- Amazon S3 and Amazon CloudFront: HLS video and subtitle files for the TV
- AWS CDK (AWS CloudFormation, IAM): the media stack
Lingo Plus uses Amazon Appstore in-app purchasing, shown in sandbox (App Tester).

Chapters
0:00 Save a word from the TV to the phone
0:20 Why TV
0:30 Fire TV home screen
0:45 Two subtitle lines
1:00 Pause and explain
1:12 Quiz on the phone
1:36 The AWS pipeline
2:04 Fire OS and Vega
2:28 Who it's for

Demo clip: "Interview mit Holocaust-Überlebender Margot Friedländer (Terra X)", ZDF/TerraX/Leonie Schöler/Julia Geiß/Michael Fandel/Benjamin Leng/Margot Friedländer Zeitzeugin/Maximilian Mohr — CC BY 4.0 (https://creativecommons.org/licenses/by/4.0). Source: https://commons.wikimedia.org/wiki/File:Interview_mit_Holocaust-Überlebender_Margot_Friedländer.webm
Excerpt, trimmed; subtitles and glosses added by Lingo.

Sources: ¹ AGF Videoforschung, TV year 2024 (press release 2025-01-08). ² Broadcast subtitle guidelines: 42 characters per line, 20 characters per second. ³ BAMF, Integrationskursgeschäftsstatistik 2024.
Levels in Lingo are approximate CEFR levels from word frequency. Music: none.
```

Edit before pasting:
- S07b cut (no App Tester dialog in the video) → delete the line "Lingo Plus uses Amazon Appstore in-app purchasing…".
- Chapters must match the final cut (YouTube needs the first at 0:00, at least three, each ≥ 10 s). If S07b was cut, "2:04 Fire OS and Vega" stays; if you moved shots, re-time them.
- If the S08 fallback (code-layout card, no VVD) was used → replace the second paragraph with "Shown in this video: Lingo on a Fire TV Stick (Fire OS). The same UI package builds for Vega; Vega support is experimental."
- Check the length after edits: `pbpaste | wc -m` must be under 5000.

## 4. Tags (paste, comma separated)

```text
Lingo, Fire TV, Fire OS, Vega OS, Amazon Developer Hackathon, language learning, learn German, subtitles, dual subtitles, Amazon Transcribe, Amazon Translate, Amazon Bedrock, Amazon Nova, AWS CDK, React Native, spaced repetition
```

## 5. After publishing

- [ ] **Logged-out playback check:** open the URL in a private / incognito window (not signed in) and on a phone on mobile data. It plays, the title and description show, and **CC → English** lists the uploaded track.
- [ ] Studio → Content: Visibility reads **Public**, Restrictions reads **None** (no "Made for kids", no copyright block).
- [ ] Duration on the watch page reads under 3:00.
- [ ] Paste the URL (the short `https://youtu.be/<id>` form) in both places:
  1. `docs/submission.md` §13 "Links", the line `- Video: <!-- HUMAN: … -->` → `- Video: https://youtu.be/<id>`;
  2. `docs/video-script.md` §5 "Edit and export", the last checkbox's `<!-- HUMAN: … -->` note → the same URL, and tick the box.
- [ ] Update docs/submission.md §15 row C34 (Video link) from "Not shot" to the URL, and tick the Oct 20 upload line in docs/submission-checklist.md.
- [ ] Paste the same URL in the Devpost "Video demo link" field.
