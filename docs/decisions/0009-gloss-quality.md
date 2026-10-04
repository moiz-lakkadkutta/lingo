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

English gold set `eval/gold/en-de.what-to-do-on-a-date-1950.json` (19 scored items, `sal` excluded), run 2026-10-03 with
`pnpm --filter @lingo/pipeline eval:gloss --quiz`, us-east-1, no cache. Bar (plan §9.4): ≥ 18/19, 0 reject hits, `sal` excluded, all quiz
auto-checks true. USD = one run (19 gloss items with retries and sibling re-asks, plus one quiz call), i.e. about one clip; prices unverified (H4).

| model | reasoning | gloss prompt | passed | reject hits | first try | `sal` excluded | quiz auto-checks | USD |
|---|---|---|---|---|---|---|---|---|
| Nova Lite v1 | – | v3 | 8/19 | 4 | 15/19 | yes | 4/5 | 0.0026 |
| Nova 2 Lite | off | v3 | 11/19 | 1 | 16/19 | yes | 4/5 | 0.0215 |
| Nova Lite v1 | – | v4 | 12/19 | 3 | 13/19 | yes | 4/5 | 0.0031 |
| Nova 2 Lite | off | v4 | 13/19 | 1 | 16/19 | yes | 4/5 | 0.0218 |
| Nova 2 Lite | low | v4 | 14/19 | 1 | 17/19 | yes | 4/5 | 0.0621 |
| Nova Pro v1 | – | v4 | 15/19 | 1 | 16/19 | yes | 4/5 | 0.0346 |
| Nova Lite v1 | – | v5 | 11/19 | 3 | 12/19 | yes | 4/5 | 0.0032 |
| Nova 2 Lite | off | v5 | 12/19 | 1 | 16/19 | yes | 4/5 | 0.0205 |
| Nova 2 Lite | low | v5 | 14/19 | 0 | 18/19 | yes | 4/5 | 0.0621 |
| **Nova Pro v1** | – | **v5** | **16/19** | 1 | 16/19 | yes | 4/5 | 0.0350 |
| Nova Pro v1 | – | v6 | 15/19 | 2 | 14/19 | yes | 4/5 | 0.0424 |
| Nova Lite v1 | – | v6 | 11/19 | 3 | 13/19 | yes | 4/5 | 0.0032 |
| Nova Pro v1 | – | v6 + G-NONWORD | 14/19 | 2 | 14/19 | yes | 4/5 | 0.0424 |
| Nova Pro v1 | – | v7 (expressions, precise first; gold set of 17) | 16/17 | 0 | 13/17 | yes | 4/5 (quiz by code) | 0.0380 |

v3 = the plan's prompt with the plan's validators. Between v3 and v4 the validators gained G-COMPOUND (a gloss compounded from a word of
the line: "Tennisschläger" for tennis, "Baseballspiel") and F-MISSING-en (a noun/verb/adjective card must carry its forms), and the card's
`sense` may run to 20 words (Lite v1 had three good cards rejected twice for a 13-word sense). v4 prompt: decide the referent first, real
and correctly spelled words, all forms of the pos. v5: a second gloss only if it means exactly the same here; plural "in this sense"
("none" for a sport). The only failing quiz check in every run is Q-PASSING-GLOSSES (an option comes from a card that fails S-SENSE),
i.e. a consequence of the gloss failures, not of the quiz code.

Mechanics confirmed on Bedrock: Nova Lite v1 accepts `enum` in the tool input schema (no fallback needed); Nova 2 Lite with
`reasoningConfig` works with `toolChoice: { any: {} }` (the code never sends a forced `tool` choice together with reasoning).

Remaining failures of the best configuration (Pro v1, v5): `sale` → "Verkauf, Ausverkauf" (second gloss is a clearance sale, a reject),
`old-timer` → "Alter, Senior" (person sense; the line alone, "that is an old-timer.", cannot tell, the thing is named in the previous
cue), `roast` → "Bratparty" (not a German word). Failures common to all models: `old-timer` (every model picks the person sense), `sale`
(Ausverkauf), and on the Lite models `tacks` (Nägel/Nadeln), `weenie` (Nova 2 Lite: "Wurstchen" without umlaut), `loafer` (invented words
"Faulenz", "Faulenzerr").

