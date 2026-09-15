# Kickoff prompt for the orchestrator

Paste this into a fresh Claude Code session at the repo root. Protocol: docs/ORCHESTRATOR.md.

```
You are the ORCHESTRATOR for ~/hackathon/lingo. Read docs/ORCHESTRATOR.md first and follow it exactly: you facilitate; sub-agents plan (fable), implement (opus for well-bounded work), and review (fable).

Load: README.md, docs/PLAN.md (+ linked full plan), TASKS.md, CLAUDE.md, docs/decisions/*, apps/api/prisma/schema.prisma, apps/api/src/lib/sm2.ts (+ test), packages/contracts/src/index.ts, packages/pipeline/src/**, packages/shared-ui/src/**, apps/phone/src/App.tsx, ../vega-media-kit/README.md and src/player/types.ts. Baseline: `pnpm i && pnpm db:up && pnpm db:migrate && pnpm typecheck && pnpm test && pnpm lint:words` — report it (expect segmenter, highlights, SM-2 tests passing).

Non-negotiables for every brief: target cue 44 px bright over native cue 32 px cooler (#9FC9D8, ~70 %); marker #E3C77A only for the word to learn; cues ≤ 42 chars × 2 lines, ≤ 20 cps, 1–7 s, ≥ 2 frames apart; highlights ≤ 40 % of cues, never names or numbers, only the band above the learner's level; SM-2 stays literal and server-side; free tier 20 saves/day, Lingo Plus gates Challenge mode + unlimited saves + 0.75×; levels labelled approximate CEFR; a missed day says "Welcome back", quiz feedback shows the answer and never says wrong/failed; Noto Sans everywhere, Manrope for display only; no pure white; focus = outline + 1.04 scale; aria-labels of purpose; CC-BY / public-domain clips only.

Lingo starts in week 2 per the runbook; this session prepares the ground so week 2 is implementation only:
- LING-001 preparation (Planner fable → Implementer opus): port the Transcribe helper and Shaka Packager/publish steps from ../described/packages/pipeline into packages/pipeline/src/prepare.ts (import, don't duplicate, if a shared package is cleaner — planner decides and records in docs/decisions); pick and wire a lemmatizer for de/en (planner evaluates simplemma via a small Python bridge vs a JS port; decide, cite); source `data/freq-de.txt` and `data/freq-en.txt` from an openly licensed subtitle-frequency list and record the license in docs/aws.md; fixture tests for the whole prepare() path on a 60-second sample with a mocked Transcribe JSON.
- LING-002 (Planner fable → Implementer opus → Reviewer fable): glossWord/quizForClip with strict Zod schemas, caching by (lemma, cue), retry on schema failure, cost logging; a 30-item spot-check rubric the reviewer applies to real Nova Lite output on two clips.
- Content sourcing (Spike fable → Scribe opus): find 12 candidate clips 3–8 min with clean dialogue in German and English (Blender open movies' dialogue scenes, public-domain shorts, CC-BY interviews on Wikimedia); table with URL, license, duration, speech quality; commit as docs/content.md.
- LING-003 design prep (Planner fable): how word-level focus works on top of the kit's CueOverlay `selectable` mode with D-pad ◄► while paused, and the fallback (highlighted words as a focusable row in the Explain card) — a decision record, then an Implementer (opus) builds Player.tsx against it.
- LING-004 (Planner fable → Implementer opus): sessions POST + Socket.IO join in the platform entries, QR via react-native-svg, phone Live screen receiving word:saved within 1 s (integration test over a local server).

After every ticket: friction logs via Scribe, tick TASKS.md, commit with the attribution trailer, push, check CI. Escalate for gate decisions, kit interface changes, AWS spend > ~$10 per run, or two failed review loops. Begin with the baseline and the LING-001 planner brief.
```
