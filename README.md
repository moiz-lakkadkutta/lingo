# Lingo

**Learn a language from the TV you already watch — on Fire TV, with your phone as the notebook.**
Two subtitle tracks (target language large and bright, native language small and cool), a pause that explains the line,
one or two highlighted words at your level per cue, and a phone that saves what you tap and quizzes you tomorrow with
literal SM-2 spacing. Clips are 3–8 minutes; a session is one clip and a two-minute quiz.

Built for the [Build, Ship, Shape: Amazon Developer Hackathon](https://amazonappdev2026.devpost.com/) — Fire TV track,
AWS Builder and Open Source mini-challenges. Shares [`@moizp/vega-media-kit`](https://github.com/moiz-lakkadkutta/vega-media-kit)
with [Described](https://github.com/moiz-lakkadkutta/described). MIT. Demo clips are CC-BY / public domain.

## Run it (≤ 10 steps)
1. `pnpm i` · `cp .env.example .env` · `pnpm db:up` · `pnpm db:migrate`
2. `pnpm api` (:4000) · `pnpm expo` (Fire OS) · `pnpm --filter @lingo/phone start` (phone)
3. Vega: `apps/vega/README.md`. Prepare a clip: `pnpm pipeline prepare --clip sintel-bridge --source s3://…/clip.mp4 --lang de --native en`
4. IAP sandbox: install the Amazon App Tester on the stick and copy `apps/expo/amazon.sdktester.json` to `/sdcard/`.

## Architecture
```
TV (vega/expo → shared-ui → kit)      Phone (Expo)
  Home · Player(dual cues) · Explain    Join · Live saved words · Quiz (SM-2) · Progress
  Summary · Quiz · Words · Settings          │ Socket.IO room = session code
         └──────────── REST + Socket.IO ────┘
apps/api (Express, Prisma, pg-boss, Socket.IO) → packages/pipeline: Transcribe → segment (42×2, 20 cps) → Translate → lemmatize+rank → highlights → Nova Lite glosses & quiz → package → publish
```
Plan: [docs/PLAN.md](docs/PLAN.md) · Tickets: [TASKS.md](TASKS.md) · AWS: [docs/aws.md](docs/aws.md) · Friction: [docs/friction](docs/friction)

## What's new since Aug 31, 2026
Everything — the project started with the hackathon.