**No configuration meets the bar; two prompt iterations are spent (ORCHESTRATOR §3.4), so this goes back to the human.** Per H1 the default
stays Nova Lite v1. The measurement favours Nova Pro v1 (16/19, ≈ $0.035 per clip, ≈ 13× Lite v1, still cents), then Nova 2 Lite
reasoning low (14/19, 0 reject hits, ≈ $0.062 per clip). Nova 2 Lite with reasoning off (12–13/19) does not justify replacing Lite v1 on
its own. The largest single remaining gap is sense selection that needs the neighbouring cue (`old-timer`); sending the previous cue as
context is the next candidate change (not in this plan).

### Round 2 (2026-10-04, the one further iteration the human approved)

Approved: Nova Pro v1 becomes the default for gloss and quiz (`AI_MODEL_ID_DEFAULT = us.amazon.nova-pro-v1:0`, priced in `MODEL_PRICES`;
Lite v1 stays selectable with `LINGO_AI_MODEL`). Prompt v6 sends the previous cue as `"previous"`, marked context only (never glossed);
it is part of the cache key, the first cue sends none, and its Translate line is not sent and not used by any validator (decision 4), so
G-NEIGHBOUR and G-SOURCE only ever look at the current line.

Validator change: G-COMPOUND now uses the German head-last rule. It rejects a gloss that starts with the target itself plus ≥ 4 letters
("Tennisschläger" for tennis, "Baseballspiel" for baseball) or ends with another word of the line, and allows one that starts with a
neighbour, since its head is then the target's translation ("Tennisschläger" for racket). This removes the conflict with the gold set,
which accepts "tennisschläger" for racket.

Gold-set review (no item loosened):
- `prevCue` added to every item (the cue before, copied from clip.json), so the eval sends the same context as prepare. Additive.
- `baseball` plural stays `none`. In "go to a baseball game" the word names the sport, an uncountable noun; "baseballs" is the plural of
  the other sense (the ball). The prompt asks for the plural in this sense, and Pro v1 answers "none" in v5 and v6.
- `sale`: "Ausverkauf" stays a reject. It is a shop selling off its stock at reduced prices (seasonal or closing-down clearance, the usual
  1950s sense too), while a scavenger sale is a club selling collected, donated things to raise money. A learner would read the line as
  a discount sale. This is a judgement the human may overrule; it is the only reject hit of Pro v1 apart from `old-timer`.
- `racket` keeps "tennisschläger" in accept (now consistent with G-COMPOUND).

Result: Pro v1 v6 15/19 (v5: 16/19). The previous cue did not fix `old-timer`: the sense became "a person or thing that is very old"
with "Altes, Veteran" ("Veteran" is a reject). Pro v1 v6 failures: `sale` (Ausverkauf as the second gloss), `scavenger` ("Flohmarkt":
it glossed the phrase "scavenger sale", i.e. the neighbour), `old-timer` (Veteran), `roast` ("Bratfest", not a German word). Lite v1 v6
failures: tennis, baseball and inexpensive rejected twice (missing plural; "Baseballspiel (Sport)"; comparative "less expensive"),
swell "tollerisch", old-timer "Alter, Veteran", tacks "Nägel, Hefte", roast "braten", weenie "Mini-Hot-Dog". The bar (18/19) is not met
by any configuration; the approved iteration is used up. The default is Nova Pro v1 as approved.

### Round 3 (2026-10-04): G-NONWORD, then human scoring

