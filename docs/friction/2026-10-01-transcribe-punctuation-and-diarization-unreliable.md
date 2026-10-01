# transcribe punctuation and diarization unreliable

Task attempted: Build subtitle cues for two real clips from Amazon Transcribe batch output, using its punctuation as
sentence ends and its speaker labels as speaker changes (LING-001 segmenter, decisions 0007 and 0008).
Steps:
  1. Batch jobs in eu-central-1 on 2026-10-01: `terra-x-friedlaender` (de-DE, speaker labels on) and
     `voa-lets-learn-english-01` (en-US, speaker labels on).
  2. Segment cues from the `items` (pronunciation + punctuation) and `speaker_labels` in `transcript.json`.
  3. Compare the German cues with the human subtitles of the same clip (Wikimedia Commons TimedText).
Expected: A full stop marks a sentence end; a long pause before a new capitalised utterance carries a stop; non-speech is
not transcribed as words; one phrase keeps one speaker label.
Actual:
  - Full stops at hesitations: `hat.`, `aber.`, `Dann.`, `als.`, `Man hat.`, `Ich habe am.` followed by a lowercase word
    (`hat. im`, `hat. man`, `gehen. und`). Seven German cues became one or two words padded to 1.0 s. The words' confidence
    was 0.86–0.99, so confidence cannot detect them. The human subtitles never split there.
  - The opposite case: after multi-second pauses, Transcribe starts a new capitalised utterance with no stop before it
    (VOA lesson: `Listen`, `Speak`, `Say`, `Now`). One cue bridged 5.1 s of silence, and a name heuristic read these words
    as names.
  - A sound effect was transcribed as `00.` and became a cue twice.
  - Diarization flipped the label for one word inside a phrase: `my new` (spk_0) | `apartment.` (spk_1), which produced a
    two-speaker cue `-my new` / `-apartment.`.
Severity: Medium — the quality gate passed but the cues were visibly poor; a full planning and implementation cycle went
into repair rules (decision 0008: pause-bounded cues, hesitation-stop repair, non-verbal drop, orphan glue) and a guard in
`segment.ts` for one-word label flips. Every clip still needs a human spot check.
Workaround: Punctuation and labels are treated as hints. A `.` followed by a lowercase word within 1.0 s is removed; a word
gap over 1.0 s always ends an utterance; sentences without letters are dropped and logged; a label flip that ends a phrase
mid-clause is not treated as a speaker change. A manual `--cues` VTT path exists for corrections.
Suggestion: Expose a per-item "punctuation confidence" or a pause/hesitation marker, so clients can tell a sentence end from
a disfluency; offer an option to suppress non-speech tokens; apply a minimum segment length to speaker turns.
Environment: Amazon Transcribe batch (StartTranscriptionJob), de-DE and en-US, eu-central-1, 2026-10-01; macOS 26.2,
Node 22.19.0.
Links:
  - Speaker diarization: https://docs.aws.amazon.com/transcribe/latest/dg/diarization.html
  - Diarization batch output format: https://docs.aws.amazon.com/transcribe/latest/dg/diarization-output-batch.html
  - Decisions: `docs/decisions/0007-segmenter-gate-policy.md`, `docs/decisions/0008-upstream-quality.md`
  - Fixtures: `packages/pipeline/test/fixtures/real/`
