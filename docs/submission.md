# Lingo: Devpost submission draft

Devpost draft for Lingo. Paste-ready. Status as of 2026-10-19.

How to use this file:
- Each section below is headed with the Devpost field it fills. Paste the text under "Paste:" as it stands.
- Footnote numbers (¹ ²…) point to §16 Sources. On Devpost, write each source inline as a link, or paste §16 as the last block of "About the project".
- §15 (claims register) is **not** pasted. The Reviewer audits every claim in §2–§13 against it.
- Placeholders follow docs/plans/LING-009.md §1.1. Everything the repo or public sources could answer was filled on 2026-10-15, and Moiz's answers of 2026-10-19 were applied that day ("reported by Moiz 2026-10-19"); what only Moiz can still supply is marked `<!-- HUMAN: ... -->`. `grep -n "PLACEHOLDER\|HUMAN:" docs/submission.md` lists every open item. On Oct 21 none may remain: each is either filled with the real value or the sentence that needed it is deleted. HTML comments are not pasted.
- Re-check docs/plans/LING-009.md §1 at the Oct 15 freeze. Any feature that lands moves from "What's next" into "What it does", and its row in §15 changes status.

---

## 1. Project name

Paste:

> Lingo

## 2. Elevator pitch (Devpost "Tagline", ≤ 200 characters)

Length: 136 characters (checked with `len()`).

Paste:

> Learn German or English from the TV you already watch: two subtitle lines, a pause that explains, and a phone that quizzes you tomorrow.

## 3. What it does (About the project → What it does)

Length: 118 words (limit for this section: 120).

Paste:

> Lingo turns a 3–8 minute clip on Fire TV into a German or English lesson. Two subtitle lines play together: the language you are learning, large and bright, and your own language, small and cool. One or two words per line are marked as worth learning at your level, an approximate CEFR band worked out from word frequency. Pause, and the Explain card gives the word's meaning, one grammar note and the line itself as the example. Save the word, and it appears on your paired phone within a second. The phone quizzes you and spaces each review further out with SM-2, scheduled on the server. Lingo Plus (sandbox) adds Challenge mode, unlimited saved words and slower playback.

The Lingo Plus sentence stays: a sandbox purchase completed in Amazon App Tester on the Fire TV Stick (device run rows 30–34, 2026-10-15..18, reported by Moiz 2026-10-19).

## 4. How we built it (About the project → How we built it)

Paste:

> Lingo is a pnpm + Turborepo monorepo: one TV UI package, a phone app, an API and a media pipeline.
>
> ```
> TV (vega/expo → shared-ui → kit)      Phone (Expo)
>   Home · Player(dual cues) · Explain    Join · Live saved words · Quiz (SM-2) · Progress
>   Summary · Quiz · Words · Settings          │ Socket.IO room = session code
>          └──────────── REST + Socket.IO ────┘
> apps/api (Express, Prisma, pg-boss, Socket.IO) → packages/pipeline: Transcribe → segment (42×2, 20 cps) → Translate → lemmatize+rank → highlights → Nova Pro glosses → quiz (code) → package → publish
> ```
>
> **The pipeline** is a plain command-line tool (`pnpm pipeline prepare`) that runs its steps in order; there is no agent framework. Amazon Transcribe produces the spoken line with word timings. Our segmenter cuts it into subtitle cues that keep to broadcast reading limits: at most 42 characters per line, two lines, 20 characters per second, and 1 to 7 seconds on screen.¹ A cue that breaks a limit stops the build; there is no tolerance flag. Amazon Translate writes the second-language line, one cue at a time so the two tracks stay aligned, with its Formality and Brevity settings. Each word is lemmatized with simplemma² and ranked against an open subtitle frequency list (hermitdave/FrequencyWords, CC BY-SA 4.0).³ One or two words per cue, in the band just above the clip's level, become highlights; names and numbers never do, and at most 40 % of cues carry one. Amazon Nova Pro on Amazon Bedrock writes each highlight's gloss and returns its grammar facts (article, plural, verb forms), which code renders into the grammar note, through the Converse API with forced tool use, Zod validation and checks in code; we chose it over Nova Lite by scoring both on a hand-checked set of words. The quiz is then built by code from those glosses, with no model call: "what does this word mean" and fill-the-gap items, each with the right answer and three other options taken from the clip's highlights of the same part of speech, spread across the whole clip. Shaka Packager packages video and both WebVTT tracks, and Amazon S3 + CloudFront serve them. The AWS stack is AWS CDK.
>
> **The API** (Express, Zod, Prisma on PostgreSQL, pg-boss, Socket.IO) keeps learners, saved words and reviews. Spaced repetition is literal SM-2, the published scheduling algorithm,⁴ and it runs on the server, so the TV and the phone always agree on what is due.
>
> **TV and phone** share one Socket.IO room per 6-character session code (QR or typed). Saving a word on the TV reaches the phone in under one second at p95 in our integration test.⁵
>
> **One UI for Fire OS and Vega.** All TV screens live in one `shared-ui` package, which CI keeps free of imports that cannot run on Vega; the Vega app's own imports are checked against Amazon's supported-library list; the platform apps are thin entries. Playback and subtitle parsing come from vega-media-kit, our MIT-licensed open-source library (see Open source). The kit's Vega adapter is experimental and not yet verified on a device.

