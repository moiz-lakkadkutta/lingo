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
| Strands Agents (TS) | — | Orchestrates prepare pipeline | — |
| AWS CDK | — | `infra/` | — |

        Infra as code: `infra/` (AWS CDK, TypeScript). Dev tooling: Claude Code, Kiro Crew, Amazon Devices Builder Tools MCP.
