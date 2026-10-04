# AWS usage — Lingo

        Every call, why it is load-bearing, and its approximate cost. Kept current; judges read this for the AWS Builder mini-challenge.

        | Service | Region | Used for | Approx. cost |
        |---|---|---|---|
        | Amazon Transcribe | eu-central-1 | Source-language cues with word timestamps | ~$0.024/min |
| Amazon Translate | eu-central-1 | Native-language cue pair, aligned 1:1 | ~$15 / M chars → cents |
| Amazon Bedrock — Nova Pro v1 (default; Lite v1 selectable) | us-east-1 | Per-word gloss + grammar note + example; quiz plan (which highlights, which distractors; items built by code). Converse + forced tool use, `us.amazon.nova-pro-v1:0` (env `LINGO_AI_MODEL`, older `NOVA_LITE_MODEL_ID`); file cache keyed by (lemma, cue) | ~$0.01 per 6-min clip (≈40 glosses + 1 quiz plan)* |
| Amazon Polly (neural) | eu-central-1 | Pronunciation of saved words | cents |
| Amazon S3 + CloudFront | eu-central-1 | Clips + VTT delivery | cents |
| Amazon Appstore IAP (RVS) | — | Lingo Plus receipt verification (sandbox) | — |
| Pipeline orchestration | — | `packages/pipeline` is a plain commander CLI (`pnpm pipeline prepare`) that runs the steps in order; no agent framework | — |
| AWS CDK | — | `infra/` | — |

        Infra as code: `infra/` (AWS CDK, TypeScript). Dev tooling: Claude Code, Kiro Crew, Amazon Devices Builder Tools MCP.

## Sources
- Word-frequency lists: derived from hermitdave/FrequencyWords (OpenSubtitles 2018), content licensed CC BY-SA 4.0 — https://github.com/hermitdave/FrequencyWords · https://creativecommons.org/licenses/by-sa/4.0/ . Our derived lists (packages/pipeline/data/freq-*.txt) are lemmatized and truncated; they are redistributed under the same licence with this attribution (share-alike).
- Name lists (packages/pipeline/data/names-de.txt, names-en.txt): seeded from the same hermitdave/FrequencyWords (OpenSubtitles 2018) lists, content CC BY-SA 4.0 — https://github.com/hermitdave/FrequencyWords · https://creativecommons.org/licenses/by-sa/4.0/ , then edited by hand (seed rule in packages/pipeline/data/README.md). Redistributed under CC BY-SA 4.0 with this attribution.
- Lemmatizer: simplemma 2.0.0 (MIT) — https://github.com/adbar/simplemma . Used at build/run time; its dictionaries are not vendored.
- Clip video/audio: per-clip licence and attribution recorded in Clip.license / Clip.attribution.

## Bedrock / Nova Lite (LING-002)
- *Prices: the cost ledger (`packages/pipeline/src/ai/cost.ts`) prices each call from `MODEL_PRICES`, keyed by model id without its geo prefix (USD per 1M tokens, input/output, on demand, US East): Nova Micro 0.035/0.14, Nova Lite v1 0.06/0.24, Nova 2 Lite 0.30/2.50, Nova Pro v1 0.80/3.20, Nova Premier 2.50/12.50. **None of these figures has been checked against the pricing page** (all `verified: false`; plan LING-002-gate-c H4) — verify at https://aws.amazon.com/bedrock/pricing/ (Amazon Nova tab). Extended-thinking tokens are billed as output tokens. `clip.json.cost` is an estimate until then.
- Request shape: Converse with one `toolSpec` and `toolChoice.tool` (forced tool use), `temperature: 0`; Zod validates the tool input; one retry with the validation issues, then a gloss fails the clip and a quiz falls back to a deterministic builder. SDK retries (`standard`, 5 attempts) cover throttling and 5xx.
- Switching models is `LINGO_AI_MODEL` (e.g. `us.amazon.nova-2-lite-v1:0`; the older `NOVA_LITE_MODEL_ID` is still read as a fallback); a model without a `MODEL_PRICES` entry is refused. `LINGO_AI_REASONING=low|medium` turns on Nova 2 Lite extended thinking (`reasoningConfig` in `additionalModelRequestFields`, gloss maxTokens 2000; part of the cache key). Nova 2 Lite is only reachable through inference profiles (`us.`/`global.`), and a `us.` profile routes to us-east-1, us-east-2 and us-west-2, so the pipeline role allows `arn:aws:bedrock:*::foundation-model/amazon.nova-*` (https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-prereq.html).
- Model choice is measured, not assumed: `pnpm --filter @lingo/pipeline eval:gloss` on the English gold set; results per model in docs/decisions/0009 (Eval results). Since 2026-10-04 the default is Nova Pro v1 (`us.amazon.nova-pro-v1:0`, best in the eval, ≈ $0.035–0.042 per clip, approved by the human); Lite v1 stays selectable with `LINGO_AI_MODEL=us.amazon.nova-lite-v1:0`.
- Spot check (quality gate C): `pnpm --filter @lingo/pipeline cli spot-check --clip-json work/<slug>/clip.json`; see docs/spot-checks/README.md. Result: pending.
- Docs read:
  - Converse API reference: https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html
  - Nova Lite model card: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-lite.html
  - Nova tool definition (toolChoice, inputSchema limits, temperature 0): https://docs.aws.amazon.com/nova/latest/userguide/tool-use-definition.html
  - Nova structured output via tool use: https://docs.aws.amazon.com/nova/latest/userguide/prompting-structured-output.html
  - Nova complete request schema: https://docs.aws.amazon.com/nova/latest/userguide/complete-request-schema.html
  - Nova with the Converse API: https://docs.aws.amazon.com/nova/latest/userguide/using-converse-api.html
  - Bedrock structured outputs (Nova Lite not supported, hence tool use): https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html
  - Inference profiles and Regions: https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html
  - Inference profile IAM prerequisites: https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-prereq.html
  - AWS SDK retry behaviour: https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html
  - Bedrock pricing (to verify): https://aws.amazon.com/bedrock/pricing/
