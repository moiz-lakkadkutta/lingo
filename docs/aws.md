# AWS usage — Lingo

Every AWS call Lingo makes, where in the code, why, and roughly what it costs. Judges read this for the AWS Builder mini-challenge;
engineers read it before a run. Prices for Amazon Nova, Amazon Polly, Amazon Transcribe and Amazon Translate were checked on 2026-10-15
against AWS's official pages and the AWS Price List API (sources under "Prices checked 2026-10-15" below); S3 and CloudFront prices are
still the repo's figures and **unverified**.
LING-005/006/007 merged on 2026-10-02 without adding an AWS call.

## Calls

| Service | API / command | Code | Region | When | Purpose | Approx. cost |
|---|---|---|---|---|---|---|
| S3 | `aws s3 cp <cut> s3://$S3_BUCKET_MEDIA/clips/<slug>.mp4` | batch `upload` stage, `packages/pipeline/src/batch/plan.ts` | eu-central-1 | once per clip | the re-encoded cut that Transcribe and prepare read | storage cents/month |
| S3 | `aws s3 cp s3://…/clips/<slug>.mp4 work/<slug>/source.*` | `packages/pipeline/src/steps/normalize.ts` | eu-central-1 | each prepare without `--reuse` / `--cues` | prepare downloads its own source to build the mezzanine | transfer cents |
| Amazon Transcribe | `StartTranscriptionJob` (de-DE / en-US, `ShowSpeakerLabels`, `MaxSpeakerLabels: 6`), `GetTranscriptionJob` every 5 s (≤ 30 min), HTTPS GET of `TranscriptFileUri` | `packages/pipeline/src/steps/transcribe.ts` | eu-central-1 | once per clip segment; afterwards `transcript.json` is reused (`--reuse`). The batch deletes it only when the segment or source in content/clips.json changes, and the dry run shows that clip under "Transcribe will run for" | word timestamps, punctuation and speaker labels for the target cues | $0.006/min (batch, eu-central-1, checked 2026-10-15; the repo used $0.024/min before) |
| Amazon Translate | `TranslateText` per cue × native, `Settings.Brevity: ON`, `Formality` where the target supports it; two-speaker cues per line; spelled letters not sent | `packages/pipeline/src/steps/translate.ts` | eu-central-1 | every prepare (batch draft and final) | the native line, aligned 1:1 with the target cues | $15 per million characters (eu-central-1, checked 2026-10-15) |
| Amazon Bedrock (Nova Pro v1 default; Nova Lite v1 selectable) | `Converse` with forced tool use, `us.amazon.nova-pro-v1:0` (env `LINGO_AI_MODEL`; older `NOVA_LITE_MODEL_ID` still read); previous cue sent as context (gloss prompt v6) | `packages/pipeline/src/ai/*` | us-east-1 (`us.` inference profile) | batch final phase and spot checks; one call per highlight (gloss) + one per clip (quiz plan); file cache makes repeats free | glosses, grammar notes, examples; quiz plan (items built by code) | ≈ $0.035–0.042 per clip on Nova Pro (measured, decision 0009); Nova Lite measured $0.0010–0.0014 per clip in the first Gate C run. Token prices checked 2026-10-15: Nova Pro v1 $0.80 / $3.20 and Nova Lite v1 $0.06 / $0.24 per 1M input / output tokens, us-east-1 on demand |
| S3 | `aws s3 sync work/<slug>/hls s3://…/published/<slug>/ --delete` + `cp` of master playlist, VTTs, clip.json | `packages/pipeline/src/steps/publish.ts` | eu-central-1 | batch final phase | HLS segments (immutable, 1 year) and the 60 s-cached playlist, VTTs and clip manifest | storage cents/month |
| S3 | `aws s3 cp poster.jpg s3://…/published/<slug>/poster.jpg` | batch `publish-extra` stage | eu-central-1 | batch final phase | catalog poster | negligible |
| CloudFront | serves `published/*` from the media bucket (Origin Access Control, HTTPS only, PriceClass 100) | `infra/lib/media-stack.ts` | global | app playback | HLS + WebVTT to the TV | free tier / cents for demo traffic (verify) |
| CloudFormation via CDK | `cdk deploy lingo-media-dev --exclusively` | `infra/` | eu-central-1 | deploys | media bucket, CDN, PipelineRole | free |
| IAM | `PipelineRole` (assumable by the account; S3 read/write, Transcribe, Translate, Polly, Bedrock Converse on `amazon.nova-*`) | `infra/lib/media-stack.ts` | global | defined | least-privilege role for the pipeline | free |

