# AWS usage — Lingo

Every AWS call Lingo makes, where in the code, why, and roughly what it costs. Judges read this for the AWS Builder mini-challenge;
engineers read it before a run. Prices are the repo's figures and **unverified** until checked against the pricing pages listed below.
LING-005/006/007 merged on 2026-10-02 without adding an AWS call.

## Calls

| Service | API / command | Code | Region | When | Purpose | Approx. cost |
|---|---|---|---|---|---|---|
| S3 | `aws s3 cp <cut> s3://$S3_BUCKET_MEDIA/clips/<slug>.mp4` | batch `upload` stage, `packages/pipeline/src/batch/plan.ts` | eu-central-1 | once per clip | the re-encoded cut that Transcribe and prepare read | storage cents/month |
| S3 | `aws s3 cp s3://…/clips/<slug>.mp4 work/<slug>/source.*` | `packages/pipeline/src/steps/normalize.ts` | eu-central-1 | each prepare without `--reuse` / `--cues` | prepare downloads its own source to build the mezzanine | transfer cents |
| Amazon Transcribe | `StartTranscriptionJob` (de-DE / en-US, `ShowSpeakerLabels`, `MaxSpeakerLabels: 6`), `GetTranscriptionJob` every 5 s (≤ 30 min), HTTPS GET of `TranscriptFileUri` | `packages/pipeline/src/steps/transcribe.ts` | eu-central-1 | once per clip segment; afterwards `transcript.json` is reused (`--reuse`). The batch deletes it only when the segment or source in content/clips.json changes, and the dry run shows that clip under "Transcribe will run for" | word timestamps, punctuation and speaker labels for the target cues | $0.024/min |
| Amazon Translate | `TranslateText` per cue × native, `Settings.Brevity: ON`, `Formality` where the target supports it; two-speaker cues per line; spelled letters not sent | `packages/pipeline/src/steps/translate.ts` | eu-central-1 | every prepare (batch draft and final) | the native line, aligned 1:1 with the target cues | $15 per million characters |
| Amazon Bedrock (Nova Pro v1 default; Nova Lite v1 selectable) | `Converse` with forced tool use, `us.amazon.nova-pro-v1:0` (env `LINGO_AI_MODEL`; older `NOVA_LITE_MODEL_ID` still read); previous cue sent as context (gloss prompt v6) | `packages/pipeline/src/ai/*` | us-east-1 (`us.` inference profile) | batch final phase and spot checks; one call per highlight (gloss) + one per clip (quiz plan); file cache makes repeats free | glosses, grammar notes, examples; quiz plan (items built by code) | ≈ $0.035–0.042 per clip on Nova Pro (measured, decision 0009); Nova Lite measured $0.0010–0.0014 per clip in the first Gate C run |
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

Whether the pipeline runs under `PipelineRole` or the deploying profile: **TBD by human** (the root-keys friction log says deploys ran as
root: docs/friction/2026-10-01-cdk-deploy-as-root-user-cannot-assume-bootstrap-roles.md).

## Declared, not used by Lingo

Kept, not deleted (orchestrator decision 2026-10-01). Nothing in Lingo's code calls these today.

- `@aws-sdk/client-polly` in `packages/pipeline/package.json`, `polly:SynthesizeSpeech` in `PipelineRole`, `POLLY_VOICE_*` in `.env.example`:
  planned "tap to hear" pronunciation of saved words. Still unused: LING-005's Clip word chips are display-only (plan scope), and
  LING-006's phone uses on-device TTS (`expo-speech`, docs/decisions/0011-phone-session-code-access.md).
- Stack `lingo-nova-dev` (us-east-1, bucket `lingo-nova-ingest-<stage>-…`, `infra/lib/nova-ingest-stack.ts`), `S3_BUCKET_NOVA_INGEST` and
  `NOVA_PRO_MODEL_ID`: Nova Pro video ingest, a Described pattern; no Lingo code reads them. Whether `lingo-nova-dev` was deployed: **TBD by human**.

## Cost per clip and for the 12-clip batch (unverified prices)

Per clip: Transcribe `minutes × $0.024` (once) + Translate `seconds × 15 chars/s × natives × $15/M` per phase + Bedrock ≤ $0.005 (final phase).
`pnpm pipeline batch content/clips.json --dry-run` prints the estimate for the actual state of `work/` (constants in
`packages/pipeline/src/batch/estimate.ts`, each with its pricing URL).

| Item | Basis | Estimate |
|---|---|---|
| Transcribe | 58.9 new min (4 217 s of clips; rows 3 and 7 are already transcribed) × $0.024 | $1.41 (all 70.3 min: $1.69) |
| Translate, one native per clip | 4 217 s × 15 ch/s ≈ 63 k chars × 2 phases × $15/M | $1.90 |
| Translate, if tr/ar/uk are added | + 3 × 63 k chars in the final phase | + $2.85 (option, not chosen: natives are en/de for now; `ar` would also need Noto Sans Arabic) |
| Bedrock Nova Pro (default) | 12 × ≤ $0.05 | ≤ $0.60 (Nova Lite: ≤ $0.06) |
| S3 storage and transfer, CloudFront demo traffic | ≈ 1.2 GB cuts + ≈ 2.4 GB HLS (estimate) | cents per month; free-tier coverage to verify |
| **Total** | one native per clip | **≈ $3.9** (four natives ≈ $6.8), below the ~$10 per-run escalation line (docs/KICKOFF.md) |

Pricing pages to verify against (eu-central-1 may differ from us-east-1; Transcribe bills per second with a per-request minimum):
https://aws.amazon.com/transcribe/pricing/ · https://aws.amazon.com/translate/pricing/ · https://aws.amazon.com/bedrock/pricing/ ·
https://aws.amazon.com/s3/pricing/ · https://aws.amazon.com/cloudfront/pricing/

**Actual spend:** TBD by human after the batch final phase — sum of `clip.json.cost.usd` (Bedrock), Transcribe minutes from
`work/batch-report.md`, and Cost Explorer for the month.

## Data flow and naming

- Subtitle text of the CC / public-domain clips goes to us-east-1 for Bedrock (the `us.` cross-region profile). EU-only switch:
  `BEDROCK_REGION=eu-central-1` + `NOVA_LITE_MODEL_ID=eu.amazon.nova-lite-v1:0` (docs/plans/LING-002.md). Media, transcripts and
  translations stay in eu-central-1.
- The media bucket is `lingo-media-<stage>-<account>` (`infra/lib/media-stack.ts`); take the exact name from the `MediaBucket` stack output.

## Tooling

Infra as code: `infra/` (AWS CDK, TypeScript, two stacks). The pipeline is a plain commander CLI (`pnpm pipeline prepare` / `batch`),
no agent framework. Development tools: the repo records Claude Code (commit trailers); whether Kiro Crew and the Amazon Devices
Builder Tools MCP were used: **TBD by human**.

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
