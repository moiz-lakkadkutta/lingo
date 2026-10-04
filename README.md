# Lingo

**Learn a language from the TV you already watch — on Fire TV (Vega OS: experimental), with your phone as the notebook.**
Two subtitle tracks (target language large and bright, native language small and cool), a pause that explains the line,
one or two highlighted words at your level per cue, and a phone that saves what you tap and quizzes you tomorrow with
literal SM-2 spacing. Clips are 3–8 minutes; a session is one clip and a two-minute quiz.

Built for the [Build, Ship, Shape: Amazon Developer Hackathon](https://amazonappdev2026.devpost.com/) — Fire TV track,
AWS Builder and Open Source mini-challenges. Shares [`@moizp/vega-media-kit`](https://github.com/moiz-lakkadkutta/vega-media-kit)
with [Described](https://github.com/moiz-lakkadkutta/described). MIT. Demo clips are CC BY / CC BY-SA / public domain.

## Status (2026-10-02)

| Part | State | Evidence |
|---|---|---|
| Fire OS app (`apps/expo`, react-native-tvos) | Player done (LING-003); **device spike S1 pending** (remote events and word-chip focus on the stick) | [docs/spikes/S1-fire-os-remote.md](docs/spikes/S1-fire-os-remote.md) |
| Vega OS app (`apps/vega`) | **Experimental**: installs, typechecks and bundles for `--platform kepler` without the SDK; not run on a device or the Virtual Device; no video playback until the kit's Vega adapter is rewritten (KIT-010): the Player, the Words mini player and Quiz replay show a message instead | [apps/vega/README.md](apps/vega/README.md) |
| Pipeline (`packages/pipeline`) | Gate A **passed** 2026-10-02 on two real clips; Gate C (Nova Lite gloss and quiz quality) **pending — not passing** on the first run | [docs/decisions/0001-week0-gates.md](docs/decisions/0001-week0-gates.md), [docs/spot-checks/2026-10-02-gate-c.md](docs/spot-checks/2026-10-02-gate-c.md) |
| Clips | 0 of 12 published. The batch runner is ready (`pnpm pipeline batch content/clips.json`); the AI + publish phase waits for Gate C. If Gate C is not passing by Oct 13, the fallback is the human's decision (ship draft clips without glosses, move the freeze, or publish only clips that pass a spot check) | [content/clips.json](content/clips.json), [docs/plans/LING-008.md](docs/plans/LING-008.md) §2 |
| TV screens: first run, Home, Clip, Summary, Quiz, Words, Settings | **Code done, not checked on a device** (LING-005): placement, focus memory, level rule, TV quiz, saved words; device checklist pending <!-- LING-005: device screenshot slot --> | [decision 0010](docs/decisions/0010-tv-navigation-focus-memory-and-level-rule.md), [0014](docs/decisions/0014-per-install-tv-device-id.md), [review](docs/reviews/2026-10-02-ling-005.md) |
| Phone (`apps/phone`) | **Code done, not checked on a device** (LING-006): Join (QR or code), Live words, Quiz (SM-2 on the server, result mirrored to the TV), Progress; on-device TTS, no Polly. EAS builds and device steps pending <!-- LING-006: device evidence slot --> | [decision 0011](docs/decisions/0011-phone-session-code-access.md), [review](docs/reviews/2026-10-02-ling-006.md) |
| Lingo Plus (Amazon Appstore IAP + RVS sandbox) | **Code done, not checked on a device** (LING-007): Plus screen and purchase/restore flow on both OSes (react-native-iap on Fire OS, the Vega IAP library), server-side RVS verification and entitlement. App Tester / RVS sandbox run pending — screenshot or log slot <!-- LING-007: sandbox evidence --> | [decision 0012](docs/decisions/0012-lingo-plus.md), [review](docs/reviews/2026-10-02-ling-007.md) |
| Content Launcher · Personalization · Media Controls | **Code done, not checked on a device** (LING-007): launch intents open a clip (Fire OS deep link `lingo://clip/<slug>`; Vega Content Launcher handler in `apps/vega`); Personalization and Media Controls go through the kit, whose bindings are still no-ops (KIT-007, escalations E1–E4 in TASKS.md). Screenshot or log slot each <!-- LING-007: device evidence --> | [decision 0012](docs/decisions/0012-lingo-plus.md), [plan](docs/plans/LING-007.md) |

## Run it (10 steps)

Steps 1–6 need no AWS account and no device. They were not all run as written here: the 2026-10-01 fresh-clone check (Linux, Node 22)
had no Docker daemon, so step 3's `pnpm db:up` did not run and the database steps used a natively installed Postgres 16 instead.

1. Prerequisites: Node 22 (`.nvmrc`), pnpm 9.15.9 (`corepack enable`), Docker, Python 3. Clone `lingo` and
   [`vega-media-kit`](https://github.com/moiz-lakkadkutta/vega-media-kit) side by side, then `cd vega-media-kit && pnpm i && pnpm build`.
2. `cd lingo && pnpm i && pnpm db:generate`
3. `cp .env.example .env && set -a && . ./.env && set +a && pnpm db:up && pnpm db:migrate` — the API and Prisma read the environment,
   not the root `.env` file, so export it in every shell you use.
4. `python3 -m venv .venv-lemma && .venv-lemma/bin/pip install simplemma==2.0.0`, then `pnpm typecheck && pnpm test && pnpm lint && pnpm lint:words && pnpm check:vega`
5. Pipeline without AWS: `pnpm pipeline prepare --clip demo-de --source s3://unused --lang de --native en --fixture --no-publish` → `packages/pipeline/work/demo-de/`
6. `pnpm api`, then `curl localhost:4000/health` → `{"success":true,…}`. Importing clips into the database: no importer yet (TASKS.md, LING-005 follow-up).
7. (device) Fire OS, Fire TV Stick on `adb connect <ip>`: `cd apps/expo && EXPO_TV=1 npx expo prebuild --clean && EXPO_PUBLIC_API_URL=http://<lan-ip>:4000 pnpm --filter @lingo/expo android`
8. (device) Phone: `pnpm --filter @lingo/phone start`; EAS builds and device steps: [docs/plans/LING-006.md](docs/plans/LING-006.md) §Manual device steps.
9. (device) Vega, experimental: [apps/vega/README.md](apps/vega/README.md) (npm project; VVD checklist).
10. (AWS) Real clips: `pnpm --filter @lingo/infra exec cdk deploy lingo-media-dev --exclusively`, export `S3_BUCKET_MEDIA` and
    `CLOUDFRONT_DOMAIN` from its outputs, then `pnpm pipeline batch content/clips.json --dry-run` and the runbook in
    [docs/plans/LING-008.md](docs/plans/LING-008.md) §2.9 (needs `aws`, `ffmpeg`, `ffprobe`, Shaka `packager`). Costs: [docs/aws.md](docs/aws.md).
    IAP sandbox: App Tester + `apps/expo/amazon.sdktester.json` on Fire OS, the VVD on Vega: [docs/plans/LING-007.md](docs/plans/LING-007.md) §Manual checklists A and B (not run yet).

## Architecture

```
 TV                                                    Phone (apps/phone, Expo)            code done, not on a device
 ├─ apps/expo  Fire OS · react-native-tvos 0.81          Join · Live words · Quiz (SM-2) · Progress
 └─ apps/vega  Vega OS · RN for Vega 0.83 (experimental)          │
        │                                                         │ Socket.IO room = session code
        ▼                                                         │ REST
 packages/shared-ui  screens, tokens, remote bus ─── REST + Socket.IO ──┐
        │                                                               ▼
        ▼                                            apps/api  Express 4 · Zod · Prisma/Postgres · pg-boss · Socket.IO
 @moizp/vega-media-kit  player adapters (Fire OS:              │  POST /iap/verify → Amazon RVS sandbox   code done, not on a device
   react-native-video · Vega: w3cmedia + Shaka, KIT-010)       │
        ▲ HLS + WebVTT over HTTPS                              ▼ (clip import: no importer yet)
 CloudFront (OAC) ◄── S3 media bucket ◄── packages/pipeline (CLI; `pnpm pipeline prepare` / `batch`)
                                            normalise (ffmpeg) → Amazon Transcribe [eu-central-1]
                                            → segment (42×2, 20 cps, gate) → Amazon Translate [eu-central-1]
                                            → lemmatize (simplemma) + rank → highlights
                                            → Bedrock Nova Lite glosses + quiz plan [us-east-1, `us.` profile]
                                            → Shaka Packager HLS → aws s3 sync/cp
 infra/ (AWS CDK): lingo-media-dev (S3 + CloudFront + PipelineRole, eu-central-1) · lingo-nova-dev (declared, not used, us-east-1)
 Phone audio is on-device TTS (expo-speech, decision 0011), not Polly. Personalization and Media Controls are wired to the kit, whose
 bindings are no-ops until KIT-007; the Vega Content Launcher handler lives in apps/vega until the kit has one.
```
Plan: [docs/PLAN.md](docs/PLAN.md) · Tickets: [TASKS.md](TASKS.md) · Content register: [docs/content.md](docs/content.md)

## What's new since Aug 31, 2026

Everything. The repository was created on 2026-09-14 (first commit `3f87a00`), during the hackathon window; so was `@moizp/vega-media-kit`.

- 2026-09-14 — monorepo scaffold, CI, wording lint.
- 2026-09-18 — content register (12 clips + 13 reserve, licences verified per source page); LING-004 realtime session (Socket.IO, QR pairing).
- 2026-10-01 — LING-001 pipeline (Transcribe, segmenter and quality gate, Translate, lemmas and frequency bands, highlights); LING-002 Nova Lite
  glosses and quiz plans with cache, retry and cost ledger; LING-003 player (dual cues, word focus, Explain card, settings sheet, remote bridges);
  LING-008 clip batch runner and manifest, Vega project, Noto Sans and Manrope fonts, these docs.
- 2026-10-02 — Gate A passed on two real clips; Gate C first run recorded (not passing yet). LING-005 TV screens (first run with placement,
  Home, Clip, Summary, TV quiz, Words, Settings), LING-006 phone (Join, Live, SM-2 review, Progress) and LING-007 Lingo Plus (IAP on both OSes,
  RVS verification) with Content Launcher, Personalization and Media Controls wiring: code done and reviewed, not checked on a device yet.
- Pending: the device checklists for LING-003/005/006/007, the 12-clip batch, LING-009 video and submission.

## Built with Amazon and AWS

Every AWS call, its purpose and cost: [docs/aws.md](docs/aws.md). Product feedback: [docs/feedback.md](docs/feedback.md); feature requests
with priorities: [docs/feature-requests.md](docs/feature-requests.md). 23 friction logs: [docs/friction](docs/friction/README.md).

## Licences

- Code: MIT ([LICENSE](LICENSE)).
- Word-frequency and name lists: CC BY-SA 4.0, derived from hermitdave/FrequencyWords ([packages/pipeline/data/README.md](packages/pipeline/data/README.md)).
- Fonts: Noto Sans and Manrope, SIL Open Font License 1.1 ([packages/shared-ui/assets/fonts](packages/shared-ui/assets/fonts/README.md)).
- Clips: per clip, as recorded in [content/clips.json](content/clips.json) and [docs/content.md](docs/content.md); subtitles derived from
  BY-SA clips carry the same licence (a `NOTE` in each VTT). Shown in the app under Settings → About & attributions (`packages/shared-ui/src/screens/About.tsx`).
