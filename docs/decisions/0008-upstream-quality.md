# 0008 — Upstream quality on real audio: pauses, hesitations, names, bands, translation settings

Status: accepted (LING-001, planner 2026-10-01). Implementation plan: docs/plans/LING-001-quality.md. Builds on 0007 (segmenter
gate policy) and 0004 (lemmatizer and frequency data); changes nothing in those decisions.

## Context

The first real two-clip run (`terra-x-friedlaender`, de, CC BY 4.0; `voa-lets-learn-english-01`, en, US public domain) passed
the quality gate on both clips, and every visible problem sits *upstream* of the gate. Measured on the run's own
`transcript.json`/`clip.json` (scratchpad `work/*`, now copied to `packages/pipeline/test/fixtures/real/`):

- Cues ignore silence: 9 of the 58 German cues and 18 of the 46 English cues span a word gap over 0.5 s; the worst bridge
  5.1 s of silence (`Speak … Speak`). The grouping loop in `segment.ts` only looks at characters, duration and cps.
- Amazon Transcribe puts a full stop after hesitations (`hat.`, `aber.`, `Dann.`, `als.`, `Man hat.`, `Ich habe am.`): seven
  German cues are one or two words padded to exactly 1.0 s. The human subtitles of the same clip (Commons TimedText) attach
  `hat` to the clause that follows and let `Ich habe` / `Man hat` occupy their pauses — never a one-word cue. The confidence
  of these words is 0.86–0.99, so confidence cannot detect them; the lowercase word that follows (`hat. im`, `hat. man`,
  `gehen. und`) can.
