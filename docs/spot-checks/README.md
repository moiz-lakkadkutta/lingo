# Spot checks

`cli spot-check` takes a `clip.json` (one made with `--no-ai` works too) and asks Amazon Nova Lite for the gloss cards and the quiz plan through the cached AI layer (`packages/pipeline/data/.cache/ai/`, so a rerun only pays for prompts that changed). For each clip it writes `work/<slug>/spot-check.json`, and it writes or appends a rubric sheet (default `work/spot-check.md`) with empty score columns. Run it once per clip, adding `--append` for the second clip:

```
AWS_PROFILE=… pnpm --filter @lingo/pipeline cli spot-check --clip-json work/<slug-1>/clip.json --out work/spot-check.md
AWS_PROFILE=… pnpm --filter @lingo/pipeline cli spot-check --clip-json work/<slug-2>/clip.json --out work/spot-check.md --append
```

Add `--fixture` for an offline dry run that uses stub answers and a throwaway cache. It makes no AWS calls and does not count as a spot check.

The reviewer fills in the score columns, then commits the scored sheet as `docs/spot-checks/LING-002-<yyyy-mm-dd>.md`. The rubric is in `docs/plans/LING-002.md` §8.3–8.5:
- 15 glosses per clip, 30 in total. Each gloss is scored G1 meaning, G2 form, G3 grammar note, G4 example and G5 clean, each 1 or 0. A gloss passes only if all five are 1.
- Each quiz item is scored Q1 single truth, Q2 plausible and Q3 readable.
- Glosses are accepted at ≥ 27 of 30. The quiz is accepted when ≥ 90 % of its items pass.
- If 2 or more glosses fail G5, the ticket fails regardless of the totals.
- The human checks every 0 the reviewer gave, plus 5 random passes.

Record the result under Gate C in `docs/decisions/0001-week0-gates.md` and in `docs/aws.md`.