> Vega OS: experimental — the same shared-ui screens build with React Native for Vega 0.83 and run on the Vega Virtual Device (SDK 0.24, 2026-10-14): Home, the rail, Clip and Words render with the live catalog; video playback is off on Vega until the kit's player is rewritten, and the Player says so on screen.

## 5. Who it's for (About the project → custom heading "Who it's for")

Paste:

> Adults in Germany who are learning German, especially integration-course learners at about A2–B1, or who are learning English, and who own a Fire TV and a phone. A second user is the household around them: one person learning, another watching along. Lingo asks nobody to type on the TV; the only typing in the whole system is the 6-character pairing code on the phone.

## 6. Potential impact (About the project → custom heading "Potential impact")

Paste:

> In 2024, 363,466 people started an integration course in Germany; 146,176 of them, about 40 %, joined voluntarily.⁶ People aged 14–49 in Germany watched 79 minutes of television a day in 2024.⁷ Research on subtitled television shows that viewers pick up vocabulary from a single episode without trying (Peters & Webb 2018)⁸ and gain more across ten episodes (Rodgers & Webb 2020);⁹ captions that gloss a few keywords help learners recall meanings better than plain captions (Montero Perez et al. 2017).¹⁰ Testing yourself beats re-reading: a week later, students who practised retrieval recalled 56 % of a text, against 42 % for those who restudied it (Roediger & Karpicke 2006).¹¹ Lingo puts that evidence on the screen people already spend their evenings with, in the language pairs that matter in Germany, and leaves the review on the phone in their pocket.

Do **not** add (plan §3.6): "about 307,000 in 2025", "roughly 60 % reach B1", "16 % of adults are learning a language". None is re-verified at a primary source. Behörden Spiegel (2026-03-17) reports a stop on new admissions to integration courses; keep the paragraph to the 2024 number and do not speculate about 2026.

## 7. Tracks (Devpost "Which track / challenges")

Select:

- **Fire TV** (main track).
- **AWS Builder mini-challenge.** Evidence: docs/aws.md (every AWS call, its purpose and cost) and `infra/` (AWS CDK).
- **Open Source mini-challenge.** Evidence: §8.

Form fields: AWS Builder asks for the documented AWS integrations (docs/aws.md); Open Source asks for a contribution URL, a repo URL, a GitHub username and a description (§8) (checked on the rules page 2026-10-14). Judging: Stage 1 is pass/fail (theme fit and required technology); Stage 2 scores four equally weighted criteria, Technological Implementation, Design, Potential Impact and Quality of the Idea; friction logs earn up to a 10 % bonus. The repo must be public with a licence file (checked on the rules page 2026-10-14).

## 8. Open source (mini-challenge fields)

Paste:

> - Library: **vega-media-kit**, MIT. Repo: https://github.com/moiz-lakkadkutta/vega-media-kit
> - npm: `@moizp/vega-media-kit`, version `0.1.0`, https://www.npmjs.com/package/@moizp/vega-media-kit
> - Release tag: `v0.1.0`, https://github.com/moiz-lakkadkutta/vega-media-kit/releases/tag/v0.1.0
> - GitHub handle: `moiz-lakkadkutta`
> - Upstream contribution: https://github.com/AmazonAppDev/vega-scrolling-sample/pull/26 (README fix: the stale Kepler CLI commands replaced with `vega virtual-device start` / `vega run-app`)
> - App repo: https://github.com/moiz-lakkadkutta/lingo (MIT)
>
> vega-media-kit is a React Native player and subtitle library for Fire TV apps: one player component (`KitPlayer`) with Fire OS and web adapters, a WebVTT parser with a subtitle-limit linter (2 lines × 42 characters, 20 characters per second), a cue overlay with 10-foot defaults, remote-key and focus helpers, and Fire TV platform bindings. On Fire OS it is verified on a Fire TV Stick (playback, two text tracks at once, seek, pause, 0.75×). Its Vega OS adapter is experimental and has not been run on a Vega device or the Vega Virtual Device yet.

