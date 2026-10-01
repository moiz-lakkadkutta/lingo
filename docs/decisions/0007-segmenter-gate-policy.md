# 0007 — Segmenter and quality-gate policy on real audio

Status: accepted (LING-001, planner 2026-10-01). Implementation plan: docs/plans/LING-001-gate.md.

## Context

The LING-001 segmenter (`packages/pipeline/src/segment.ts`) and gate (`gate.ts`, called at `prepare.ts:63`) were built on two
synthetic 60-second fixtures with one speaker, clean pauses and one fast run. The first real clips are different:
`jung-naiv-drogen` (docs/content.md #1) is a two-way interview with back-channel overlap, `openhpi-vandalismus` has three
speakers, and de↔en translations run 15–30 % longer than the source. A review raised four issues that need a policy before
real audio runs:

- **M2** `assertGate` is all-or-nothing. One cue the extend/merge pass cannot fix (a fast burst with no following silence; a
  sub-second interjection next to an 84-char sentence; overlapping speech, where the gap trim at `segment.ts:62–65` pushes a
  cue under 1 s) aborts the whole clip. There is no tolerance flag, no drop/split fallback and no manual correction path,
  although PLAN §14 promises "manual VTT correction in the admin CLI".
- **M3** PLAN §12 asks for fixtures with "overlapping speakers"; none exists. `Word.speaker` (`types.ts:29`) is captured
  from Transcribe's `speaker_label` and never used — a speaker change never splits a cue.
- **M4** Native-line limits are warnings only (`prepare.ts:97–101`), and `wrap2` (`segment.ts:72–78`) splits once at the
  midpoint, so a 100-char translation becomes two 50-char lines that fail the 42-char lint.
- **M5** PLAN §2: "the app never spends a highlight on a word below the learner's known band". The pipeline highlights the
  band above the *clip's* level (`NEXT[clipLevel]`); nothing handles the *learner's* band.

Facts the decisions rest on:

- Amazon Transcribe batch output is one time-ordered `results.items` list for the whole channel; with
  `ShowSpeakerLabels` every item (pronunciation *and* punctuation) carries `speaker_label`, and a `speaker_labels.segments`
  section repeats the runs. Overlapping speech therefore arrives *interleaved* in one stream (the other speaker's "Ja." sits
  between two words of the first speaker, with tiny or negative gaps), never as a second track.
  https://docs.aws.amazon.com/transcribe/latest/dg/diarization.html ·
  https://docs.aws.amazon.com/transcribe/latest/dg/diarization-output-batch.html
- The app model is one cue at a time: `Player.tsx` builds `active` from the single cue containing the position, the Explain
  card is per cue, native lines align 1:1 by index, quiz items reference one `cueIndex`. Two simultaneously active target cues
  would break all of that, so cues stay a strictly ordered, non-overlapping sequence (the gate's `order`/`gap` checks).
- PLAN §3 lists "reading speed and line limits enforced by the pipeline (≤ 42 chars/line, 2 lines, ≤ 20 cps, ≥ 1 s per cue)"
  as a *Done* criterion, and the Non-negotiables in docs/PLAN.md repeat it. A cue over the limit is exactly what a jury sees
  on a 3-metre screen.
- Netflix English (USA) Timed Text Style Guide, Dual Speakers: "Use a hyphen without a space to indicate two speakers in one
  subtitle, with a maximum of one speaker per line." Example: `-Are you coming?` / `-In a minute.`
  https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide (the guide PLAN §5
  already cites for 42 chars / 20 cps; the General Requirements article does not carry this rule).
- The kit's `parseVtt` skips `NOTE` blocks, keeps `\n` inside a cue, and leaves a leading `-` alone, so a WebVTT file
  round-trips through any subtitle editor and back into the pipeline.
- The native line renders at 32 px against the target's 44 px (PLAN §7.2), so 42 × 44 / 32 = 57.75 characters of native text
  occupy the same width as 42 characters of target text.

## Options considered

**M2 — what happens when a cue cannot be fixed**

1. `--allow-findings <n>`: publish anyway below a tolerance. Rejected: it contradicts the Done criterion, the flag would be
   used under deadline pressure, and the failing cue is the one the jury sees.
2. Automatic drop of any bad cue. Rejected as a general rule: dropping a 10-word sentence silently loses content and the
   learner sees speech with no caption.
3. Finish the fallback chain in the segmenter (speaker-aware grouping, two-speaker cues, drop of *tiny* unplaceable cues,
   record every drop), keep the gate hard, and give the human the correction path PLAN §14 promises: the pipeline writes the
   target VTT and a gate report *before* failing, the human fixes the VTT in a subtitle editor, and `prepare --cues <file.vtt>`
   resumes from it. **Chosen.**
4. Condense text automatically (Nova rewrite to ≤ 20 cps). Rejected for LING-001: it changes what the learner hears vs reads,
   needs its own quality gate, and the manual path covers the rare cases. Revisit if ≥ 10 % of real cues need it.

**M3 — overlapping speakers**

1. Ignore speaker labels (status quo). Rejected: a cue that mixes two speakers on one line is unreadable and mis-glossed.
2. Emit overlapping cues, one per speaker. Rejected: breaks the one-cue-at-a-time app model (above).
3. Speaker change always starts a new group; an unplaceable short turn becomes a **two-speaker cue** in Netflix form
   (`-Genau.\n-Aber was ist mit den Kosten?`, one speaker per line, ≤ 42 each); words of the next cue that overlap this cue's
   tail cut the cue two frames before the next cue starts; a ≤ 2-word interjection *inside* another speaker's turn is dropped
   and the interrupted sentence rejoined. **Chosen.**

**M4 — native line length**

1. Keep 42 for native too and re-split the target cue when its translation is too long. Rejected: chicken-and-egg (the
   segmenter runs before Translate), doubles Translate calls, non-deterministic.
2. Translate, then condense with Nova. Rejected (see M2.4).
3. Native lines get their own budget derived from the font ratio: **2 lines × 56 characters** (57.75 rounded down for a
   margin), wrapped at the most balanced space like the target; a native cps above 26 (= 20 × 1.3) or a line over 56 stays a
   *warning* in `clip.json.warnings`. Two-speaker cues are translated line by line so the hyphens survive. **Chosen.**
   A 30 % longer translation of an 84-char cue is 109 chars and fits.

**M5 — "never below the learner's band"**

1. Pipeline generates highlights for every learner band. Rejected: 4× gloss cost for words the clip's own learners never
   need, and the 40 % cap is per clip, not per learner.
2. App-side filter. **Chosen.** The pipeline cannot know the learner; the rule is a request-time filter.

## Decision

1. **The gate stays hard for the target track, with no tolerance flag.** `qualityGate` is unchanged. Before `assertGate`
   runs, `prepare()` writes `work/<slug>/<lang>.vtt` (the wrapped target cues), `work/<slug>/dropped.vtt` (cues the segmenter
   dropped, if any) and `work/<slug>/gate.json` (findings with cue text and times, plus the dropped list). The error lists every
   finding with its text and time span and ends with the hint `edit work/<slug>/<lang>.vtt and re-run with --cues <that file>`.
2. **Manual correction = WebVTT, not a bespoke JSON.** `prepare --cues <file.vtt>` skips Transcribe and segmentation, parses
   the file with the kit's `parseVtt` (minDuration 0, mergeGap 0), re-wraps single-line cues with `wrap2`, keeps a `\n` the
   editor wrote as a forced line break, assigns ids `c0…` in time order, and runs the *same* hard gate. When
   `work/<slug>/mezz.mp4` exists it is reused (ffprobe only), and `source.transcribeJob` is read from
   `work/<slug>/transcript.json` when present, else `null`. No AWS call is repeated except Translate (cents).
3. **Tokens come from the final cue text**, not from the timed word stream (`tokenizeCues` replaces `tokenizeWords` in
   `prepare()`), so an edited or dropped cue can never carry tokens or highlights for words it does not show. Sentence-initial
   is the first token of a cue whose previous cue ends in `. ! ? …`, the first token of a hyphenated speaker line, or any
   token after such punctuation inside the cue. `tokenizeWords` stays for callers that have words only.
4. **Speaker policy in the segmenter.** A speaker change (both labels present and different) always flushes the group.
   The merge pass, in order, for a cue that is too short or too fast: same-speaker merge forward, same-speaker merge backward,
   drop an interjection (≤ 2 words, previous and next group share a speaker that differs from this one) and rejoin the
   interrupted sentence when it can be rejoined, two-speaker cue with the next group, two-speaker cue with the previous group,
   drop a ≤ 2-word cue, else leave it for the gate. A two-speaker cue is final (never merged again), has exactly two lines of
   `-` + text, each ≤ 42 chars, ≤ 7 s, ≤ 20 cps and ≥ 1 s. Words of the following cue that overlap this cue's tail cut the
   cue at two frames before the next cue starts (`timing()` owns this; the final gap trim becomes a no-op safety).
   Every drop is recorded in `clip.json.warnings` as `dropped cue <start>–<end> "<text>" (<reason>)` and in `dropped.vtt`,
   so the spot check sees it and the human can restore it via the VTT path.
5. **Native limits: 2 × 56, cps 26, warnings only.** `wrap2(text, maxLine = 42)` gains the parameter; `alignNative` wraps at
   `NATIVE_LINE = 56` and translates two-speaker cues line by line; `checkVtt` takes a limits argument; native findings stay
   in `warnings`. The target track keeps 2 × 42 / 20 cps / 1–7 s as a hard gate.
6. **M5 is app-side**, in the API so TV and phone agree: `GET /clips/:slug` returns a cue's highlights only when
   `rank ≥ BANDS[NEXT[learner.level]][0]` (A1 → 1000, A2 → 2000, B1 → 4000, B2 → 4000), and `wordsYoullMeet` is built from the
   filtered set. `BANDS`/`NEXT` move from `packages/pipeline/src/highlights.ts` to `packages/contracts/src/base.ts` when that
   lands (pipeline re-exports them). The pipeline already never highlights below the *clip's* band; nothing changes there.
   This is a LING-005 follow-up (the Clip/Home ticket owns `GET /clips/:slug`), recorded in TASKS.md, not part of LING-001.
7. **Fixture.** `test/fixtures/dialogue-overlap-de.txt` → `transcribe-overlap-de.json`, generated by `scripts/gen-fixtures.ts`
   with a speaker syntax (`[A]`, `[B+0.05]`, `[B-0.12]`), carrying `speaker_label` on every item and a `speaker_labels`
   section shaped like the AWS example. It exercises: an unplaceable back-channel at clip start, a short turn next to an
   84-char sentence (two-speaker cue), an interjection inside a sentence (drop + rejoin), words that start before the previous
   speaker finished (tail cut), a fast burst with no silence (two-speaker cue), a back-channel at a sentence boundary (drop),
   and plain turn-taking. Expected: 12 cues, 3 drops, zero gate findings, end to end through `prepare()`.

## Consequences

- Real clips with ordinary interview overlap pass without human work; what remains for the human is sustained speech above
  20 cps, which no verbatim caption can satisfy — the standard subtitling answer is condensing, and the VTT path is exactly
  that. Expect a handful of cues per 6-minute interview clip; the spot check budget (PLAN §5) absorbs it.
- A dropped interjection means a second of audio with no caption. Bounded to ≤ 2 words, always logged, always restorable.
- `segment()` keeps its signature and behaviour on unlabelled input (every existing test passes unchanged);
  `segmentWithReport()` is the new entry point `prepare()` uses.
- `prepare()` gains one optional input (`cues`), the CLI one option (`--cues`), `checkVtt` one optional argument,
  `wrap2`/`fits2` one optional parameter. `PreparedClip` does not change.
- Highlight glosses receive the full two-line text of a two-speaker cue as the example sentence; LING-002's prompt sees the
  hyphens. Acceptable for the demo; LING-002 may strip the other speaker's line later.
- `Learner.knownRank` (schema, default 1000) is redundant with `level` under the M5 rule; LING-005 should derive it or drop it.
- Re-running with `--cues` re-translates (Amazon Translate, cents) and re-glosses only uncached words (LING-002 cache).