Orchestration is a plain commander CLI (`pnpm pipeline prepare` / `batch`) that runs the steps in order; no agent framework.

Not AWS, listed so every outbound call is in one place: the **Amazon Appstore Receipt Verification Service (RVS)**,
`GET https://appstore-sdk.amazon.com[/sandbox]/version/1.0/verifyReceiptId/developer/<secret>/user/<userId>/receiptId/<receiptId>`
(`apps/api/src/lib/rvs.ts`), called by the API on `POST /iap/verify` and when a purchase is re-verified (verified more than 24 h ago,
at most once an hour per purchase, from `GET /me` and `GET /iap/status`). Sandbox by default (`RVS_ENV`); free. It verifies Lingo Plus
receipts (docs/decisions/0012-lingo-plus.md). LING-005, LING-006 and LING-007 added no AWS call (checked 2026-10-02 over
`git diff f67fd9e..HEAD`): the phone speaks words with on-device TTS, and the TV device id lives on the device.

Which credentials ran the pipeline (checked 2026-10-19 with the AWS CLI): the deploying developer profile, not `PipelineRole`.
CloudTrail in eu-central-1 for `StartTranscriptionJob`, 2026-10-01..2026-10-15, shows 36 jobs: 30 by a shared developer IAM user and 6
(the early ones) by the root user; none by `PipelineRole`. This is a gap: `PipelineRole` exists in the CDK stack but the pipeline never
assumed it, so the least-privilege policy above was defined and not exercised. The early deploys ran as root too (friction log
docs/friction/2026-10-01-cdk-deploy-as-root-user-cannot-assume-bootstrap-roles.md).

## Declared, not used by Lingo

Kept, not deleted (orchestrator decision 2026-10-01). Nothing in Lingo's code calls these today.

- Amazon Polly: **not called anywhere in Lingo's code, so it costs Lingo $0** (re-checked 2026-10-15: no `SynthesizeSpeech` call
  under `apps/` or `packages/`). What remains is declared only: `@aws-sdk/client-polly` in `packages/pipeline/package.json`,
  `polly:SynthesizeSpeech` in `PipelineRole`, `POLLY_VOICE_*` in `.env.example`, for a planned "tap to hear" pronunciation of saved words.
  LING-005's Clip word chips are display-only (plan scope), and LING-006's phone uses on-device TTS (`expo-speech`,
  docs/decisions/0011-phone-session-code-access.md). For reference only, if it were ever used: $4 (Standard), $16 (Neural), $30
  (Generative) and $100 (Long-Form) per 1M characters, us-east-1, checked 2026-10-15 (sources below). Do not list Polly as a Lingo
  service in the submission (docs/submission.md §15 C36).