## 9. Unique and substantially different from Described (About the project → custom heading)

Paste:

> Lingo and our other entry, Described (https://github.com/moiz-lakkadkutta/described), share one open-source library, vega-media-kit, the way two apps can both use React Native: it is infrastructure. Beyond the kit they share only AWS building blocks (Amazon Transcribe, Amazon Bedrock, Amazon S3 and CloudFront) and ffmpeg; the users, the AI task, the interaction and the business model differ. **Users:** Lingo is for language learners; Described is for blind and low-vision viewers. **The AI that does the work:** in Lingo, Amazon Transcribe, Amazon Translate and Amazon Nova Pro turn speech into aligned two-language subtitles and word glosses, and code builds the quiz from them; in Described, Qwen3-VL on Amazon Bedrock describes each shot, Nova Lite fits the narration into the gaps between dialogue, Amazon Polly voices it and ffmpeg ducks the soundtrack, and the narration arrives as a second audio track. **Interaction:** Lingo is pause-and-study with a second screen that quizzes you; Described is listening. **Business model:** Lingo sells a Lingo Plus subscription through Amazon in-app purchasing.

Described's services are named as its README names them (https://github.com/moiz-lakkadkutta/described; checked against Described's README 2026-10-14).
The "Business model" sentence stays: a Lingo Plus sandbox purchase completed in App Tester on the stick (device run rows 30–34, reported by Moiz 2026-10-19).

## 9a. How Lingo differs from subtitle-learning apps (About the project → custom heading)

Paste:

> Apps like Lingopie bring clickable subtitles to the TV, but that service's own page says its interactive subtitles are easier to use on a phone or computer than on the TV.¹³ Lingo is built for the remote: it chooses the words for your level, Pause explains them, and your phone takes over the review. An AWS pipeline turns any licensed clip into a lesson without hand-subtitling.

The pasted text names the compared service once, only as the source of its own statement (source ¹³); the rules' "no third-party trademarks" line is listed for the video (§17), so the video never names or shows it. Re-check that line on the rules page before pasting; if it covers the text too, go back to "Some language apps bring clickable subtitles to the TV, but one such service's own page says …". Do **not** claim that the compared app has no phone app, no grammar explanations, no spaced repetition or no slower playback: its own page lists all four (source ¹³). Do not claim it lacks TV-to-phone sync either; its page is silent on it, which is not evidence.

## 10. Built with (Devpost tags)

Paste (one tag each):

> React Native, react-native-tvos, Expo, TypeScript, Node.js, Express, Zod, Prisma, PostgreSQL, pg-boss, Socket.IO, Amazon Transcribe, Amazon Translate, Amazon Bedrock, Amazon Nova Pro, Amazon S3, Amazon CloudFront, Amazon Appstore IAP, AWS CDK, Shaka Packager, ffmpeg, simplemma, vega-media-kit, Vega SDK, Vitest, Turborepo, pnpm

Add only when true:
- "Amazon Appstore IAP" is in the list above: a Lingo Plus sandbox purchase completed in App Tester on the Fire TV Stick (device run rows 30–34, reported by Moiz 2026-10-19).
- "Vega SDK" is in the list above: `apps/vega` is a Vega project built with Vega SDK 0.24.12112 and Vega CLI 1.4.4 and runs on the Vega Virtual Device (docs/spikes/2026-10-14-vega-vvd.md, apps/vega/README.md).

## 11. Challenges, accomplishments, what we learned

Friction logs for all of these: https://github.com/moiz-lakkadkutta/lingo/tree/main/docs/friction

### Challenges we ran into

Paste:

> - **Hesitations became sentences.** Amazon Transcribe puts a full stop after a hesitation ("hat.", "aber."), which produced one-word cues padded to a second. We now repair a stop when the next word continues the clause, and let pauses (not only characters) end a cue.
> - **One cue at a time switches register.** Translating each subtitle on its own made neighbouring lines of one conversation jump between "Sie" and "du". Amazon Translate's Formality and Brevity settings fixed the register and length while keeping the two tracks aligned one-to-one.
> - **The first glosses were not good enough.** On our first quality check, Amazon Nova Lite's glosses for the English clip scored about 6 of 15. We built a scored set of test words, added checks in code (no invented words, the word itself, not its neighbour), measured Nova Lite, Nova 2 Lite and Nova Pro on it, and moved to Nova Pro, which scored best. Nova Pro then produced no valid quiz plan in three real runs, so code now builds the quiz from the checked glosses. The check passed on human-scored sheets for both languages on 2026-10-10.
> - **Remote keys differ by OS.** Plain React Native on Fire OS has no TV event handler, so we moved the Fire OS app to react-native-tvos. On Vega a key handler observes keys but cannot consume them, so word focus in the subtitle uses the platform's own focus on per-word buttons instead of custom key handling.

