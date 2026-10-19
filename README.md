# Lingo

**Learn a language from the TV you already watch — on Fire TV (Vega OS: experimental), with your phone as the notebook.**
Two subtitle tracks (target language large and bright, native language small and cool), a pause that explains the line,
one or two highlighted words at your level per cue, and a phone that saves what you tap and quizzes you tomorrow with
literal SM-2 spacing. Clips are 3–8 minutes; a session is one clip and a two-minute quiz.

Built for the [Build, Ship, Shape: Amazon Developer Hackathon](https://amazonappdev2026.devpost.com/) — Fire TV track,
AWS Builder and Open Source mini-challenges. Shares [`@moizp/vega-media-kit`](https://github.com/moiz-lakkadkutta/vega-media-kit)
with [Described](https://github.com/moiz-lakkadkutta/described). MIT. Demo clips are CC BY / CC BY-SA / public domain.

## Status (2026-10-19)

Status words as in [docs/submission.md](docs/submission.md) §15: **Built** · **Built, run on device** · **Code done, not on device** · **Not built**.
"Run on device" means the full Fire TV Stick checklist ([device run](docs/spot-checks/2026-10-14-device-run.md)), run between 2026-10-15 and 2026-10-18, on which every row passed (reported by Moiz 2026-10-19).

| Part | State | Evidence |
|---|---|---|
| Fire OS app (`apps/expo`, react-native-tvos) | **Built, run on device (2026-10-15..18, reported by Moiz)** (Player, LING-003): dual cues from CloudFront, the Explain card, word focus, the remote's media keys (Play/Pause, Rewind, Fast-forward) and the seek guard (LING-003 M2, rows 16–17). Spike S1 (2026-10-04, 9 of 13 rows) came first | [device run](docs/spot-checks/2026-10-14-device-run.md), [docs/spikes/S1-fire-os-remote.md](docs/spikes/S1-fire-os-remote.md), [friction log](docs/friction/2026-10-05-s1-fire-os-remote-events-and-chip-focus.md) |
| Vega OS app (`apps/vega`) | **Code done, not on device** (experimental; runs on the Vega Virtual Device): built with SDK 0.24 and run on the Vega Virtual Device on 2026-10-14 (no physical Vega device): Home, the rail, Clip and Words render with the live catalog; Pair/QR, Quiz and the S2 questions not run there yet. No video playback until the kit's Vega adapter is rewritten (KIT-010): the Player, the Words mini player and Quiz replay show a message instead | [apps/vega/README.md](apps/vega/README.md), [VVD spike](docs/spikes/2026-10-14-vega-vvd.md) |
| Pipeline (`packages/pipeline`) | **Built.** Gate A passed 2026-10-02 on two real clips. Gate C (AI gloss and quiz quality) passed 2026-10-10 on human-scored sheets for both languages (≥ 90 %): Amazon Nova Pro v1 writes the glosses (gloss prompt v7); the quiz is built by code from those glosses, with no model call | [decision 0001](docs/decisions/0001-week0-gates.md), [decision 0009](docs/decisions/0009-gloss-quality.md), [en sheet](docs/spot-checks/2026-10-05-gate-c-en-r3.md), [de sheet](docs/spot-checks/2026-10-10-gate-c-de-r3.md) |
| Clips | **Built.** 12 of 12 published 2026-10-14 (`pnpm pipeline batch content/clips.json --phase final`: 12 ok, none skipped), served from CloudFront, and imported into the local database with the clip importer `pnpm clips:import` (commit 65db7bb): 12 of 12 `published`. Left: listening checks on a device for the retimed cues of two clips | [docs/content-status.md](docs/content-status.md) §Published, [content/clips.json](content/clips.json) |
| TV screens: first run, Home, Clip, Summary, Quiz, Words, Settings | **Built, run on device (2026-10-15..18, reported by Moiz)** (LING-005): placement, focus memory, level rule, TV quiz, saved words. Screenshot pending <!-- HUMAN: screenshot pending; add one device screenshot of the TV screens from the stick, or leave the row as is. --> | [decision 0010](docs/decisions/0010-tv-navigation-focus-memory-and-level-rule.md), [0014](docs/decisions/0014-per-install-tv-device-id.md), [review](docs/reviews/2026-10-02-ling-005.md) |
| Phone (`apps/phone`) | **Built, run on device (2026-10-15..18, reported by Moiz)** (LING-006), as a web page in Chrome on an Android phone, opened from the TV's pair QR (no Expo Go, no native build; reported by Moiz 2026-10-19): Join (QR or code), Live words (a TV save arrives on the phone), Quiz (SM-2 on the server, result mirrored to the TV), Progress; on-device TTS, no Polly. No native phone build (Expo Go or EAS) has run on a device yet. Photo pending <!-- HUMAN: screenshot pending; add a photo or recording of the phone receiving a saved word, or leave the row as is. --> | [decision 0011](docs/decisions/0011-phone-session-code-access.md), [review](docs/reviews/2026-10-02-ling-006.md) |
| Lingo Plus (Amazon Appstore IAP + RVS sandbox) | Fire OS: **Built, run on device (2026-10-15..18, reported by Moiz)** (LING-007): a Lingo Plus sandbox purchase completed in Amazon App Tester on the stick (device run rows 30–34), verified on the server against the RVS sandbox. Vega: code done (the Vega IAP library), the VVD sandbox run was not done. Screenshot pending <!-- HUMAN: screenshot pending; add the App Tester purchase screenshot or the RVS sandbox log. --> | [decision 0012](docs/decisions/0012-lingo-plus.md), [review](docs/reviews/2026-10-02-ling-007.md) |
| Content Launcher · Personalization · Media Controls | Content Launcher deep link on Fire OS: **Built, run on device (2026-10-15..18, reported by Moiz)** (LING-007): `lingo://clip/<slug>` opens the clip on the stick (device run row 47); the Vega Content Launcher handler in `apps/vega` is code done, not on device. Personalization and Media Controls go through the kit, whose bindings are still no-ops (KIT-007, escalations E1–E4 in TASKS.md), so they are not claimed. Screenshot pending <!-- HUMAN: screenshot pending; add a screenshot or log of the deep link on the stick. --> | [decision 0012](docs/decisions/0012-lingo-plus.md), [plan](docs/plans/LING-007.md) |

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
6. `pnpm api`, then `curl localhost:4000/health` → `{"success":true,…}`. Import clips into the database with `pnpm clips:import [--dry-run]`
   (reads `content/clips.json` and `packages/pipeline/work/<slug>/clip.json`; work dirs are not committed, so run the pipeline first).
7. (device) Fire OS, Fire TV Stick on `adb connect <ip>`: `cd apps/expo && EXPO_TV=1 npx expo prebuild --clean && EXPO_PUBLIC_API_URL=http://<lan-ip>:4000 pnpm --filter @lingo/expo android`
8. (device) Phone: `pnpm --filter @lingo/phone start`; EAS builds and device steps: [docs/plans/LING-006.md](docs/plans/LING-006.md) §Manual device steps.
   To pair a phone that runs the app as a web page, start the API with `PHONE_URL=http://<lan-ip>:8083/join`: the TV's QR then opens the
   web app, which joins by itself; without it the QR is `lingo://join/<code>` for the native app ([device run](docs/spot-checks/2026-10-14-device-run.md) row 8).
9. (device) Vega, experimental: [apps/vega/README.md](apps/vega/README.md) (npm project; VVD checklist).
10. (AWS) Real clips: `pnpm --filter @lingo/infra exec cdk deploy lingo-media-dev --exclusively`, export `S3_BUCKET_MEDIA` and
    `CLOUDFRONT_DOMAIN` from its outputs, then `pnpm pipeline batch content/clips.json --dry-run` and the runbook in
    [docs/plans/LING-008.md](docs/plans/LING-008.md) §2.9 (needs `aws`, `ffmpeg`, `ffprobe`, Shaka `packager`). Costs: [docs/aws.md](docs/aws.md).
    IAP sandbox: App Tester + `apps/expo/amazon.sdktester.json` on Fire OS, the VVD on Vega: [docs/plans/LING-007.md](docs/plans/LING-007.md) §Manual checklists A and B (A, App Tester on the stick: a sandbox purchase completed 2026-10-15..18, reported by Moiz 2026-10-19; B, the VVD: not run).

## Architecture

```
 TV                                                    Phone (apps/phone, Expo)            run on device 2026-10-15..18
 ├─ apps/expo  Fire OS · react-native-tvos 0.81          Join · Live words · Quiz (SM-2) · Progress
 └─ apps/vega  Vega OS · RN for Vega 0.83 (experimental)          │
        │                                                         │ Socket.IO room = session code
        ▼                                                         │ REST
 packages/shared-ui  screens, tokens, remote bus ─── REST + Socket.IO ──┐
        │                                                               ▼
        ▼                                            apps/api  Express 4 · Zod · Prisma/Postgres · pg-boss · Socket.IO
 @moizp/vega-media-kit  player adapters (Fire OS:              │  POST /iap/verify → Amazon RVS sandbox   sandbox purchase run on the stick
   react-native-video · Vega: w3cmedia + Shaka, KIT-010)       │
        ▲ HLS + WebVTT over HTTPS                              ▼ (clip import: pnpm clips:import)
 CloudFront (OAC) ◄── S3 media bucket ◄── packages/pipeline (CLI; `pnpm pipeline prepare` / `batch`)
                                            normalise (ffmpeg) → Amazon Transcribe [eu-central-1]
                                            → segment (42×2, 20 cps, gate) → Amazon Translate [eu-central-1]
                                            → lemmatize (simplemma) + rank → highlights
                                            → Bedrock Nova Pro v1 glosses [us-east-1, `us.` profile] → quiz built by code
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
- 2026-10-02 — Gate A passed on two real clips; Gate C first run recorded (not passing yet, on Nova Lite). LING-005 TV screens (first run with placement,
  Home, Clip, Summary, TV quiz, Words, Settings), LING-006 phone (Join, Live, SM-2 review, Progress) and LING-007 Lingo Plus (IAP on both OSes,
  RVS verification) with Content Launcher, Personalization and Media Controls wiring: code done and reviewed, not checked on a device yet.
- 2026-10-04 — Gate C round 2: the default model moves from Nova Lite v1 to Nova Pro v1 after measurement (decision 0009); spike S1 on a
  Fire TV Stick (9 of 13 rows pass).
- 2026-10-05 — Gate C round 6: fixed expressions, most precise gloss first (gloss prompt v7); the quiz is built by code, no model call.
- 2026-10-10 — Gate C passed on human-scored sheets for both languages; 12 clips prepared with AI.
- 2026-10-12 — clip importer (`pnpm clips:import`, 65db7bb).
- 2026-10-14 — all 12 clips published to CloudFront and imported into the local database. The Vega app runs on the Vega Virtual Device
  (SDK 0.24.12112: Home, the rail, Clip and Words; no video yet, KIT-010). vega-media-kit `v0.1.0` tagged and released on GitHub.
- 2026-10-15 — QA fixes (PR #7): the highlight marks the word without its punctuation; the old line no longer flashes back after a seek;
  no billing error at start when the Appstore is absent; dark splash and a visible loading label; Settings shows "Saved." after a change;
  a "Your words" button on Home; the Explain card reads "Saved to Words"; key hints in Settings, Words and the Player.
  `@moizp/vega-media-kit` 0.1.0 published to npm (MIT).
- 2026-10-15..18 — the full device run on a Fire TV Stick: every row passed, including the seek guard, the deep link, Save → phone and an
  App Tester sandbox purchase ([device run](docs/spot-checks/2026-10-14-device-run.md), reported by Moiz 2026-10-19). The demo video was filmed.
- 2026-10-19 — upstream README fix opened on an Amazon sample: https://github.com/AmazonAppDev/vega-scrolling-sample/pull/26.
- Pending: cutting and uploading the video, the README screenshots, the Devpost forms.

## Built with Amazon and AWS

Every AWS call, its purpose and cost: [docs/aws.md](docs/aws.md). Product feedback: [docs/feedback.md](docs/feedback.md); feature requests
with priorities: [docs/feature-requests.md](docs/feature-requests.md). 36 friction logs: [docs/friction](docs/friction/README.md).

## Licences

- Code: MIT ([LICENSE](LICENSE)).
- Word-frequency and name lists: CC BY-SA 4.0, derived from hermitdave/FrequencyWords ([packages/pipeline/data/README.md](packages/pipeline/data/README.md)).
- Fonts: Noto Sans and Manrope, SIL Open Font License 1.1 ([packages/shared-ui/assets/fonts](packages/shared-ui/assets/fonts/README.md)).
- Clips: per clip, as recorded in [content/clips.json](content/clips.json) and [docs/content.md](docs/content.md); subtitles derived from
  BY-SA clips carry the same licence (a `NOTE` in each VTT). Shown in the app under Settings → About & attributions (`packages/shared-ui/src/screens/About.tsx`).