- Stack `lingo-nova-dev` (us-east-1, bucket `lingo-nova-ingest-<stage>-…`, `infra/lib/nova-ingest-stack.ts`), `S3_BUCKET_NOVA_INGEST` and
  `NOVA_PRO_MODEL_ID`: Nova Pro video ingest, a Described pattern; no Lingo code reads them. `lingo-nova-dev` was **not deployed** (checked 2026-10-19: CloudFormation in us-east-1 lists only `CDKToolkit` and a stack
  unrelated to Lingo; eu-central-1 lists `lingo-media-dev`, CREATE_COMPLETE 2026-10-01, `CDKToolkit` and Described's stacks).

## Cost per clip and for the 12-clip batch (prices checked 2026-10-15; S3 and CloudFront unverified)

Per clip: Transcribe `minutes × $0.006` (once) + Translate `seconds × 15 chars/s × natives × $15/M` per phase + Bedrock ≤ $0.005 (final phase).
`pnpm pipeline batch content/clips.json --dry-run` prints the estimate for the actual state of `work/` (constants in
`packages/pipeline/src/batch/estimate.ts`, each with its pricing URL). That file still uses Transcribe $0.024/min, so its dry run
overstates Transcribe by 4×; fixing the constant is a code change, out of scope for this docs pass.

| Item | Basis | Estimate |
|---|---|---|
| Transcribe | 58.9 new min (4 217 s of clips; rows 3 and 7 are already transcribed) × $0.006 | $0.35 (all 70.3 min: $0.42) |
| Translate, one native per clip | 4 217 s × 15 ch/s ≈ 63 k chars × 2 phases × $15/M | $1.90 |
| Translate, if tr/ar/uk are added | + 3 × 63 k chars in the final phase | + $2.85 (option, not chosen: natives are en/de for now; `ar` would also need Noto Sans Arabic) |
| Bedrock Nova Pro (default) | 12 × ≤ $0.05 | ≤ $0.60 (Nova Lite: ≤ $0.06) |
| S3 storage and transfer, CloudFront demo traffic | ≈ 1.2 GB cuts + ≈ 2.4 GB HLS (estimate) | cents per month; free-tier coverage to verify |
| **Total** | one native per clip | **≈ $2.9**, about 25 cents a clip (four natives ≈ $5.7), below the ~$10 per-run escalation line (docs/KICKOFF.md). Before the 2026-10-15 price check this read ≈ $3.9 (Transcribe at $0.024/min) |

### Prices checked 2026-10-15

The Amazon Nova table on https://aws.amazon.com/bedrock/pricing/ (and https://aws.amazon.com/nova/pricing/) renders with JavaScript and
could not be read as text, so the Nova figures come from AWS's own Price List API for Amazon Bedrock, us-east-1 (publication date
2026-10-14): https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrock/current/us-east-1/index.json. On-demand, USD per 1M
input / output tokens, us-east-1 (US East, N. Virginia), accessed 2026-10-15:

| Model (id in the code) | Price list | `MODEL_PRICES` in `packages/pipeline/src/ai/cost.ts` |
|---|---|---|
| Nova Pro v1 (`us.amazon.nova-pro-v1:0`, default) | $0.80 / $3.20 | matches |
| Nova Lite v1 (`us.amazon.nova-lite-v1:0`) | $0.06 / $0.24 | matches |
| Nova Micro v1 | $0.035 / $0.14 | matches |
| Nova Premier | $2.50 / $12.50 | matches |
| Nova 2 Lite | $0.33 / $2.75 (standard usage type `USE1-Nova2.0Lite-input-tokens`); $0.30 / $2.50 for the separate `cross-region-global` usage type | matches since 505fb1c: `MODEL_PRICES` carries $0.33 / $2.75 for the `us.` profile and `GLOBAL_PRICES` $0.30 / $2.50 for `global.` |

`MODEL_PRICES` now carries `verified: true` for every model, with the prices above (`packages/pipeline/src/ai/cost.ts`, checked 2026-10-15; re-read 2026-10-19).

Others, accessed 2026-10-15:
- Amazon Polly (not used by Lingo), us-east-1: Standard $4, Neural $16, Generative $30, Long-Form $100 per 1M characters —
  https://aws.amazon.com/polly/pricing/ and the Price List API
  https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonPolly/current/us-east-1/index.json.
- Amazon Transcribe, batch, eu-central-1: $0.0001 per second ($0.006 per minute), one rate for all volumes —
  https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/transcribe/current/eu-central-1/index.json (usage type
  `EUC1-TranscribeAudio`); https://aws.amazon.com/transcribe/pricing/ gives the same $0.006 per minute in its US East example.
- Amazon Translate, `TranslateText`, eu-central-1: $15 per 1M characters —
  https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/translate/current/eu-central-1/index.json; https://aws.amazon.com/translate/pricing/.
- Not checked: https://aws.amazon.com/s3/pricing/ · https://aws.amazon.com/cloudfront/pricing/

### Actual spend (Cost Explorer, checked 2026-10-19)

Cost Explorer, usage only, 2026-10-01..2026-10-19. The account is shared with the Described project, so Lingo's share is attributed by
service and usage type:

| Lingo | Actual (USD) |
|---|---|
| Bedrock Nova Pro (input 1.21 + output 0.19) | 1.40 |
| Bedrock Nova Lite | 0.05 |
| Bedrock Nova 2 Lite (Gate C model comparison) | 0.24 |
| Transcribe | 0.46 |
| Translate | 0.00 (within the free tier; no Translate usage charge appears) |
| S3 | ≈ 0.12 (shared with Described, so an upper bound) |
| CloudFront | ≈ 0.00 |
| **Lingo total** | **≈ 2.27** (upper bound, S3 shared) |

