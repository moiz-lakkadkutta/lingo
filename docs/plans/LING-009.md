# LING-009 plan: video, Devpost draft, pre-submission checklist

Status: plan (Planner, 2026-10-01). Ticket: TASKS.md LING-009 (week 5): "Video (Save-word-to-phone moment with both screens in frame) + submission".
Inputs read: CLAUDE.md, docs/ORCHESTRATOR.md, TASKS.md, README.md, docs/PLAN.md and the full plan artifact (§1, §3, §8–§10, §13, §14),
the runbook artifact (§1 reward map, §2 "unique and substantially different" callout, §7 week 5, §9 definition of done, §10 video
template), docs/content.md, docs/aws.md, docs/feedback.md, docs/feature-requests.md, docs/decisions/0001–0008, docs/friction/,
scripts/lint-words.mjs, packages/shared-ui/src/strings.ts, apps/phone/src/App.tsx, apps/api/src/routes/*, apps/api/src/sockets.ts,
infra/, apps/vega/README.md, ../vega-media-kit (README, docs/platform-bindings.md, TASKS.md, package.json).

## 0. What the implementer writes (and nothing else)

| # | File | What it is |
|---|---|---|
| A | `docs/video-script.md` | Shot-by-shot 2:45 script, shot list, recording checklist with fallbacks, edit + export checklist |
| B | `docs/submission.md` | Devpost draft: every form field in paste-ready English, plus a claims register |
| C | `docs/submission-checklist.md` | Pre-submission checklist against the runbook's definition of done, with owners and dates |

Role: Scribe (opus). Docs only. No code changes, no commits, no AWS calls, no network calls needed (every source URL is given below).
Do not edit `scripts/lint-words.mjs`, `TASKS.md`, README.md or any other file (see §7, open question Q1).

## 1. Ground truth: what exists (refreshed 2026-10-02 against the merged LING-005..008 code, PR #2 review C-M4)

Every claim in A and B must come from this table. Status words used in both docs: **Built** (code on the branch, tests pass),
**Code done, not on device** (built but not yet run on the stick or VVD), **Planned** (ticket open, nothing on the branch),
**Not planned** (do not claim). Anything not **Built** gets a placeholder (§1.1) in the docs.

| Feature | Status 2026-10-02 | Evidence | Ticket that changes it |
|---|---|---|---|
| Pipeline: Transcribe → segment (42 × 2, 20 cps, 1–7 s) → Translate → lemmatize + rank → highlights | Built; Gate A passed on two real clips | docs/decisions/0001 Gate A; `packages/pipeline/src/*` | — |
| Nova Lite glosses + quiz plan (Converse, forced tool use, Zod) | Built; Gate C quality **not yet passing** (en ≈ 6/15) | docs/decisions/0001 Gate C; docs/aws.md | LING-002 |
| Package (Shaka Packager) + publish (S3/CloudFront), CDK stacks | Built (`infra/lib/media-stack.ts`, `nova-ingest-stack.ts`) | infra/ | — |
| Player: dual cues, marker, word focus, Explain card, Save / Replay / Slower, 0.75× (Fire OS only) | Code done, not on device (spikes S1, S2 pending) | decision 0006; docs/spikes/S1-fire-os-remote.md | LING-003 |
| Socket.IO session, QR pairing, `word:saved` to the phone < 1 s p95 | Built (integration test `apps/api/test/realtime.test.ts`) | decision 0005 | — |
| Phone: Join, Live chips, Quiz deck (SM-2 server-side), Progress | Code done, not on device: four screens (`apps/phone/src/screens/*`), tests pass; no EAS build yet | apps/phone/src; decision 0011; docs/reviews/2026-10-02-ling-006.md | LING-006 (device steps, EAS) |
| Phone quiz score shown on the TV (`quiz:result`) | Code done, not on device: the phone emits it after the deck (`apps/phone/src/App.tsx` → `link.sendQuizResult`, `apps/phone/src/lib/link.ts`), the server relays it (`apps/api/src/sockets.ts`), the TV Summary shows the score (`packages/shared-ui/src/session/useSession.ts`, `screens/Summary.tsx`) | grep `quiz:result` | LING-006 (device steps) |
| TV screens Home, Clip, Summary, Quiz(TV), Words, Settings, First run | Code done, not on device: all seven screens plus About and Plus in `packages/shared-ui/src/screens` | decision 0010; docs/reviews/2026-10-02-ling-005.md | LING-005 (device checklist) |
| Lingo Plus IAP | Code done, not on device: client purchase and restore flow on both OSes (`packages/shared-ui/src/plus/flow.ts`, `apps/expo/src/fireosStore.ts` with react-native-iap, `apps/vega/src/iap/vegaStore.ts`); server `POST /iap/verify` against the RVS sandbox. App Tester / VVD sandbox run not done | decision 0012; apps/api/src/routes/iap.ts | LING-007 (checklists A and B) |
| Content Launcher (voice search → app) | Launch handling code done, not on device: Fire OS deep link `lingo://clip/<slug>` (`apps/expo/LaunchBridge.tsx`) and an app-side Vega Content Launcher handler (`apps/vega/src/platform/contentLauncher.ts`) open the clip. **Voice search is not built**: the kit's Fire OS binding is a runtime no-op and Fire TV catalog ingestion is a submission-time process that has not happened; the kit's Vega binding is deferred (KIT-007, E1) | ../vega-media-kit/src/platform/contentLauncher.ts | LING-007 / catalog onboarding |
| Personalization (resume) | Lingo's own resume is code done, not on device: `PUT /me/progress` (`apps/api/src/routes/learning.ts`) feeds Home's Continue row. **Fire TV Personalization is not built**: the Player reports through the kit, whose `reportPlayback` is a no-op on Fire OS and Vega (KIT-007, E3) | apps/api/src/routes/learning.ts; ../vega-media-kit/src/platform/personalization.ts | LING-007 / kit |
| Media Controls | Kit: Android MediaSession via react-native-video on Fire OS; Vega deferred. Not verified in Lingo | platform-bindings.md | LING-007 |
| Vega app | Code done, not on device: `apps/vega` is a Vega project that installs, typechecks and bundles for `--platform kepler` (decision 0013); never run on the VVD or a device; no video playback until the kit's Vega adapter is rewritten (KIT-010), so Player, Words and Quiz replay show a message | apps/vega/README.md; decision 0013; kit README §Status | LING-008 (VVD checklist) |
| Amazon Polly | **Not used in code.** IAM permission and an unused SDK dependency only; docs/aws.md lists it under "Declared, not used". The phone's audio is on-device TTS (`expo-speech`, decision 0011 §10) | grep `polly` | Not planned |
| Nova Pro, Strands Agents, AgentCore | **Not used** (docs/aws.md: "plain commander CLI; no agent framework") | docs/aws.md | Not planned |
| vega-media-kit | Built, MIT, `0.1.0-alpha.0`, **no git tag**, npm publish not confirmed | ../vega-media-kit/package.json, `git tag` empty | kit release |
| Upstream PR to an AmazonAppDev sample | **None yet** | — | owner Moiz |
| Friction logs | 23 in docs/friction/ (target ≥ 8 met) | docs/friction/README.md | — |
| docs/feedback.md, docs/feature-requests.md | Drafted from the repository's record; **TBD by human** items remain for the human to fill and sign off | docs/feedback.md; docs/feature-requests.md | LING-008 / human |

### 1.1 Placeholder convention (both docs)

- Inline: `[PLACEHOLDER: <what is missing> · owner <name> · due <date> · ticket <ID>]`. Plain ASCII, always on one line, so
  `grep -n "PLACEHOLDER" docs/submission.md docs/video-script.md` finds every one.
- In the video script, each shot row has a **Status** cell (Built / Code done, not on device / Planned) and a **Fallback** cell.
  A shot whose feature is Planned must carry both the "if built" voice-over and the fallback voice-over (§2.3); the fallback
  voice-over never names the unbuilt feature.
- Submission rule (also in C): on Oct 21 the only placeholders allowed to remain are none. Each one is either filled with the
  real value or the sentence that needed it is deleted.

## 2. File A: docs/video-script.md

### 2.1 Header block (write first)

- Title "Lingo: demo video script". One-line purpose. "Status as of <date>; re-check §1 of docs/plans/LING-009.md before the shoot."
- Hard limits: runtime < 3:00 (rules: "<3 minute demo video", https://amazonappdev2026.devpost.com/rules); target cut 2:40–2:55; script timed at 2:45.
- Must show (runbook §9): the app functioning on the device; a moment of Fire OS and a moment of Vega (or, if Vega is not running,
  the honest label of §2.4 S08); at least two tripod camera shots (runbook §10 note); the save moment with both screens in one frame (ticket).
- Device legend, used in every row: **FOS** = Fire TV Stick (Fire OS), filmed on tripod; **FOS-cap** = clean capture of the stick
  (`adb shell screenrecord`), used only as an insert; **VVD** = Vega Virtual Device screen recording, always captioned
  "Vega Virtual Device"; **PH** = phone, filmed in frame; **PH-cap** = phone screen recording (B-roll), captioned "Phone screen recording";
  **GFX** = diagram or title card made in the editor.
- Voice-over budget: ~150 words per minute → ≤ 380 words at 2:45. The script in §2.3 is ~300 words, leaving room for pauses over the uninterrupted loop.
- On-screen captions: the whole voice-over is burnt in as English captions, following Lingo's own cue rules (≤ 42 characters per line,
  ≤ 2 lines, ≤ 20 characters per second). Source footnotes (¹ ²) appear as a small caption line at the bottom while the number is spoken.
- Clip footage: every shot that shows clip video carries the clip's attribution string from docs/content.md, verbatim, as a lower
  caption for its first appearance, and again on the end card (CC BY requires attribution and an indication of changes; docs/content.md §5).
- Music: none, or CC0 only, named on the end card. No commercial music (Content ID risk on YouTube).

### 2.2 Demo clip and demo state

- Primary demo clip: `terra-x-so-trinken-baeume` (A2–B1 approx., CC BY 4.0, docs/content.md row 6) if LING-008 has prepared it by Oct 15;
  its credit line is truncated in content.md (footnote g5): copy the full line from the ZDF page before the shoot.
  Fallback: `terra-x-friedlaender` (already prepared, Gate A). Editorial note from docs/content.md §6: it is a Holocaust survivor's
  testimony; choose a segment and a save word that are neutral (no Theresienstadt-specific vocabulary as the saved word), keep the tone plain.
- Save word: choose from that clip's `clip.json` highlights (a word whose gloss passed the spot check). Write the chosen word, its cue
  index and the cue's timecode into the script as `[PLACEHOLDER: save word · owner Moiz · due Oct 16]` until chosen. Do not invent one.
- Learner state before each take: fresh learner (new `x-device-id` or DB reset), level A2, learning `de`, native `en`, phone paired,
  zero saves today (so the free-tier line "That's 20 today…" can never appear by accident), Plus off until shot S07b.

### 2.3 Shot-by-shot script (write this table, with these columns)

Columns: `#` · `Time` · `Dur` · `Device / camera` · `On-screen action` · `Voice-over` · `Caption (burnt in)` · `Status` · `Fallback`.
Rows below give the content; the implementer may tighten wording but must keep every fact and every source note.

| # | Time | Dur | Device / camera | On-screen action | Voice-over | Caption / notes | Status | Fallback |
|---|---|---|---|---|---|---|---|---|
| S01 | 0:00–0:15 | 15 s | Tripod 1, wide: sofa, TV (FOS, Lingo Home), phone on the sofa arm, remote in hand | Lingo Home on the TV; slow push-in is fine, no zoom | "You already watch more than an hour of TV a day.¹ Lingo turns it into your German lesson." | ¹ "AGF Videoforschung, TV year 2024: 79 min a day, ages 14–49" | Home: Code done, not on device (LING-005) | If Home is not finished: open on the Player paused on a cue (S03 framing) |
| S02 | 0:15–0:35 | 20 s | Tripod 1, medium; remote in frame | **If Content Launcher works:** voice search for the clip title → Lingo appears in results → opens on the Clip page. **Otherwise:** Fire TV home → Lingo tile → Lingo Home → hero "Watch" focused (focus ring + 1.04 scale visible) → Select | If built: "Ask for a clip by voice, and Lingo opens it." Fallback: "Lingo sits on the Fire TV home screen. One press, and today's clip at your level is playing." | Level chip reads "about A2" (levels are approximate CEFR, decision 0002) | Content Launcher: launch handling code done, not on device; **voice search not built** (no catalog ingestion; kit Fire OS binding a no-op) | Fallback action and voice-over above. Never say "search" or "Alexa" unless the take shows it working |
| S03 | 0:35–0:50 | 15 s | Tripod 2, tight on the TV, cues legible | Player running: German line 44 px bright, English line 32 px cooler above it, one marker word | "Two subtitle lines: German, large and bright; English, small and quiet. The marked word is the one worth learning at your level." | Clip attribution caption (verbatim from content.md) | Code done, not on device (LING-003, spikes S1/S2) | FOS-cap insert of the same moment if the camera image of the cues is soft |
| S04 | 0:50–1:05 | 15 s | Tripod 2 | Press Select → video pauses on the cue → Explain card: word · lemma · "rank N · about B1" chip, gloss, grammar note, the cue as example, actions Save word / Replay / Slower | "Pause on any line. Lingo explains the marked word: what it means, one grammar note, and the line itself as the example." | — | Code done, not on device (LING-003); gloss quality depends on Gate C (LING-002) | Pick a word whose gloss is spot-checked; FOS-cap insert |
| **S05** | 1:05–1:20 | 15 s | **Tripod 3: both screens in one frame.** TV fills the upper two thirds; phone on a small stand in the lower-right foreground, Live screen, brightness matched to the TV. One continuous take, no cut between the press and the phone | Focus on "Save word" → Select → TV shows the saved state ("Saved. …") → within a second the marker chip appears on the phone's Live list | "Save it, and it's on your phone a second later." | none during the moment (let it breathe) | Socket path Built (< 1 s p95, decision 0005); Explain Save UI Code done, not on device | See §2.5 fallback F1. Never fake the timing: if the phone is composited, caption "Phone screen recorded in the same take" and keep the real delay |
| S06 | 1:20–1:35 | 15 s | Tripod 3 then PH close-up | Clip ends → Summary "N neue Wörter" with chips → focus "Quiz on your phone" → phone flips a card, taps Good → TV shows the score | "At the end, a two-minute quiz on your phone. Tomorrow it asks again, spaced further out each time you get it right." | "Spacing: SM-2, as in Anki" (no number) | Summary Code done (LING-005); phone quiz Built (no EAS build yet, LING-006); score on the TV: Code done, not on device (phone emits `quiz:result`, TV Summary shows it) | If the TV score is not built: end on the phone's last card, then cut to the TV Quiz screen ("8 of 10 right") taken from the **TV quiz**, and change the voice-over to "…a two-minute quiz, on the TV or on your phone." |
| S07a | 1:35–1:55 | 20 s | GFX over FOS-cap / terminal capture of `pnpm pipeline prepare` step timings | Diagram builds left to right: Transcribe → segment (42 chars × 2, 20 cps) → Translate → lemmatize + frequency rank → highlights → Nova Lite glosses & quiz → Shaka Packager → S3 + CloudFront | "Amazon Transcribe writes the German line with word timings, and Amazon Translate the English one. Every line is cut to subtitle reading limits.² Amazon Nova Lite on Bedrock writes the glosses and the quiz." | ² "Netflix Timed Text Style Guide: 42 characters per line, 20 characters per second" | Built | — |
| S07b | 1:55–1:57 | **2 s** | FOS-cap or tripod 2 | Plus screen ("Challenge mode, unlimited saved words, slower playback.", price, Subscribe) → Amazon App Tester purchase dialog | (voice-over continues) "Lingo Plus is a subscription through Amazon's in-app purchasing, shown here in sandbox." | "Amazon Appstore IAP · sandbox (App Tester)" | Client IAP: Code done, not on device (LING-007; App Tester run pending); server RVS check Built | If the client flow is not built: cut S07b and drop the Plus sentence. If the sandbox is flaky (PLAN §14): show the Plus screen and the App Tester dialog only; never show a "purchased" state that did not happen |
| S07c | 1:57–2:05 | 8 s | FOS-cap | Back to Home: Continue row shows the clip with resume position | **Only if built:** "Your place in each clip is kept, through Fire TV Personalization." Otherwise no voice-over; use the 8 s for the diagram's last node | — | Continue row with resume: Code done, not on device (`PUT /me/progress`); **Fire TV Personalization: not built** (kit no-op) | Never say "Personalization". Without it, hold the diagram and say nothing about resume |
| S08 | 2:05–2:30 | 25 s | Split screen: left FOS (tripod 1 frame), right VVD capture; then GFX repo map | Same Home screen on both. Then a card listing: vega-media-kit (MIT, npm), packages/shared-ui, infra/ (CDK), docs/friction/ (N logs) | "Lingo shares vega-media-kit, our open-source player and subtitle library, with our other entry, Described. One UI package targets Fire OS and Vega. The AWS stack is CDK, and every rough edge we hit is a friction log in the repo." | Right half captioned "Vega Virtual Device"; friction count from `ls docs/friction/*.md` minus README | Vega app: Code done, not on device (installs, typechecks, bundles; never run on the VVD; no video, KIT-010); kit Vega adapter experimental | See §2.5 F3. If no Lingo screen runs on the VVD, do not show a VVD; say "…one UI package, written for Fire OS and Vega; Vega support is experimental." and show the code layout instead |
| S09 | 2:30–2:45 | 15 s | Tripod 1 wide, morning light; PH close-up of a review card | Phone review the next morning; end card | "Lingo is for adults learning German or English at home, like the 363,466 people who started an integration course in Germany in 2024.³ Next: more languages, through Translate." | ³ "BAMF, Integrationskursgeschäftsstatistik 2024". End card: repo URL, MIT, "Built for Build, Ship, Shape: Amazon Developer Hackathon", clip attribution(s), music credit if any | Built (copy only) | — |

Voice-over wording checks (decision 0002): no "wrong", "failed", "streak broken"; levels always "about A2" / "approximate";
no claim of a feature whose Status is not Built or Code done unless the take shows it working.

### 2.4 Shot list (second table in the doc)

One row per physical setup, so the shoot is three tripod positions plus captures:

| Setup | Shots | Camera | Notes |
|---|---|---|---|
| Tripod 1 (wide, sofa + TV + phone + remote) | S01, S02, S08 left, S09 | phone or camera at sofa height, 1080p, 25 fps, shutter 1/50 (50 Hz mains, avoids TV flicker) | Remote and hand visible in S02 |
| Tripod 2 (tight on TV) | S03, S04, S07b alt | same settings, manual focus on the screen, exposure locked to the TV | Cues must be readable at 1080p; test one frame before the take |
| Tripod 3 (TV + phone in one frame) | S05, S06 | slightly above eye level, phone on a stand angled to the lens, phone brightness ~70 %, TV picture mode "Standard" | The ticket's shot. Three good takes minimum |
| FOS-cap | inserts for S03, S04, S07, S08 | `adb shell screenrecord --bit-rate 8000000 /sdcard/s.mp4` (stops at 180 s) then `adb pull` | Inserts only; the device must also appear on camera |
| PH-cap | B-roll for S05/S06 | Android built-in screen recorder or iOS Control Center | Captioned "Phone screen recording" whenever used |
| VVD | S08 right | macOS screen recording of the VVD window | Captioned "Vega Virtual Device" |
| Voice-over | all | separate quiet recording, one take per row, then edit | Read from §2.3 |

### 2.5 Recording checklist with fallbacks (third section)

Pre-shoot (Oct 16–18, owner Moiz): stick and phone on the same Wi-Fi as the API host; API running and reachable from both;
demo clip published and playable; learner reset (§2.2); phone app installed (EAS dev build or Expo Go) and paired; App Tester
installed and `amazon.sdktester.json` in `/sdcard/` (README step 4) if S07b is in; phone Do Not Disturb, notifications off,
auto-lock off; TV screensaver off; battery > 80 %; tripod spirit-level; one test frame per setup checked on a laptop for cue legibility.

Fallbacks (each with its trigger):
- **F1 two-device save fails on the day** (no chip within ~2 s, or the phone loses the room): retry once after re-pairing; if it still
  fails, film the TV on tripod 3 and record PH-cap in the same take, then composite the phone recording into the phone's position
  with the caption "Phone screen recorded in the same take". Never shorten the real delay. Log a friction entry (`pnpm friction`).
- **F2 the stick misbehaves** (crash, no remote events, spike S1 open): use FOS-cap for the UI, keep at least two tripod shots of the
  real stick running (S01, S05). If no stick is available at all: say so in the doc and escalate to the orchestrator; do not substitute
  an emulator without a caption naming it.
- **F3 Vega**: if a Lingo screen runs on the VVD, use it, captioned. If not, follow S08's fallback; DoD allows "documents exactly why Vega is
  experimental" (runbook §9), which file C links.
- **F4 IAP sandbox flaky**: S07b fallback; feature flag Plus off in the shoot build if needed (PLAN §14).
- **F5 a gloss on screen is incorrect**: re-take on a different save word; never show a gloss that did not pass the spot check.

Edit and export (owner Moiz, Oct 19): cut to 2:40–2:55; `ffprobe -v error -show_entries format=duration -of csv=p=0 lingo.mp4` must print < 180;
1080p H.264; captions burnt in plus an `.srt` uploaded to YouTube; loudness about −14 LUFS; watch once with sound off to check captions.

## 3. File B: docs/submission.md

Header: "Devpost draft for Lingo. Paste-ready. Status as of <date>." Then these sections, each headed with the Devpost field it fills.
Use the standard Devpost "About the project" headings (Inspiration, What it does, How we built it, Challenges, Accomplishments,
What we learned, What's next) and add the runbook's required ones (Who it's for, Potential impact, Tracks, Open source, Uniqueness).

1. **Project name**: Lingo.
2. **Elevator pitch** (≤ 200 characters; check the length): "Learn German or English from the TV you already watch: two subtitle lines, a pause that explains, and a phone that quizzes you tomorrow."
3. **What it does**: the loop (watch → pause → Explain → save → phone → quiz → spaced review) in ≤ 120 words, using only Built / Code-done
   features from §1; Plus described as "Lingo Plus (sandbox)" with a placeholder until LING-007 lands.
4. **How we built it**: architecture from README.md (the ASCII diagram may be pasted as a code block); pipeline steps; the pipeline is
   a plain CLI, not an agent framework; the cue rules (42 × 2, ≤ 20 cps, 1–7 s, cite Netflix guide); highlights from an open
   frequency list (hermitdave/FrequencyWords, CC BY-SA 4.0, cite) and simplemma (MIT); SM-2 literal and server-side (cite Anki FAQ);
   realtime TV → phone in < 1 s p95 (cite decision 0005 and the test file); one `shared-ui` package for Fire OS and Vega.
   Do **not** mention Polly, Nova Pro, Strands, AgentCore or Kiro Crew unless §1 changes; ask Moiz before claiming any dev tool
   other than Claude Code (docs/aws.md lists Kiro Crew and the Amazon Devices Builder Tools MCP: unconfirmed, see Q3).
5. **Who it's for**: adults in Germany learning German (integration-course learners at A2–B1) or learning English, who own a Fire TV and a
   phone; secondary: a household watching together (plan §1).
6. **Potential impact** (one paragraph; every number footnoted with its URL in a "Sources" list at the end of the file). Use only:
   - 363,466 new integration-course participants in 2024 (BAMF, "Bericht zur Integrationskursgeschäftsstatistik für das Jahr 2024",
     https://www.bamf.de/SharedDocs/Anlagen/DE/Statistik/Integrationskurszahlen/Bundesweit/2024-integrationskursgeschaeftsstatistik-gesamt_bund.pdf?__blob=publicationFile&v=2 ;
     the same report: 146,176 of them, about 40 %, voluntary).
   - 79 minutes of TV a day for ages 14–49 in 2024 (AGF Videoforschung press release, 2025-01-08,
     https://www.agf.de/fileadmin/agf/service/Pressemitteilungen/2025/250108_PM_Jahresbilanz_2024/250108_AGF_PM_TV_Jahresbilanz_2024.pdf ;
     secondary report: https://www.heise.de/news/Fernsehkonsum-in-Deutschland-2024-erneut-gesunken-10221980.html).
   - Research findings without invented effect sizes: Peters & Webb 2018 (incidental vocabulary from one TV episode), Rodgers & Webb 2020
     (gains across ten episodes), Montero Perez 2017 (glossed keyword captions), Roediger & Karpicke 2006 (56 % vs 42 % recall after a week,
     test vs restudy); URLs in the plan artifact's Sources list (copy them).
   - Numbers in the plan artifact that are **not** to be used unless re-verified at a primary source and cited: "about 307,000 in 2025",
     "roughly 60 % reach B1", "16 % of adults are learning a language" (the last comes from a commercial blog). Note: Behörden Spiegel
     (2026-03-17) reports a stop on new admissions to integration courses; keep the paragraph to the 2024 number and do not speculate about 2026.
7. **Tracks**: Fire TV (main track); AWS Builder mini-challenge (link docs/aws.md); Open Source mini-challenge (next section).
8. **Open source**: kit repo https://github.com/moiz-lakkadkutta/vega-media-kit · npm `@moizp/vega-media-kit` (version `0.1.0-alpha.0`;
   `[PLACEHOLDER: npm publish confirmed · owner Moiz · due Oct 15]`) · release tag `[PLACEHOLDER: kit release tag, e.g. v0.1.0 · owner Moiz · due Oct 15]`
   · GitHub handle `moiz-lakkadkutta` · upstream PR `[PLACEHOLDER: AmazonAppDev PR URL · owner Moiz · due Oct 18]` · Lingo repo
   https://github.com/moiz-lakkadkutta/lingo (MIT). State plainly that the kit's Vega adapter is experimental and not device-verified.
9. **Unique and substantially different from Described** (one paragraph, adapted from the runbook §2 callout; link https://github.com/moiz-lakkadkutta/described):
   different users (learners vs blind and low-vision viewers); different AI doing the load-bearing work (Transcribe + Translate + Nova Lite
   glosses and quiz vs video understanding + speech synthesis); different interaction model (pause and study, a second screen vs listening);
   different monetisation (Lingo Plus subscription). The shared kit is infrastructure, like both apps using React Native. Only name
   Described's services as they appear in Described's own README (Q4).
10. **Built with** (Devpost tags): from the code only: React Native, react-native-tvos, Expo, TypeScript, Node.js, Express, Zod, Prisma,
    PostgreSQL, pg-boss, Socket.IO, Amazon Transcribe, Amazon Translate, Amazon Bedrock, Amazon Nova Lite, Amazon S3, Amazon CloudFront,
    AWS CDK, Shaka Packager, ffmpeg, simplemma, Amazon Appstore IAP (sandbox, placeholder until LING-007), vega-media-kit, Vitest, Turborepo, pnpm.
    Vega SDK only if the Vega app exists by Oct 15.
11. **Challenges / Accomplishments / What we learned**: three bullets each, drawn from decisions 0006–0008 and the friction logs
    (Transcribe hesitation stops, per-cue Translate register, react-native-tvos key events, Vega TVEventHandler limits). Link the friction folder.
12. **What's next**: more languages through Translate; the open items from §1 that did not ship, named as next steps (not as features).
13. **Links** ("Try it out"): video `[PLACEHOLDER: YouTube URL · owner Moiz · due Oct 20]`, Lingo repo, kit repo, release tag, upstream PR, Described.
14. **Product feedback**: link docs/feedback.md (filled by LING-008) and docs/feature-requests.md.
15. **Claims register** (last section, not pasted into Devpost): a table, one row per factual claim in sections 2–13, with columns Claim · Status (§1 words) · Evidence (file or URL) · Placeholder?
    The reviewer audits B against this table.
16. **Sources**: every URL used, numbered to match the footnotes.

## 4. File C: docs/submission-checklist.md

A checkbox list grouped by date, each line "- [ ] item · owner · due · how to verify". Owners: **Moiz** (human: devices, filming,
voice-over, accounts, upload, final sign-off, submit), **Orchestrator** (dispatch, commit, push), **Scribe** (opus; docs),
**Reviewer** (fable; cold read), **LING-00x implementer** where a feature blocks a claim. Dates are 2026, Berlin time.

Rows to include (runbook §9 definition of done, mapped):

| DoD item (runbook §9) | Status 2026-10-01 | Owner | Due | Verify |
|---|---|---|---|---|
| Public GitHub repo, MIT LICENSE at root visible | LICENSE exists; repo visibility unknown, GitHub push broken from this environment | Moiz | Oct 15 | open the repo logged out |
| README ≤ 10-step setup, architecture, "what's new since Aug 31" | Present (README.md) | Scribe (LING-008) | Oct 15 | count steps |
| Runs on the stick **and** VVD, or documents why Vega is experimental | Neither verified; the Vega app installs, typechecks and bundles but has not run on the VVD | LING-003/008 + Moiz | Oct 15 | screenshots in README, or a written "Vega status" note linked from README |
| ≥ 3 Fire TV integrations (Content Launcher, Personalization, Media Controls; IAP) each with a screenshot or log in README | Code done for IAP, launch intents, and the kit calls for Personalization / Media Controls (kit no-ops); none verified on a device | LING-007 + Moiz | Oct 15 (freeze) | README section with one artifact each; anything missing is removed from the video and the Devpost text |
| Video < 3:00, public, device shown, a moment of Vega and of Fire OS | Not shot | Moiz | shoot Oct 16–18, cut Oct 19, **upload Oct 20** | ffprobe < 180 s; logged-out playback; visibility per the rules page |
| Text: what, how, who, impact with a cited number | Draft (file B) | Scribe, Reviewer | **forms Oct 21** | claims register has no Planned row without a placeholder resolved |
| Tracks Fire TV + AWS Builder + Open Source; kit repo, tag, handle, upstream PR | Tag and PR missing | Moiz | Oct 18 | links open |
| docs/aws.md lists every call with purpose and cost | Present; Polly listed under "Declared, not used"; Nova prices still unverified | Scribe | Oct 15 | matches §1; Nova price checked at https://aws.amazon.com/bedrock/pricing/ |
| Feedback (five answers), feature requests with priorities, ≥ 8 friction logs | Drafted, TBD-by-human items remain; 23 logs | Scribe (LING-008) | Oct 15 | all five answered |
| Tests pass in CI on the default branch; `pnpm i && pnpm dev` shows something | Baseline: one known TS failure (`apps/expo/RemoteBridge.tsx`) | Orchestrator | Oct 15 | CI green link |
| All materials in English | — | Reviewer | Oct 21 | read-through |

Then a dated run-down:
- Oct 8 (kill date): decide per §1 row whether the video shows it or uses the fallback. Owner Orchestrator, asks Moiz once.
- Oct 15 (freeze): all §1 rows re-checked; script statuses updated; kit tag + npm publish; aws.md corrected.
- Oct 16–18: shoot (file A §2.4–2.5). Oct 18: upstream PR URL in hand.
- Oct 19: edit; Reviewer (fable) watches the cut against the claims register.
- **Oct 20: upload** to YouTube; URL into file B.
- **Oct 21: Devpost forms filled** from file B; Reviewer reads the forms cold (someone who did not write them); `grep -n PLACEHOLDER` on files A/B prints nothing; Moiz signs off.
- **Oct 22, 23:00 Berlin: submit.** Re-read the deadline and timezone on https://amazonappdev2026.devpost.com/rules before this date (the runbook gives the deadline as Oct 23 21:00 without a timezone). Screenshot the confirmation.
- Before submit, re-read the rules page for the video visibility, the language rule and the mini-challenge fields, and record any difference in this file (this environment could not fetch the rules page; egress blocked on 2026-10-01).

## 5. Wording and lint

- `pnpm lint:words` only scans `packages/shared-ui/src/**` and `apps/phone/src/**`, so it passes on docs by construction. Run it anyway (must exit 0)
  **and** run the equivalent check on the three new files, which must print nothing:
  `grep -niE "streak broken|\bfailed\b|\bwrong\b|wrong answer" docs/video-script.md docs/submission.md docs/submission-checklist.md`
  (write around it: "not yet passing", "the right answer is shown", "did not work").
- Decision 0002 in prose too: "Welcome back"; levels "about A2" / "approximate CEFR"; warm, short, specific. English only.
- Every number has a footnote or inline source; numbers taken from repo files cite the file path.

## 6. Acceptance checks (the implementer runs these before returning)

1. The three files exist; no other file changed (`git status --porcelain` shows only them).
2. File A: a row per S01–S09 (S07 split a/b/c) with all nine columns; times are contiguous from 0:00 to 2:45; S05 says "both screens in one frame" and "one continuous take"; S07b is 2 s; every Planned feature row has a Fallback.
3. Voice-over word count in file A ≤ 380 (`awk` or manual count, state the number at the top).
4. File B: all 16 sections; elevator pitch ≤ 200 characters (state the count); every number footnoted to a URL in Sources; claims register covers every claim.
5. File C: every runbook §9 item present with owner, due date and verify step; Oct 20 / Oct 21 / Oct 22 23:00 Berlin appear.
6. `grep -n "PLACEHOLDER"` lists only the placeholders this plan names (or newer ones following §1.1), each with owner and due.
7. `pnpm lint:words` exits 0 and the §5 grep prints nothing.
8. None of these appear as built claims: Content Launcher voice search, Fire TV Personalization, Polly, Nova Pro, Strands, AgentCore, Lingo playing video on Vega or running on the VVD. Client IAP and the TV quiz score from the phone are code done, not on device (refreshed 2026-10-02): claim them only when the take shows them working.

## 7. Risks and open questions

- **R1** Many video beats depend on LING-003/005/006/007/008, all open on Oct 1. The script is written so each has a fallback that is true
  without the feature; the Oct 8 kill date picks per row.
- **R2** Fire TV Stick availability and spike S1 are unknown. Without a stick, the "device shown" rule fails: escalate.
- **R3** `packages/shared-ui/src/strings.ts` `explain.saved(1)` renders "Saved. 1 words this clip." and S05 will show exactly n = 1.
  Fix before the shoot (plural form). Owner: LING-005 implementer; not part of this ticket.
- **R4** Gate C (gloss quality) is not passing; S04/S05 must show a spot-checked gloss (F5).
- **R5** docs/aws.md: Polly moved to "Declared, not used" (LING-008); Nova Lite prices are still unverified. The Devpost text links it.
- **Q1** Should `scripts/lint-words.mjs` also scan `docs/*.md`? Out of scope here (this plan touches docs only); orchestrator decides.
- **Q2** YouTube visibility: the runbook says "unlisted" in week 5 and "public" in the definition of done. Default **public** unless the rules page says otherwise.
- **Q3** Were Kiro Crew and the Amazon Devices Builder Tools MCP actually used? docs/aws.md says so; nothing in the repo shows it. Moiz confirms or the claim goes.
- **Q4** Described's current feature set (for the uniqueness paragraph) is not in this checkout; read its README before Oct 21.