### Accomplishments that we're proud of

Paste:

> - A hard subtitle gate: every target-language cue keeps to 42 characters × 2 lines, 20 characters per second and 1–7 seconds, and it passes on real broadcast clips, not just test fixtures.
> - A save on the TV reaches the phone in under a second at p95, proved by an integration test rather than a demo.
> - One TV UI package written once for Fire OS and Vega, with the platform differences (playback speed, where word focus lives) in a single capabilities file.

### What we learned

Paste:

> - Real speech needs pauses and speaker changes in the segmenter. Characters and duration alone produce subtitles a viewer cannot read.
> - Check the platform's media features before designing for them: Vega's W3C media package lists `playbackRate` as unsupported, so slower playback is a Fire OS feature for now.
> - Choose the model by measurement, and let code do what code can. We started on Amazon Nova Lite, whose model card lists Bedrock structured outputs as not supported, so we forced the schema with tool use plus Zod validation; that path carried over unchanged to Nova Pro. The quiz needed exact rules (part of speech, three options, spread over the clip), and a deterministic planner in code applies them directly.

## 12. What's next (About the project → What's next for Lingo)

Paste:

> - More languages, through Amazon Translate: the pipeline already takes the target and native language as parameters.
> - Content Launcher, so a viewer can ask for a clip by voice and land in Lingo.
> - Fire TV Personalization, so your place in each clip is kept.
> - Video on Vega, and Lingo on Vega devices: today it runs on the Vega Virtual Device, without video.

Before pasting, delete any line whose feature shipped by Oct 15 and move it into §3. Re-checked 2026-10-19: the phone-to-TV quiz score and the TV quiz passed the device run (rows 40 and 43, reported by Moiz 2026-10-19), so their line was deleted; §3 is at its 120-word limit and already says the phone quizzes you, so it is not lengthened. Re-checked 2026-10-15 against docs/plans/LING-009.md §1 and TASKS.md: none of the then five lines was Built. Translate takes more target languages but only en/de clips and natives exist; Content Launcher voice search and Fire TV Personalization are not built (kit bindings are no-ops, KIT-007, TASKS.md LING-007 E1–E4); the phone-to-TV quiz score and the TV quiz were then code done, not on device (claims register C36); Vega runs on the Vega Virtual Device without video (KIT-010), so the last line was reworded.

## 13. Links (Devpost "Try it out" and video)

Paste:

> - Video: <!-- HUMAN: paste the public YouTube or Vimeo URL after the Oct 20 upload. -->
> - Lingo repo: https://github.com/moiz-lakkadkutta/lingo
> - vega-media-kit repo: https://github.com/moiz-lakkadkutta/vega-media-kit
> - vega-media-kit release: https://github.com/moiz-lakkadkutta/vega-media-kit/releases/tag/v0.1.0
> - Upstream PR: https://github.com/AmazonAppDev/vega-scrolling-sample/pull/26
> - Described: https://github.com/moiz-lakkadkutta/described

## 14. Product feedback (Devpost feedback fields)

Paste the five required answers from docs/feedback.md and link the feature requests:

> - Feedback: https://github.com/moiz-lakkadkutta/lingo/blob/main/docs/feedback.md
> - Feature requests, with priorities: https://github.com/moiz-lakkadkutta/lingo/blob/main/docs/feature-requests.md
> - Friction logs: https://github.com/moiz-lakkadkutta/lingo/tree/main/docs/friction

The "TBD by human" lines in docs/feedback.md were filled on 2026-10-19 from Moiz's answers (onboarding hours, the VVD spike hours, Yes, the App Tester run) and a Sie/du count over the published cue files; docs/feature-requests.md has a prioritised row for every friction log. Moiz's sign-off is the checklist's Oct 21 item.

## 15. Claims register (not pasted; the Reviewer audits against this)

Status words from docs/plans/LING-009.md §1: **Built** · **Code done, not on device** · **Planned / Not built** · **Not planned**; since 2026-10-19 also **Built, run on device** (the Fire TV Stick device run, docs/spot-checks/2026-10-14-device-run.md, run 2026-10-15..18, all rows passed, reported by Moiz 2026-10-19). A claim whose status is not Built may only be pasted when its placeholder is resolved.

