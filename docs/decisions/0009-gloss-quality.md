# 0009 — Gloss quality: structured cards, code-side checks, model by measurement

Status: proposed (LING-002 Gate C, planner 2026-10-02). Implementation plan: docs/plans/LING-002-gate-c.md. Amends LING-002 §3.1
(gloss prompt), §8.5 (Gate C counting) and §10 open question 1 (model). Builds on 0008 (upstream quality).

## Context

The first real Gate C run (Nova Lite v1, gloss prompt v2, quiz prompt v1, $0.0024 for both clips) scored the English clip
`what-to-do-on-a-date-1950` at about 6/15 glosses and 7/10 quiz items; the target is 27/30 and ≥ 90 % of quiz items. The failures, and the
facts measured on that clip:

- **ASR non-word.** `sal` (Transcribe's mishearing of "sale", confidence 0.158; the three real `sale` tokens are 0.98–0.994) became a
  highlight, a gloss ("der Sal") and a cloze item. simplemma 2.0.0 reports `is_known('sal', 'en') = True` and the OpenSubtitles list ranks
  `sal` 4 972 (the name Sal), so neither the lemmatizer's `known` flag nor the frequency list can reject it. The lowest-confidence correct
  highlight in the clip is `old-timer` at 0.519.
- **Neighbour copying.** Glosses translated the phrase instead of the word: tacks → "mehr Heftklammern", activities → "kommende
  Aktivitäten", expense → "Kosten, nicht viel", swell → "eine tolle Frau", tennis → "Tennisschläger" (racket's gloss). The prompt did not
  mark which occurrence was meant and asked for "the meaning as used in this line" in up to 6 words. The Translate line of each cue
  contains exactly the copied words ("Hast du mehr Tipps?", "Liste kommender Aktivitäten.", "Nicht viel Arrangement").
- **Wrong sense.** old-timer → "ein erfahrener Mensch", although the line before is about an old *thing*.
- **False grammar.** The free-text note said swell has "Komparativ besser", the plural of refreshments is "refreshment", roast's plural is
  "weenie roasts". Free text cannot be checked by code.
- **Wrong-language example** for tennis (German sentence for an English target).
- **Quiz.** A wrong gloss became a meaning item's answer; a cloze item offered `sale` as a distractor for `sal`; the sheet showed 15 rows
  while the quiz used 20 glosses; the CLI echoed the whole sheet including earlier sections.
- Bedrock in us-east-1 (checked 2026-10-02): Nova Micro, Lite v1, Pro v1 on demand; Nova 2 Lite through inference profiles only
  (`us.`/`global.amazon.nova-2-lite-v1:0`); Nova Premier through `us.amazon.nova-premier-v1:0`. Nova 2 Lite supports tool use and optional
  extended thinking (`reasoningConfig`, off by default, reasoning billed as output tokens).
- Prices per 1M tokens (input/output; from secondary sources, the official page could not be read by tool): Lite v1 0.06/0.24,
  Nova 2 Lite 0.30/2.50, Pro v1 0.80/3.20, Premier 2.50/12.50.

## Decisions

1. **ASR errors are filtered before highlighting, by confidence and by a clip-local twin rule, not by a dictionary.** A token with
   Transcribe confidence < 0.4 is never a highlight candidate (it still counts for the level). Independently of confidence, a one-off lemma
   at edit distance 1 from a more frequent lemma of the same clip that follows the same word (`scavenger sal` / `scavenger sale`) is an ASR
   suspect. `PreparedToken` gains an optional `asr` confidence. Rejected: simplemma `known` and the frequency list (both accept `sal`);
   an external dictionary (same problem: `sal` is a real word).
2. **Model: Nova 2 Lite with reasoning off, confirmed by the eval before it becomes the default.** It is the current generation, Lite v1
   is past its EOL floor, and its cost (≈ $0.016 per clip, ≈ $0.19 for the 12-clip catalogue) is negligible. Fallback order if it misses
   the eval bar: Nova 2 Lite reasoning low (≈ $0.034/clip) → Nova Pro v1 (≈ $0.031/clip) → Nova Premier (≈ $0.11/clip). The model id and
   price live in one table keyed by model id; the reasoning level is part of the cache key. The model is not expected to fix copying,
   grammar, language or quiz errors on its own; decisions 3–6 do. Until the eval result is recorded below, Lite v1 stays the default.
3. **The gloss is a structured card, rendered by code.** Prompt v3 sends the line with the target marked `[[word]]`, plus word and lemma,
   and asks for, in this order: `sense` (a short definition in the target language, so the model commits to a sense first), `pos` (enum),
   `gloss` (1–2 learner-language headwords for the marked word only), `register` (enum), the grammar fields that belong to the pos
   (`article`, `plural`, `past`, `participle`, `separable`, `comparative`) and `example`. Three few-shot examples per target language show
   the "gloss only the marked part" rule (winter [[coat]] → "Mantel", not "Wintermantel"). Code renders the grammar note from the fields
   in the learner's language, so a note can only state what the fields say, and a field that does not belong to the pos is dropped. The
   app contract (`Gloss`, `PreparedHighlight`) does not change; the cache stores the card.
4. **Code checks what code can check, and feeds the finding back once.** Hard issues: copy of the word, too many content words for a
   one-word target, a word copied from the cue, a multi-word gloss that shares a stem with the Translate line (neighbour copying), an
   example not in the target language, English plural/comparative/verb forms that fit neither the regular rules nor an irregular table.
   Soft issues (retry, then accept with a warning): example without the word, German form rules. The Translate line is used only for the
   neighbour check and is not sent to the model (it is sometimes wrong: "Tipps" for tacks, "Oldtimer" for old-timer, and it would invite
   copying).
5. **Glossing is clip-aware.** Two highlights in one cue whose glosses overlap (tennis and racket both "Tennisschläger") are each asked once
   more with a hint naming the other word; if they still overlap, both are marked `conflict`. One function (`glossClip`) serves prepare
   and the spot check.
6. **Only clean glosses ship and reach the quiz.** A highlight whose card is rejected twice or stays in conflict is dropped from the clip
   with a warning (a wrong explanation is worse than one highlight fewer). The quiz uses only cards accepted without issues (`ok`), the
   first gloss headword as the option text, lemma-level dedupe, and new distractor rules (no near-spelling or same-lemma cloze option, no
   option already in the cue, no meaning option containing the answer gloss).
7. **Prompt iterations are measured by a gold set; the human gate stays.** A committed English gold set (the 20 highlights of the date
   clip: 19 scored, `sal` expected excluded, two senses marked ambiguous) and a pure scorer check sense (accept/reject lists), pos, forms,
   validity and example language. `pnpm --filter @lingo/pipeline eval:gloss` runs one model configuration in cents. The bar before a human
   scores again is ≥ 18/19, no reject hit, quiz auto-checks all true. Gate C itself is still scored by people (LING-002 §8.3–8.5).
8. **The spot-check sheet is the whole truth, and it prints only what it just wrote.** Rows are every clip highlight (widened to `perClip`
   when fewer), so every quiz gloss is on the sheet; it shows each card's status and sense. The CLI prints only the new section, or with
   `--no-echo` only the summary line (used for clips whose rows should not land in terminal logs).

## Consequences

- Prompt versions: gloss 2 → 3, quiz 1 → 2. Every cached gloss and quiz plan is asked again once (cents).
- The gloss call grows from ≈ 300 to ≈ 960 input tokens (few-shot) and 130 output tokens; with Nova 2 Lite a clip costs ≈ $0.02.
- `PreparedToken.asr` is new and optional; old clip.json files parse; the spot check also filters ASR suspects in old files.
- prepare no longer fails on a twice-rejected gloss; clips may ship with fewer highlights, each drop is a warning the ingest checklist sees.
- Gate C counting changes from "15 per clip" to "every row, ≥ 90 %" if the human accepts it (plan H2).
- German form checks are soft, so German grammar notes rely more on the model than English ones; the German gold set is still to be
  written (plan H5).
- IAM for the pipeline role must allow `amazon.nova-*` foundation models in every Region of the `us.` profile.

## Eval results

To be filled by the implementer after plan §10 step 3: one row per configuration (model, reasoning, prompt version, passed/19, reject hits,
quiz auto-checks, USD), then the chosen default.