- The greedy fill leaves orphans at the 7 s limit: `… kannst du auch in` | `Berlin.`, `… Say your` | `name`.
- `tokenizeWords` only knows sentence-initial after `. ! ?`; Transcribe starts capitalised utterances after long pauses
  without a stop, so the English name heuristic (`capitalised and not sentence-initial`) flags Listen, Speak, Say, Now, Nice,
  Fast, A, An, N. Contractions (Let's, Here's, I'm) are unknown to simplemma, which the same heuristic reads as "name".
  The OpenSubtitles list tokenises `i'm` as `i` + `'m`, so `I'm` never has a rank.
- `data/freq-de.txt` has no entry for `sich` (raw rank 46, 533 395 occurrences): `creditLemmas` credits the capitalised lookup
  `Sich → er|es|sie`, which fails `FREQ_TOKEN`. Six `sich` tokens in the German clip count as rank 99 999 and, with the
  ASR errors (`glimmern`, `Schai`), tip the clip from B1 to B2. It is the only pipe lemma in the top 3 000 forms.
- `Margot` (rank 7 491) and `Brasilien` (6 462) are highlighted because they are not in `names-de.txt` and the de fallback
  needs an *unranked* word; `Pete` (1 617 in both lists) only escapes because it is never sentence-initial.
- The English A2 clip has no token with rank ≥ 2 000 at all, so the band above its level (B1) yields 0 highlights.
- Translating one cue at a time gives `Sie` in one cue and `du` in the next, and turns spelled letters (`N A.`) into words
  (`IN EINER.`).
- `00.` (a sound effect) becomes a cue twice.
- Friction: ffmpeg stats and packager INFO lines flood stderr; no per-step timings; re-running after a code change pays
  Transcribe again (the spike needed a throw-away `rerun.ts`).

Facts the decisions rest on:

- Amazon Translate `TranslateText` takes `Settings.Formality` (`FORMAL | INFORMAL`) and `Settings.Brevity` (`ON`).
  Formality is supported for *target* German (also nl, fr, fr-CA, hi, it, ja, ko, pt-PT, es, es-MX) from any source and is
  ignored for other targets; brevity "reduces the length of the translation output … (such as captions, subtitles …)" and is
  supported from any source to de/fr/it/pt/es **and from those languages to English**, i.e. both Lingo directions; an
  unsupported pair "proceeds with the brevity setting turned off".
  https://docs.aws.amazon.com/translate/latest/dg/customizing-translations-formality.html ·
  https://docs.aws.amazon.com/translate/latest/dg/customizing-translations-brevity.html ·
  https://docs.aws.amazon.com/translate/latest/APIReference/API_TranslationSettings.html
- `TranslateText` has no context parameter; the only way to give Translate context is to send more text in one call and
  split the result, which breaks the 1:1 cue alignment the app relies on (0007 context).
- The app does not read `PreparedToken.name` yet (grep of `packages/shared-ui/src`, `apps/api/src`); the flag only drives
  `isCountable` (level, coverage) and `pickHighlights`. A word with rank < 1 000 can never be highlighted (the lowest band
  above any level starts at 1 000), so whether such a word is called a name has no visible effect.
- Node 22 ships full ICU: `Intl.DisplayNames(['de'], { type: 'region' }).of('BR')` → `Brasilien`, `type: 'language'` →
  `Englisch`. Data is Unicode CLDR (Unicode licence, no attribution burden in a text list).
  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DisplayNames
- Wikidata content is CC0; given names are items with `P31 = Q202444` (given name) and subclasses, queryable through
  https://query.wikidata.org/ (https://www.wikidata.org/wiki/Wikidata:Licensing).
- ffmpeg: `-hide_banner`, `-loglevel error`, `-nostats` (https://ffmpeg.org/ffmpeg.html#Generic-options,
  https://ffmpeg.org/ffmpeg.html#Main-options); Shaka Packager: `--quiet` "reduces output verbosity"
  (https://shaka-project.github.io/shaka-packager/html/documentation.html).

## Decisions

1. **Pauses bound cues.** A word gap over `PAUSE_S = 1.0` s always ends an utterance (next to 0007's sentence-end and
   speaker-change flushes). The merge pass of 0007 may still join two groups across a gap of at most `GLUE_GAP_S = 2.0` s;
   it never bridges more. Rationale: the reference subtitles let a short fragment sit over ≈ 1.5 s of silence
   (`Ich habe`, 3.0 s cue) but never bridge the multi-second gaps of the lesson clip.
2. **Hesitation stops are repaired, not displayed.** A trailing `.` on a word whose next word (same speaker) starts with a
   lowercase letter and is not itself a one-word sentence is not a sentence end when the gap is ≤ `PAUSE_S`, or — for a fragment
   shorter than 1 s — ≤ `GLUE_GAP_S`: the stop is removed before segmentation (`hat. man` → `hat man`, `hat. … im Ersten` →
   `hat im Ersten`); a full sentence followed by a lowercase word after a longer pause keeps its stop (`Kartoffeln. … verfaulte`).
   Only `.` is repaired; `!` and `?` are kept. Tokens then come from the repaired cue text (0007 §3), so no token is
   sentence-initial because of a hesitation.
3. **Orphans are glued, never padded when a neighbour fits.** An utterance whose spoken span is under `MIN_S` (1 s) is an
   *orphan*. It is glued to a same-speaker neighbour across a gap ≤ `GLUE_GAP_S` before chunking: an orphan without a
   sentence end prefers the following utterance (it is the start of what follows: `hat im Ersten Weltkrieg …`), an orphan with
   a sentence end prefers the neighbour across the smaller gap. Chunking then re-splits the glued utterance within the
   limits. A chunk split never creates an orphan when another split point exists. An orphan with no eligible neighbour stays
   and is padded as today (`Listen.` between 1.5 s silences is the clip, not a bug).
4. **Overflowing utterances are split in balance, not greedily.** The clause rule of today (split at the first `, ; :` once
   the prefix exceeds 40 characters) is kept — the 0007 acceptance table depends on it — and applies only when the remainder
   is not an orphan. A piece that still breaks a limit (2 × 42, 7 s, 30 cps) is bisected at the split point that best
   balances characters, with a bonus for clause punctuation and the no-orphan rule, recursively. The 84-char/7 s overflow
   therefore never leaves one word for the next cue.
5. **Non-verbal items are dropped and recorded.** A sentence whose words contain no letter (`00.`) is removed before
   segmentation and reported like a 0007 drop (`reason: 'nonverbal'`, in `dropped.vtt` and `clip.json.warnings`). Digits inside
   a sentence (`bis 38`, `1400 Irving Street`) stay.
6. **Sentence-initial knows pauses.** In `tokenizeCues`, the first token of a cue is also sentence-initial when the cue
   starts ≥ `UTTERANCE_GAP_S = 0.5` s (= `PAUSE_S − EXTEND`) after the previous cue ends and the previous cue does not end
   in `, ; :`. A manually corrected VTT (0007 `--cues`) gets the same rule from its timestamps.
7. **English name rule by rank, not by the lemmatizer.** `isName` (en): a listed word is a name; otherwise a capitalised
   word (not `I`, with at least two letters before any apostrophe) is a name when its rank — `rank(lemma)`, else the rank of
   the surface form before the apostrophe (`I'm → i`) — is undefined, or when it is not sentence-initial and the rank is
   ≥ 1 000 (`BANDS.A1[1]`). Capitalised A1 words mid-sentence (`Listen`, `Say`, `Now`, `Nice`, `Fast`, `Street`, `Record`) are
   vocabulary; `Pete` (1 617), `Irving` (8 380), `London` (unranked) remain names. Single letters (`A`, `N`, `N's`) are never
   names. The German rule is unchanged; `known` is no longer consulted.
8. **Names list growth is runtime-only, with a mechanical seed.** The spot-check names from this run are added by hand
   (Margot, Friedländer, Brasilien, Shanghai, Auschwitz, Theresienstadt; Pete, Irving). `scripts/build-names.ts` appends two
   mechanical seeds: every single-token region and language name from `Intl.DisplayNames` (de and en), and Wikidata given
   names whose lowercase form simplemma does not know in that language (so `Bill`, `Rose`, `August`, `Halle` stay vocabulary).
   `names.ts` checks the list before any rank, so the freq lists do not have to be rebuilt for a name to stop being
   highlighted; they are rebuilt once in this ticket anyway (decision 10), which also strips the new names.
9. **Zero highlights is a verdict, not a fallback.** The band is a floor only: `pickHighlights` takes every countable token
   with `rank ≥ BANDS[NEXT[level]][0]`, lowest rank first (so the band just above fills before rarer words), with the same
   2-per-cue / 40 % caps. There is no ceiling at 8 000: `Konsulat` (9 523) and `Holocaust` (15 958) are exactly what a B2
   learner meets in that clip. Nothing is ever picked below the floor. When a clip yields no highlight, `prepare()` succeeds,
   writes the warning `no highlights: no countable token has rank ≥ <lo> (band above <level>); the clip teaches nothing above
   its level — swap it (docs/content.md §8)`, prints every warning, and the ingest checklist treats it as a reject. The level is
   per clip, the band rule is per learner (0007 M5, app-side `rank ≥ BANDS[NEXT[learner.level]][0]`): a learner below the
   clip level sees every pipeline pick, a learner above it sees fewer; with a floor-only band the app filter is a strict
   subset in both cases.
10. **Level and coverage ignore unranked tokens.** `clipLevel`/`coverageRank` run over countable tokens that have a rank; when
    more than 5 % of countable tokens are unranked, `prepare()` warns and lists them (ASR errors or words beyond the top
    20 000). `freq-de.txt` is rebuilt with the `creditLemmas` fix (a capitalised lookup whose lemma contains `|` is ignored,
    so `sich` keeps its own count); `sich` joins the build's sanity list. The names added under decision 8 are stripped in the
    same rebuild.
11. **Translation stays 1:1 per cue; register and length come from Translate's settings.** `translateWithAws` sends
    `Settings: { Brevity: 'ON', Formality: <per clip, default INFORMAL> }`; formality is only attached for the documented
    target languages, brevity always (unsupported pairs ignore it). `PrepareInput.formality` / `--formality` lets a lecture
    clip (`openhpi-*`) ask for `FORMAL`. A cue that is only spelled letters (`A N N A.`) is copied verbatim into every native
    track instead of being translated. Translating with context (whole sentences, then splitting) was rejected: no API support
    for context, word order differs between de and en (verb-final clauses), and the split would be a second heuristic with
    its own failure modes; the gain is small once fragments are rarer (decisions 1–4).
12. **Re-runs reuse the work directory.** `prepare --reuse` takes `transcript.json` and `mezz.mp4` from `work/<slug>/` when
    present (no Transcribe, no download, no ffmpeg; Translate and Bedrock still run unless `--no-ai`). Every step logs its
    elapsed time; ffmpeg runs with `-hide_banner -loglevel error -nostats`, the packager with `--quiet`.
13. **The two real transcripts are regression fixtures.** `test/fixtures/real/transcribe-friedlaender-de.json` (CC BY 4.0,
    attribution in `real/README.md`) and `transcribe-voa01-en.json` (US public domain), `accountId` removed, with lemma
    tables generated by the bridge. The plan lists concrete expectations on both; they are the acceptance test of this ticket.

## Consequences

- Cue counts change on every clip (fewer, longer cues; no padded one-word cues except true isolates). The 60-second English
  fixture has two padded cues that now glue to a neighbour; the overlap fixture of 0007 is unchanged (its timing rule has no
  gap ≥ 1 s and no same-speaker orphan next to a fitting neighbour).
- `segment.ts` is restructured (repair → utterances → glue → chunk → 0007 merge pass → timing). The 0007 merge pass, `timing()`,
  `render()`, two-speaker cues and drops are kept as designed; only the grouping loop is replaced and the merge predicates gain
  a gap bound.
- Ranks shift by one or two positions after the `freq-de.txt` rebuild; no test asserts an absolute rank from the real list.
- A `FORMAL` clip must be declared at ingest; the default is informal, which fits dialogue-driven TV.
- Highlights can now carry ranks above 8 000; glosses for very rare words are a LING-002 prompt concern (the level label
  remains "approximate").
- An unranked common word still signals a frequency-list bug: the warning from decision 10 is the detector.
- Names simplemma knows but the lists miss (a rare first name) are counted as unranked vocabulary, never highlighted; the
  spot check adds them.
- Open for the human: the VOA lesson clip has no vocabulary above A2 and its on-screen UI words (Listen / Speak / Record) are
  transcribed as speech; the pipeline reports 0 highlights and it should be swapped (content register reserve R8/R13 are
  continuous-speech public-domain alternatives).