| # | Section | Claim | Status | Evidence | Placeholder? |
|---|---|---|---|---|---|
| C1 | §2, §3 | Two subtitle lines, target large and bright, native small and cool | Built, run on device (Fire TV Stick, 2026-10-15..18, reported by Moiz); device run row 11 | decision 0006; `packages/shared-ui/src/components/DualCue.tsx`; LING-003 | No |
| C2 | §3 | Clips are 3–8 minutes | Built (content rule) | docs/content.md "What qualifies" | No |
| C3 | §3 | One or two marked words per line, approximate CEFR band from frequency | Built (pipeline) | decision 0008 §9; `packages/pipeline/src/highlights.ts` | No |
| C4 | §3, §2 | Pause opens the Explain card: meaning, grammar note, line as example | Built, run on device (Fire TV Stick, 2026-10-15..18, reported by Moiz), device run rows 12, 22; gloss quality: Gate C passed 2026-10-10 (human-scored sheets, ≥ 90 %; Nova Pro v1, gloss prompt v7) | decision 0006; decision 0001 Gate C; docs/spot-checks/2026-10-05-gate-c-en-r3.md, 2026-10-10-gate-c-de-r3.md; LING-002/003 | No (spot-checked word only in the video) |
| C5 | §3 | Saved word appears on the paired phone within a second | Built (< 1 s p95 in test); Built, run on device (Fire TV Stick, 2026-10-15..18, reported by Moiz), device run row 25 | decision 0005; `apps/api/test/realtime.test.ts`; docs/spot-checks/2026-10-14-device-run.md | No |
| C6 | §3, §2 | Phone quizzes you; SM-2, server-side | Built (server, tests); phone deck Built, run on device (Fire TV Stick, 2026-10-15..18, reported by Moiz), device run rows 38–42, the phone app as a web page in Chrome on an Android phone, opened from the TV's pair QR (no Expo Go, no native build; reported by Moiz 2026-10-19) | `apps/api/src/lib/sm2.ts`; `apps/phone/src/screens/QuizScreen.tsx`; decision 0011; LING-006 | No |
| C7 | §3, §9 | Lingo Plus (sandbox): Challenge mode, unlimited saves, slower playback | Fire OS: Built, run on device (Fire TV Stick, 2026-10-15..18, reported by Moiz): a sandbox purchase completed in Amazon App Tester, device run rows 30–34; server RVS sandbox check Built. Vega: code done, VVD IAP sandbox not run | `packages/shared-ui/src/plus/flow.ts`; `apps/expo/src/fireosStore.ts`; `apps/vega/src/iap/vegaStore.ts`; `apps/api/src/routes/iap.ts`; decision 0012; docs/spot-checks/2026-10-14-device-run.md | No (resolved 2026-10-19; README screenshot pending) |
| C8 | §4 | Pipeline is a plain CLI, no agent framework | Built | docs/aws.md; `packages/pipeline` | No |
| C9 | §4 | Transcribe with word timings | Built | decision 0001 Gate A; `packages/pipeline/src/*` | No |
| C10 | §4 | Cues ≤ 42 × 2, ≤ 20 cps, 1–7 s, hard gate, no tolerance flag | Built | decision 0007 §1; source ¹ | No |
| C11 | §4, §11 | Translate per cue, aligned 1:1, Formality + Brevity settings | Built | decision 0008 §11 | No |
| C12 | §4 | simplemma lemmatizer; FrequencyWords list, CC BY-SA 4.0 | Built | decision 0004; docs/aws.md Sources; sources ² ³ | No |
| C13 | §4 | Highlights in the band above the clip level; no names or numbers; ≤ 40 % of cues | Built | decision 0008 §8–§9; PLAN non-negotiables | No |
| C14 | §4 | Nova Pro v1 via Converse, forced tool use, Zod; chosen over Nova Lite by measurement; quiz built by code from the glosses (meaning + fill-the-gap, 3 same-part-of-speech options from the clip's highlights, spread over the clip, no model call) | Built (Gate C passed 2026-10-10: human-scored sheets ≥ 90 %, Nova Pro v1, gloss prompt v7, quiz by code; 12 clips published 2026-10-14) | docs/aws.md; decision 0001 Gate C; decision 0009 (Round 2, Round 6); `packages/pipeline/src/ai/quiz.ts` (`makeQuiz`, `fallbackPlan`); docs/content-status.md §Published | No |
| C15 | §4 | Shaka Packager; S3 + CloudFront; AWS CDK | Built | `infra/lib/media-stack.ts`, `infra/lib/nova-ingest-stack.ts` | No |
| C16 | §4 | Express, Zod, Prisma, PostgreSQL, pg-boss, Socket.IO | Built | `apps/api` | No |
| C17 | §4 | SM-2, the published scheduling algorithm (source ⁴, a flashcard app's FAQ, named neutrally) | Built | `apps/api/src/lib/sm2.ts`; source ⁴ | No |
| C18 | §4, §5 | 6-character session code, QR or typed; only typing in the system | Built (server, pairing); phone Join (QR or typed code) Built, run on device (Fire TV Stick, 2026-10-15..18, reported by Moiz), device run rows 4a, 4b, 5–8, 10, the phone app as a web page in Chrome on an Android phone, opened from the TV's pair QR (no Expo Go, no native build; reported by Moiz 2026-10-19) | decision 0005; decision 0011; `apps/phone/src/screens/JoinScreen.tsx` | No |
| C19 | §4, §11 | One `shared-ui` package for Fire OS and Vega; CI keeps `shared-ui` free of imports that cannot run on Vega (a deny-list, TASKS.md B-L1), and `apps/vega`'s imports are checked against an allowlist from Amazon's supported-library page (`ALLOWED_IMPORTS` in `scripts/check-vega.mjs`) | Built as code (both guards in CI); Fire OS app Built, run on device (Fire TV Stick, 2026-10-15..18, reported by Moiz); Vega app Code done, not on device (experimental): built with SDK 0.24 and run on the Vega Virtual Device 2026-10-14 (Home, rail, Clip, Words with the live catalog; Pair/QR, Quiz, S2 questions not run there); no physical Vega device; no video until KIT-010, the Player shows the playback-off message | CLAUDE.md; `packages/shared-ui`; `scripts/check-vega.mjs`; `apps/vega/README.md`; decision 0013; docs/spikes/2026-10-14-vega-vvd.md (screenshots, `2026-10-14-vega-home-to-words.mp4`) | No (Vega sentence filled 2026-10-14) |
| C20 | §4, §8 | Kit Vega adapter experimental, not device-verified | Built (honest status) | ../vega-media-kit README §Status | No |
| C21 | §6 | 363,466 new integration-course participants in 2024; 146,176 (about 40 %) voluntary | Sourced number | source ⁶ | No |
| C22 | §6 | 79 min of TV a day, ages 14–49, 2024 | Sourced number | source ⁷ (secondary report ⁷ᵃ) | No |
| C23 | §6 | Peters & Webb 2018; Rodgers & Webb 2020; Montero Perez et al. 2017 | Sourced research, no effect sizes claimed | sources ⁸ ⁹ ¹⁰ | No (¹⁰ URL added 2026-10-15) |
| C24 | §6 | Retrieval practice: 56 % vs 42 % after a week | Sourced number | source ¹¹ | No |
| C25 | §7 | AWS Builder: every AWS call listed with purpose and cost | Built: docs/aws.md lists Polly under "Declared, not used"; Nova, Transcribe and Translate prices checked 2026-10-15 against the AWS Price List API, and `MODEL_PRICES` in `packages/pipeline/src/ai/cost.ts` carries `verified: true` for every model; S3 and CloudFront prices not checked; actual spend from Cost Explorer (Lingo ≈ $2.27, 2026-10-01..19) and the credentials gap (pipeline ran under the developer profile, not `PipelineRole`) recorded 2026-10-19 | docs/aws.md "Prices checked 2026-10-15"; `packages/pipeline/src/ai/cost.ts`; plan R5 | No |
| C26 | §8 | vega-media-kit MIT, release tag `v0.1.0`, npm `0.1.0`, upstream PR | Built: tag `v0.1.0` and GitHub release published 2026-10-14; npm `@moizp/vega-media-kit` 0.1.0, MIT, published 2026-10-15 (`npm view`, checked 2026-10-19); upstream PR opened 2026-10-19 | ../vega-media-kit/package.json (0.1.0 at the tag); https://github.com/moiz-lakkadkutta/vega-media-kit/releases/tag/v0.1.0; https://www.npmjs.com/package/@moizp/vega-media-kit; https://github.com/AmazonAppDev/vega-scrolling-sample/pull/26 | No |
| C27 | §8 | Kit verified on a Fire TV Stick (Fire OS): playback, two text tracks, seek, pause, 0.75× | Built (kit device matrix, 2026-09-26) | ../vega-media-kit/README.md §Status; ../vega-media-kit/docs/device-matrix.md | No |
| C28 | §9 | Described: blind and low-vision viewers; Qwen3-VL on Bedrock describes shots, Nova Lite fits narration into dialogue gaps, Polly voices it, ffmpeg ducks the soundtrack, second audio track | Sourced (Described's README, read 2026-10-14) | https://github.com/moiz-lakkadkutta/described README; source ¹⁴ | No |
| C29 | §11 | Hesitation stops repaired; pauses bound cues | Built | decision 0008 §1–§2; friction `2026-10-01-transcribe-punctuation-and-diarization-unreliable.md` | No |
| C30 | §11 | Fire OS moved to react-native-tvos; Vega key events observed, not consumed; native focus per word | Fire OS: Built, run on device (Fire TV Stick, 2026-10-15..18, reported by Moiz), device run rows 12–24 (media keys, word focus); Vega: code done, decision only | decision 0006; friction `…fire-os-expo-template-has-no-tv-event-handler.md`, `…vega-playbackrate-tveventhandler-backhandler-limits.md` | No |
| C31 | §11 | Vega `playbackRate` unsupported → 0.75× Fire OS only | Built (as a design decision, `caps.rate`) | decision 0006 §4 | No |
| C32 | §11 | Started on Nova Lite, whose model card lists Bedrock structured outputs as not supported → forced tool use + Zod; same path used with Nova Pro; quiz planner in code | Built (history for Nova Lite; Nova Pro's structured-outputs support not checked, so not claimed) | docs/aws.md; friction `…bedrock-nova-lite-temperature-structured-outputs-eol.md`; decision 0009 Round 6 | No |
| C33 | §12 | Content Launcher voice search, Fire TV Personalization, Lingo on Vega devices: named as next steps only. The TV quiz and the phone's score on the TV passed the device run (rows 40, 43), so their §12 line was deleted | Not built (voice search, Personalization, Vega devices) · Built, run on device (Fire TV Stick, 2026-10-15..18, reported by Moiz) (TV quiz, score) | plan §1; docs/spot-checks/2026-10-14-device-run.md | No |
| C34 | §13 | Video link | Filmed, with the save words registrieren and Konsulat as planned (reported by Moiz 2026-10-19); not cut or uploaded yet | docs/video-script.md §2 | **Yes** (HUMAN: URL after the upload) |
| C35 | §14 | Feedback and feature requests filled | Filled 2026-10-19 (five answers from Moiz's answers of that day; a prioritised request for each of the 36 friction logs); the human's sign-off remains (checklist Oct 21) | docs/feedback.md, docs/feature-requests.md | No |
| C36 | — | **Never claim:** Content Launcher voice search, Fire TV Personalization, Fire TV Media Controls (the kit's bindings are no-ops, KIT-007), Amazon Polly (in Lingo; §9 names it only as Described's), Strands Agents, AgentCore, Lingo playing video on Vega, Vega IAP run on the VVD, Kiro Crew / Devices Builder Tools MCP (not used, reported by Moiz 2026-10-19). May be claimed for Fire OS since the device run (reported by Moiz 2026-10-19): the client IAP sandbox purchase, the Content Launcher deep link `lingo://clip/<slug>` (row 47), the remote's media keys (rows 12–15) and the TV quiz score from the phone (row 40) | Not built / Not used | plan §1, §6 check 8; docs/spot-checks/2026-10-14-device-run.md | — |
| C37 | §9a | Lingopie's TV app has clickable subtitles that its own page calls easier to use on mobile or computer; Lingo picks the words per level, Pause explains, the phone reviews, the pipeline needs no hand-subtitling | Sourced (Lingopie) · rests on C3, C4, C5, C6, C8 (C4 and the phone deck run on device 2026-10-15..18) | source ¹³; C3–C8 | No |
| C38 | §11 | First Nova Lite glosses ≈ 6 of 15 on the English clip; set of test words, checks in code; Nova Pro scored best; no valid model quiz plan in three runs → quiz by code; passed 2026-10-10 on human-scored sheets, both languages | Built | decision 0009 (Context, Eval results, Round 6); decision 0001 Gate C; docs/aws.md; friction `…bedrock-nova-lite-temperature-structured-outputs-eol.md` | No |
| C39 | video S07d (docs/video-script.md §3) | "Preparing a clip costs about 25 cents in AWS calls" (caption "about 25 cents a clip (estimate)"); not pasted in the Devpost text | Estimate; Nova, Transcribe and Translate prices checked 2026-10-15 (S3 and CloudFront not checked) | docs/aws.md "Cost per clip and for the 12-clip batch": ≈ $2.9 for 12 clips, one native (≈ $0.24 a clip, rounded to about 25 cents; was ≈ $3.9 before Transcribe's current $0.006/min was checked); docs/content-status.md §Published: ≈ $5.21 spent so far, reruns and gate runs included, at the old prices (the project total, not a per-clip price); Cost Explorer actual for Lingo 2026-10-01..19 ≈ $2.27 (docs/aws.md "Actual spend"). Any per-clip figure in the video or this file uses "about 25 cents a clip (estimate)" | No |

## 16. Sources

Numbers match the footnotes above. Repo files are cited by path in §15.

1. Timed Text Style Guide, English (USA), of a streaming service (42 characters per line, 20 characters per second): https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide
2. simplemma (MIT): https://github.com/adbar/simplemma
3. hermitdave/FrequencyWords (OpenSubtitles 2018), CC BY-SA 4.0: https://github.com/hermitdave/FrequencyWords · licence https://creativecommons.org/licenses/by-sa/4.0/
4. FAQ of an open-source flashcard app, "What spaced repetition algorithm does it use?" (describes its scheduler as based on SM-2): https://faqs.ankiweb.net/what-spaced-repetition-algorithm
5. Lingo repo: docs/decisions/0005-realtime-session.md and `apps/api/test/realtime.test.ts` (TV save → phone receive < 1 s p95).
6. BAMF, "Bericht zur Integrationskursgeschäftsstatistik für das Jahr 2024" (363,466 new participants; 146,176 voluntary): https://www.bamf.de/SharedDocs/Anlagen/DE/Statistik/Integrationskurszahlen/Bundesweit/2024-integrationskursgeschaeftsstatistik-gesamt_bund.pdf?__blob=publicationFile&v=2
7. AGF Videoforschung, press release 2025-01-08, TV year 2024 (79 minutes a day, ages 14–49): https://www.agf.de/fileadmin/agf/service/Pressemitteilungen/2025/250108_PM_Jahresbilanz_2024/250108_AGF_PM_TV_Jahresbilanz_2024.pdf
   7a. Secondary report (heise online): https://www.heise.de/news/Fernsehkonsum-in-Deutschland-2024-erneut-gesunken-10221980.html
8. Peters, E. & Webb, S. (2018). Incidental vocabulary acquisition through viewing L2 television and factors that affect learning. *Studies in Second Language Acquisition*: https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/abs/incidental-vocabulary-acquisition-through-viewing-l2-television-and-factors-that-affect-learning/0E45A630F37C48A5BDB6CC3F725ADDC9
9. Rodgers, M. P. H. & Webb, S. (2020). *ITL – International Journal of Applied Linguistics*: https://www.jbe-platform.com/content/journals/10.1075/itl.18034.rod
10. Montero Perez, M., Peters, E. & Desmet, P. (2018; online 2017). Vocabulary learning through viewing video: the effect of two enhancement techniques. *Computer Assisted Language Learning*, 31(1–2), 1–26 (the glossed keyword captions group scored best on form recognition and meaning recall; abstract read through OpenAlex 2026-10-15): https://doi.org/10.1080/09588221.2017.1375960
11. Roediger, H. L. & Karpicke, J. D. (2006). Test-enhanced learning. *Psychological Science*: https://colinallen.dnsalias.org/Readings/2006_Roediger_Karpicke_PsychSci.pdf
12. Hackathon rules: https://amazonappdev2026.devpost.com/rules
13. A subtitle-learning service's own "What is …" page (features and TV apps; says interactive subtitles work on TV but are easier to use on mobile or computer; paraphrased, re-check the exact wording before pasting), read 2026-10-14: https://lingopie.com/blog/what-is-lingopie/
14. Described README (Qwen3-VL on Amazon Bedrock, Nova Lite, Polly, ffmpeg, second audio rendition), read 2026-10-14: https://github.com/moiz-lakkadkutta/described

## 17. Open questions

- Resolved: Kiro Crew and the Amazon Devices Builder Tools MCP were not used (reported by Moiz 2026-10-19); the clause is gone from docs/aws.md "Tooling", and §4 names no dev tools.
- Resolved: Described's services in §9 now follow its README (Qwen3-VL on Amazon Bedrock, Nova Lite, Amazon Polly, ffmpeg, second audio track) (checked against Described's README 2026-10-14).
- Resolved: the video must be **public** on YouTube or Vimeo, under 3 minutes, in English, and show Lingo running on a real Fire TV device or the Fire TV / Vega simulator; no third-party trademarks or copyrighted footage (ask the organisers before using CC footage) (checked on the rules page 2026-10-14). See docs/submission-checklist.md §3.
- Open, not resolved: CC footage. Moiz asked the organisers by email around 2026-10-14 whether the CC BY / CC BY-SA / public-domain demo clips may appear in the video; no reply as of 2026-10-19 (reported by Moiz 2026-10-19). Each clip's attribution is shown in full on screen (docs/video-script.md §1, §2). See docs/submission-checklist.md §2, Oct 16–18.
- [QUESTION for Moiz (Orchestrator decides): should `scripts/lint-words.mjs` also scan `docs/*.md`? Today it scans only `packages/shared-ui/src/**` and `apps/phone/src/**`, so this file is checked by hand with the grep in docs/plans/LING-009.md §5.]