Not Lingo (Described and experiments, same account): Qwen3-VL $1.69, TwelveLabs Pegasus $0.09, Mistral Large 3 $0.02, DeepSeek v3.2
$0.21, Polly $1.87, RDS $1.62, Secrets Manager $0.05. Whole account, usage 2026-09-01..2026-10-19: $7.80, fully offset by AWS credits
($0 billed).

Against the estimates: the 12-clip batch was estimated at ≈ $1.56 (Translate ≈ $0.96, Bedrock ≤ $0.60; docs/content-status.md), and
the table above at ≈ $2.9. Transcribe came out lower than the per-batch notes in docs/content-status.md (≈ 88 logged minutes priced at
the old $0.024/min, ≈ $2.11); at the checked $0.006/min those minutes come to ≈ $0.53, close to the $0.46 billed, and the final 12-clip batch ran
no Transcribe (every clip re-ran from its `--cues` file). Translate's estimate is list price; the actual usage fell within the free
tier. Bedrock's $1.69 is higher than the per-clip figures in `clip.json` because Cost Explorer also counts the model evaluation and
Gate C runs (docs/decisions/0009), which no clip ledger includes.

## Data flow and naming

- Subtitle text of the CC / public-domain clips goes to us-east-1 for Bedrock (the `us.` cross-region profile). EU-only switch:
  `BEDROCK_REGION=eu-central-1` + `NOVA_LITE_MODEL_ID=eu.amazon.nova-lite-v1:0` (docs/plans/LING-002.md). Media, transcripts and
  translations stay in eu-central-1.
- The media bucket is `lingo-media-<stage>-<account>` (`infra/lib/media-stack.ts`); take the exact name from the `MediaBucket` stack output.

## Tooling

Infra as code: `infra/` (AWS CDK, TypeScript, two stacks). The pipeline is a plain commander CLI (`pnpm pipeline prepare` / `batch`),
no agent framework. Development tools: the repo records Claude Code (commit trailers).

## Sources
- Word-frequency lists: derived from hermitdave/FrequencyWords (OpenSubtitles 2018), content licensed CC BY-SA 4.0 — https://github.com/hermitdave/FrequencyWords · https://creativecommons.org/licenses/by-sa/4.0/ . Our derived lists (packages/pipeline/data/freq-*.txt) are lemmatized and truncated; they are redistributed under the same licence with this attribution (share-alike).
- Name lists (packages/pipeline/data/names-de.txt, names-en.txt): seeded from the same hermitdave/FrequencyWords (OpenSubtitles 2018) lists, content CC BY-SA 4.0 — https://github.com/hermitdave/FrequencyWords · https://creativecommons.org/licenses/by-sa/4.0/ , then edited by hand (seed rule in packages/pipeline/data/README.md). Redistributed under CC BY-SA 4.0 with this attribution.
- Lemmatizer: simplemma 2.0.0 (MIT) — https://github.com/adbar/simplemma . Used at build/run time; its dictionaries are not vendored.
- Clip video/audio: per-clip licence and attribution recorded in Clip.license / Clip.attribution.

## Bedrock / Nova Lite (LING-002)
- *Prices: the cost ledger (`packages/pipeline/src/ai/cost.ts`) prices each call from `MODEL_PRICES`, keyed by model id without its geo prefix (USD per 1M tokens, input/output, on demand, US East): Nova Micro 0.035/0.14, Nova Lite v1 0.06/0.24, Nova 2 Lite 0.30/2.50, Nova Pro v1 0.80/3.20, Nova Premier 2.50/12.50. Checked 2026-10-15 against the AWS Price List API for us-east-1 (see "Prices checked 2026-10-15"): all match; Nova 2 Lite's `us.` profile costs 0.33/2.75 and its `global.` profile 0.30/2.50, and the code now carries both. Every entry is `verified: true`. Extended-thinking tokens are billed as output tokens.
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
  - Bedrock pricing: https://aws.amazon.com/bedrock/pricing/ (Nova table checked 2026-10-15 through the Price List API, above)