The human moved Gate C to human scoring; the eval stays a guide. New hard rule G-NONWORD (native de): every German gloss word of ≥ 4
letters (outside parentheses, hyphen parts one by one) must be in data/freq-de.txt (any rank), known to simplemma (de), or a compound of a
lemma (freq list, or its own simplemma lemma) and a common head (the head or its lemma in the freq list, same word class; derivational
endings such as -chen, -ling, -keit are never heads). Checked against the real lists: it rejects "Bratfest" ("Brat" is only a form of
braten), "tollerisch", "Faulenzerr", "Faulling", "Wurstchen", "Bratparty" and accepts "Tennisschläger", "Würstchen", "Heftzwecke",
"Ausflug", "Flohmarkt", "Reißzwecken", "Grillfest", "Altwarensammler". Example changed: "Faulenz" cannot be caught, because simplemma
knows it as a form of faulenzen (a real word, wrong as a noun gloss). Gold accept words it would reject: "Altertümchen", "Cookout".

Pro v1 v6 + G-NONWORD: 14/19. `roast` "Bratfest" was retried into "Bratwurstparty" (a real compound, still not in accept); `tennis` was
rejected twice this run ("Tennis" without clarifier and no plural; it passed in the previous Pro v6 run, so this is run-to-run variance
at temperature 0); `sale`, `scavenger`, `old-timer` as before.

### Round 6 (2026-10-05): fixed expressions, most precise gloss first, quiz planned by code

- **Fixed expressions.** `packages/pipeline/data/phrases-en.txt` (hand-written: scavenger sale, get acquainted, old-timer, weenie roast,
  fix up, wagon train, and phrasal verbs from the date clip; `phrases-de.txt` is an empty seed) lists expressions, each with an optional
  sense note. A highlighted token inside a listed expression becomes one highlight for the whole span (`phrase: true`), in prepare and in
  the spot check (which also applies it to older clip.json files). The prompt (gloss v7) marks the span `[[scavenger sale]]` and asks for
  pos "phrase"; a phrase card has no grammar forms, up to 4 words per gloss, and the span is the target for G-SOURCE and G-COMPOUND.
  G-NEIGHBOUR is skipped for phrases: the expression's own translation is a multi-word part of the native line, which the rule cannot
  tell from a neighbour's. The app aligns a multi-word highlight on its consecutive words (one chip per word, same highlight).
- **Quiz rule for phrases:** meaning items only (no cloze); distractors are other phrase cards, or noun cards when fewer than 3 phrases
  exist (implemented as: a phrase accepts phrase or noun distractors; the code planner tries phrases first in clip order).
- **Most precise gloss first.** The prompt asks for glosses from the most specific to the most general word. Code moves a later gloss
  in front of an earlier one when it is a compound ending in it with a modifier of ≥ 4 letters that is not a prefix ("Pinnnadel" before
  "Nadel"; "Ausverkauf" is not moved before "Verkauf"). No hypernym dictionary is available, so "Nadel, Reißzwecke" relies on the
  prompt alone.
- **Quiz from code only.** Nova Pro v1 produced zero valid quiz plans in three real runs (each time both attempts broke the
  part-of-speech, count or spread rules), so the deterministic planner is now the quiz builder and no Bedrock call is made for the quiz.
  The model path stays behind `LINGO_AI_QUIZ=model`; the quiz result reports its `source` (code / model / fallback).
- **Gold set** (all five marked "needs human confirmation"): `scavenger` + `sale` → `scavenger sale` (accept Wohltätigkeitsbasar, Basar,
  Trödelmarkt, Flohmarkt, …), `wagon` → `wagon train`, `old-timer` → expression item (accept Oldtimer, altes Auto, …; reject Veteran,
  Urgestein, Altes), `acquainted` → `get acquainted` (accept sich kennenlernen, kennenlernen, …), `weenie` + `roast` → `weenie roast`.
  17 scored items. The eval scores the displayed (first) gloss only, as the app shows only that one since round 5.
- Pro v1 v7: 16/17, 0 reject hits; the one failure is `tacks` → "Nadel" (the precise "Reißzwecke" came second). In the spot check run
  the same model put "Reißzwecke" first: the order still varies between runs.

