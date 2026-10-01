# AWS usage — Lingo

        Every call, why it is load-bearing, and its approximate cost. Kept current; judges read this for the AWS Builder mini-challenge.

        | Service | Region | Used for | Approx. cost |
        |---|---|---|---|
        | Amazon Transcribe | eu-central-1 | Source-language cues with word timestamps | ~$0.024/min |
| Amazon Translate | eu-central-1 | Native-language cue pair, aligned 1:1 | ~$15 / M chars → cents |
| Amazon Bedrock — Nova Lite | us-east-1 | Per-word gloss + grammar note + example; quiz items (JSON schema) | cents per clip |
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
