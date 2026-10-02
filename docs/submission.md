# Lingo: Devpost submission draft

Devpost draft for Lingo. Paste-ready. Status as of 2026-10-01.

How to use this file:
- Each section below is headed with the Devpost field it fills. Paste the text under "Paste:" as it stands.
- Footnote numbers (¹ ²…) point to §16 Sources. On Devpost, write each source inline as a link, or paste §16 as the last block of "About the project".
- §15 (claims register) is **not** pasted. The Reviewer audits every claim in §2–§13 against it.
- Placeholders follow docs/plans/LING-009.md §1.1. `grep -n "PLACEHOLDER" docs/submission.md` lists every one. On Oct 21 none may remain: each is either filled with the real value or the sentence that needed it is deleted.
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

`[PLACEHOLDER: Lingo Plus client purchase flow working in sandbox, else delete the last sentence · owner LING-007 implementer · due Oct 15 · ticket LING-007]`

## 4. How we built it (About the project → How we built it)

Paste:

> Lingo is a pnpm + Turborepo monorepo: one TV UI package, a phone app, an API and a media pipeline.
>
> ```
> TV (vega/expo → shared-ui → kit)      Phone (Expo)
>   Home · Player(dual cues) · Explain    Join · Live saved words · Quiz (SM-2) · Progress
>   Summary · Quiz · Words · Settings          │ Socket.IO room = session code
>          └──────────── REST + Socket.IO ────┘
> apps/api (Express, Prisma, pg-boss, Socket.IO) → packages/pipeline: Transcribe → segment (42×2, 20 cps) → Translate → lemmatize+rank → highlights → Nova Lite glosses & quiz → package → publish
> ```
>
> **The pipeline** is a plain command-line tool (`pnpm pipeline prepare`) that runs its steps in order; there is no agent framework. Amazon Transcribe produces the spoken line with word timings. Our segmenter cuts it into subtitle cues that keep to broadcast reading limits: at most 42 characters per line, two lines, 20 characters per second, and 1 to 7 seconds on screen.¹ A cue that breaks a limit stops the build; there is no tolerance flag. Amazon Translate writes the second-language line, one cue at a time so the two tracks stay aligned, with its Formality and Brevity settings. Each word is lemmatized with simplemma² and ranked against an open subtitle frequency list (hermitdave/FrequencyWords, CC BY-SA 4.0).³ One or two words per cue, in the band just above the clip's level, become highlights; names and numbers never do, and at most 40 % of cues carry one. Amazon Nova Lite on Amazon Bedrock writes each highlight's gloss and grammar note and plans the quiz, through the Converse API with forced tool use and Zod validation. Shaka Packager packages video and both WebVTT tracks, and Amazon S3 + CloudFront serve them. The AWS stack is AWS CDK.
>
> **The API** (Express, Zod, Prisma on PostgreSQL, pg-boss, Socket.IO) keeps learners, saved words and reviews. Spaced repetition is literal SM-2, the scheduler Anki documents,⁴ and it runs on the server, so the TV and the phone always agree on what is due.
>
> **TV and phone** share one Socket.IO room per 6-character session code (QR or typed). Saving a word on the TV reaches the phone in under one second at p95 in our integration test.⁵
>
> **One UI for Fire OS and Vega.** All TV screens live in one `shared-ui` package that imports only libraries Amazon lists as supported on Vega; the platform apps are thin entries. Playback and subtitle parsing come from vega-media-kit, our MIT-licensed open-source library (see Open source). The kit's Vega adapter is experimental and not yet verified on a device.

`[PLACEHOLDER: Vega status sentence updated after LING-008 (Lingo running on the VVD, or stays experimental) · owner Orchestrator · due Oct 15 · ticket LING-008]`

[QUESTION for Moiz: docs/aws.md lists "Kiro Crew" and the "Amazon Devices Builder Tools MCP" as dev tooling, but nothing in the repo shows they were used. Were they? If yes, add one sentence here naming them; if no, the claim goes from docs/aws.md too. Until confirmed, this draft names no dev tools.]

## 5. Who it's for (About the project → custom heading "Who it's for")

Paste:

> Adults in Germany who are learning German, especially integration-course learners at A2–B1, or who are learning English, and who own a Fire TV and a phone. A second user is the household around them: one person learning, another watching along. Lingo asks nobody to type on the TV; the only typing in the whole system is the 6-character pairing code on the phone.

## 6. Potential impact (About the project → custom heading "Potential impact")

Paste:

> In 2024, 363,466 people started an integration course in Germany; 146,176 of them, about 40 %, joined voluntarily.⁶ People aged 14–49 in Germany watched 79 minutes of television a day in 2024.⁷ Research on subtitled television shows that viewers pick up vocabulary from a single episode without trying (Peters & Webb 2018)⁸ and gain more across ten episodes (Rodgers & Webb 2020);⁹ captions that gloss a few keywords help learners recall meanings better than plain captions (Montero Perez et al. 2017).¹⁰ Testing yourself beats re-reading: a week later, students who practised retrieval recalled 56 % of a text, against 42 % for those who restudied it (Roediger & Karpicke 2006).¹¹ Lingo puts that evidence on the screen people already spend their evenings with, in the language pairs that matter in Germany, and leaves the review on the phone in their pocket.

Do **not** add (plan §3.6): "about 307,000 in 2025", "roughly 60 % reach B1", "16 % of adults are learning a language". None is re-verified at a primary source. Behörden Spiegel (2026-03-17) reports a stop on new admissions to integration courses; keep the paragraph to the 2024 number and do not speculate about 2026.

## 7. Tracks (Devpost "Which track / challenges")

Select:

- **Fire TV** (main track).
- **AWS Builder mini-challenge.** Evidence: docs/aws.md (every AWS call, its purpose and cost) and `infra/` (AWS CDK).
- **Open Source mini-challenge.** Evidence: §8.

## 8. Open source (mini-challenge fields)

Paste:

> - Library: **vega-media-kit**, MIT. Repo: https://github.com/moiz-lakkadkutta/vega-media-kit
> - npm: `@moizp/vega-media-kit`, version `0.1.0-alpha.0` `[PLACEHOLDER: npm publish confirmed · owner Moiz · due Oct 15 · ticket kit release]`
> - Release tag: `[PLACEHOLDER: kit release tag, e.g. v0.1.0 · owner Moiz · due Oct 15 · ticket kit release]`
> - GitHub handle: `moiz-lakkadkutta`
> - Upstream contribution: `[PLACEHOLDER: AmazonAppDev PR URL · owner Moiz · due Oct 18 · ticket LING-009]`
> - App repo: https://github.com/moiz-lakkadkutta/lingo (MIT)
>
> vega-media-kit is a React Native player and subtitle library for Fire TV apps: one player component (`KitPlayer`) with Fire OS and web adapters, a WebVTT parser with a subtitle-limit linter (2 lines × 42 characters, 20 characters per second), a cue overlay with 10-foot defaults, remote-key and focus helpers, and Fire TV platform bindings. On Fire OS it is verified on a Fire TV Stick (playback, two text tracks at once, seek, pause, 0.75×). Its Vega OS adapter is experimental and has not been run on a Vega device or the Vega Virtual Device yet.

## 9. Unique and substantially different from Described (About the project → custom heading)

Paste:

> Lingo and our other entry, Described (https://github.com/moiz-lakkadkutta/described), share one open-source library, vega-media-kit, the way two apps can both use React Native: it is infrastructure. Everything else is different. **Users:** Lingo is for language learners; Described is for blind and low-vision viewers. **The AI that does the work:** in Lingo, Amazon Transcribe, Amazon Translate and Amazon Nova Lite turn speech into aligned two-language subtitles, word glosses and a quiz; Described uses video understanding and speech synthesis to narrate what is on screen. **Interaction:** Lingo is pause-and-study with a second screen that quizzes you; Described is listening. **Business model:** Lingo sells a Lingo Plus subscription through Amazon in-app purchasing.

`[PLACEHOLDER: Described's services checked against Described's own README and named only as it names them · owner Scribe · due Oct 21 · ticket LING-009]`
`[PLACEHOLDER: Lingo Plus sentence kept only if the client IAP flow works in sandbox · owner LING-007 implementer · due Oct 15 · ticket LING-007]`

## 10. Built with (Devpost tags)

Paste (one tag each):

> React Native, react-native-tvos, Expo, TypeScript, Node.js, Express, Zod, Prisma, PostgreSQL, pg-boss, Socket.IO, Amazon Transcribe, Amazon Translate, Amazon Bedrock, Amazon Nova Lite, Amazon S3, Amazon CloudFront, AWS CDK, Shaka Packager, ffmpeg, simplemma, vega-media-kit, Vitest, Turborepo, pnpm

Add only when true:
- `[PLACEHOLDER: add tag "Amazon Appstore IAP" once the client flow works in sandbox · owner LING-007 implementer · due Oct 15 · ticket LING-007]`
- `[PLACEHOLDER: add tag "Vega SDK" only if the Vega app exists · owner Orchestrator · due Oct 15 · ticket LING-008]`

## 11. Challenges, accomplishments, what we learned

Friction logs for all of these: https://github.com/moiz-lakkadkutta/lingo/tree/main/docs/friction

### Challenges we ran into

Paste:

> - **Hesitations became sentences.** Amazon Transcribe puts a full stop after a hesitation ("hat.", "aber."), which produced one-word cues padded to a second. We now repair a stop when the next word continues the clause, and let pauses (not only characters) end a cue.
> - **One cue at a time switches register.** Translating each subtitle on its own made neighbouring lines of one conversation jump between "Sie" and "du". Amazon Translate's Formality and Brevity settings fixed the register and length while keeping the two tracks aligned one-to-one.
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
> - Amazon Nova Lite does not support Bedrock structured outputs, so forced tool use plus schema validation is the reliable way to get typed JSON from it.

## 12. What's next (About the project → What's next for Lingo)

Paste:

> - More languages, through Amazon Translate: the pipeline already takes the target and native language as parameters.
> - Content Launcher, so a viewer can ask for a clip by voice and land in Lingo.
> - Fire TV Personalization, so your place in each clip is kept.
> - The quiz score from the phone shown on the TV, and the quiz on the TV itself.
> - Lingo running on Vega devices, not only written for them.

Before pasting, delete any line whose feature shipped by Oct 15 and move it into §3. `[PLACEHOLDER: What's next list re-checked against docs/plans/LING-009.md §1 · owner Scribe · due Oct 15 · ticket LING-009]`

## 13. Links (Devpost "Try it out" and video)

Paste:

> - Video: `[PLACEHOLDER: YouTube URL · owner Moiz · due Oct 20 · ticket LING-009]`
> - Lingo repo: https://github.com/moiz-lakkadkutta/lingo
> - vega-media-kit repo: https://github.com/moiz-lakkadkutta/vega-media-kit
> - vega-media-kit release: `[PLACEHOLDER: kit release tag URL · owner Moiz · due Oct 15 · ticket kit release]`
> - Upstream PR: `[PLACEHOLDER: AmazonAppDev PR URL · owner Moiz · due Oct 18 · ticket LING-009]`
> - Described: https://github.com/moiz-lakkadkutta/described

## 14. Product feedback (Devpost feedback fields)

Paste the five required answers from docs/feedback.md and link the feature requests:

> - Feedback: https://github.com/moiz-lakkadkutta/lingo/blob/main/docs/feedback.md
> - Feature requests, with priorities: https://github.com/moiz-lakkadkutta/lingo/blob/main/docs/feature-requests.md
> - Friction logs: https://github.com/moiz-lakkadkutta/lingo/tree/main/docs/friction

`[PLACEHOLDER: docs/feedback.md five answers and docs/feature-requests.md filled (drafted 2026-10-02; TBD-by-human items and sign-off remain) · owner Scribe · due Oct 15 · ticket LING-008]`

## 15. Claims register (not pasted; the Reviewer audits against this)

Status words from docs/plans/LING-009.md §1: **Built** · **Code done, not on device** · **Planned / Not built** · **Not planned**. A claim whose status is not Built may only be pasted when its placeholder is resolved.

| # | Section | Claim | Status | Evidence | Placeholder? |
|---|---|---|---|---|---|
| C1 | §2, §3 | Two subtitle lines, target large and bright, native small and cool | Code done, not on device | decision 0006; `packages/shared-ui/src/components/DualCue.tsx`; LING-003 | No |
| C2 | §3 | Clips are 3–8 minutes | Built (content rule) | docs/content.md "What qualifies" | No |
| C3 | §3 | One or two marked words per line, approximate CEFR band from frequency | Built (pipeline) | decision 0008 §9; `packages/pipeline/src/highlights.ts` | No |
| C4 | §3, §2 | Pause opens the Explain card: meaning, grammar note, line as example | Code done, not on device; gloss quality Gate C not yet passing | decision 0006; decision 0001 Gate C; LING-002/003 | No (spot-checked word only in the video) |
| C5 | §3 | Saved word appears on the paired phone within a second | Built (< 1 s p95 in test) | decision 0005; `apps/api/test/realtime.test.ts` | No |
| C6 | §3, §2 | Phone quizzes you; SM-2, server-side | Built (server, tests); phone deck Code done, not on device (no EAS build) | `apps/api/src/lib/sm2.ts`; `apps/phone/src/screens/QuizScreen.tsx`; decision 0011; LING-006 | No |
| C7 | §3, §9 | Lingo Plus (sandbox): Challenge mode, unlimited saves, slower playback | Code done, not on device: client purchase and restore flow on both OSes, server RVS check; App Tester / VVD sandbox run pending | `packages/shared-ui/src/plus/flow.ts`; `apps/expo/src/fireosStore.ts`; `apps/vega/src/iap/vegaStore.ts`; `apps/api/src/routes/iap.ts`; decision 0012 | **Yes** |
| C8 | §4 | Pipeline is a plain CLI, no agent framework | Built | docs/aws.md; `packages/pipeline` | No |
| C9 | §4 | Transcribe with word timings | Built | decision 0001 Gate A; `packages/pipeline/src/*` | No |
| C10 | §4 | Cues ≤ 42 × 2, ≤ 20 cps, 1–7 s, hard gate, no tolerance flag | Built | decision 0007 §1; source ¹ | No |
| C11 | §4, §11 | Translate per cue, aligned 1:1, Formality + Brevity settings | Built | decision 0008 §11 | No |
| C12 | §4 | simplemma lemmatizer; FrequencyWords list, CC BY-SA 4.0 | Built | decision 0004; docs/aws.md Sources; sources ² ³ | No |
| C13 | §4 | Highlights in the band above the clip level; no names or numbers; ≤ 40 % of cues | Built | decision 0008 §8–§9; PLAN non-negotiables | No |
| C14 | §4 | Nova Lite via Converse, forced tool use, Zod | Built (quality Gate C not yet passing) | docs/aws.md; decision 0001 | No |
| C15 | §4 | Shaka Packager; S3 + CloudFront; AWS CDK | Built | `infra/lib/media-stack.ts`, `infra/lib/nova-ingest-stack.ts` | No |
| C16 | §4 | Express, Zod, Prisma, PostgreSQL, pg-boss, Socket.IO | Built | `apps/api` | No |
| C17 | §4 | SM-2 as Anki documents | Built | `apps/api/src/lib/sm2.ts`; source ⁴ | No |
| C18 | §4, §5 | 6-character session code, QR or typed; only typing in the system | Built (server, pairing); phone Join (QR or typed code) Code done, not on device | decision 0005; decision 0011; `apps/phone/src/screens/JoinScreen.tsx` | No |
| C19 | §4, §11 | One `shared-ui` package for Fire OS and Vega, Vega-supported imports only | Built as code (import guard in CI); Vega app Code done, not on device: installs, typechecks and bundles, never run on the VVD, no video until KIT-010 | CLAUDE.md; `packages/shared-ui`; `apps/vega/README.md`; decision 0013 | **Yes** (Vega sentence) |
| C20 | §4, §8 | Kit Vega adapter experimental, not device-verified | Built (honest status) | ../vega-media-kit README §Status | No |
| C21 | §6 | 363,466 new integration-course participants in 2024; 146,176 (about 40 %) voluntary | Sourced number | source ⁶ | No |
| C22 | §6 | 79 min of TV a day, ages 14–49, 2024 | Sourced number | source ⁷ (secondary report ⁷ᵃ) | No |
| C23 | §6 | Peters & Webb 2018; Rodgers & Webb 2020; Montero Perez et al. 2017 | Sourced research, no effect sizes claimed | sources ⁸ ⁹ ¹⁰ | **Yes** (¹⁰ URL) |
| C24 | §6 | Retrieval practice: 56 % vs 42 % after a week | Sourced number | source ¹¹ | No |
| C25 | §7 | AWS Builder: every AWS call listed with purpose and cost | Built, with unverified prices: docs/aws.md lists Polly under "Declared, not used"; Nova Lite prices not yet checked against the pricing page | docs/aws.md; plan R5 | Price check (checklist) |
| C26 | §8 | vega-media-kit MIT, npm `0.1.0-alpha.0`, release tag, upstream PR | Built (code); publish, tag and PR missing | ../vega-media-kit/package.json; `git tag` empty | **Yes** |
| C27 | §8 | Kit verified on a Fire TV Stick (Fire OS): playback, two text tracks, seek, pause, 0.75× | Built (kit device matrix, 2026-09-26) | ../vega-media-kit/README.md §Status; ../vega-media-kit/docs/device-matrix.md | No |
| C28 | §9 | Described: blind and low-vision viewers; video understanding + speech synthesis | Unverified in this checkout | Described README (not in this checkout); plan Q4 | **Yes** |
| C29 | §11 | Hesitation stops repaired; pauses bound cues | Built | decision 0008 §1–§2; friction `2026-10-01-transcribe-punctuation-and-diarization-unreliable.md` | No |
| C30 | §11 | Fire OS moved to react-native-tvos; Vega key events observed, not consumed; native focus per word | Code done, not on device | decision 0006; friction `…fire-os-expo-template-has-no-tv-event-handler.md`, `…vega-playbackrate-tveventhandler-backhandler-limits.md` | No |
| C31 | §11 | Vega `playbackRate` unsupported → 0.75× Fire OS only | Built (as a design decision, `caps.rate`) | decision 0006 §4 | No |
| C32 | §11 | Nova Lite: no Bedrock structured outputs → forced tool use | Built | docs/aws.md; friction `…bedrock-nova-lite-temperature-structured-outputs-eol.md` | No |
| C33 | §12 | Content Launcher voice search, Fire TV Personalization, Lingo on Vega devices: named as next steps only. The TV quiz and the phone's score on the TV are Code done, not on device: move them from §12 to §3 only once a device run shows them | Not built (voice search, Personalization, Vega devices) · Code done, not on device (TV quiz, score) | plan §1 | No (§12 placeholder) |
| C34 | §13 | Video link | Not shot | — | **Yes** |
| C35 | §14 | Feedback and feature requests filled | Drafted (five answers, 23 friction bullets, prioritised requests); TBD-by-human items and the human's sign-off remain | docs/feedback.md, docs/feature-requests.md | **Yes** |
| C36 | — | **Never claim:** Content Launcher voice search, Fire TV Personalization, Amazon Polly, Nova Pro, Strands Agents, AgentCore, Lingo playing video on Vega or running on the VVD, Kiro Crew / Devices Builder Tools MCP. Client IAP and the TV quiz score from the phone are code done, not on device: claim them only with a take or log that shows them working | Not built / Not used / Unconfirmed | plan §1, §6 check 8 | — |

## 16. Sources

Numbers match the footnotes above. Repo files are cited by path in §15.

1. Netflix, English (USA) Timed Text Style Guide (42 characters per line, 20 characters per second): https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide
2. simplemma (MIT): https://github.com/adbar/simplemma
3. hermitdave/FrequencyWords (OpenSubtitles 2018), CC BY-SA 4.0: https://github.com/hermitdave/FrequencyWords · licence https://creativecommons.org/licenses/by-sa/4.0/
4. Anki FAQ, "What spaced repetition algorithm does Anki use?": https://faqs.ankiweb.net/what-spaced-repetition-algorithm
5. Lingo repo: docs/decisions/0005-realtime-session.md and `apps/api/test/realtime.test.ts` (TV save → phone receive < 1 s p95).
6. BAMF, "Bericht zur Integrationskursgeschäftsstatistik für das Jahr 2024" (363,466 new participants; 146,176 voluntary): https://www.bamf.de/SharedDocs/Anlagen/DE/Statistik/Integrationskurszahlen/Bundesweit/2024-integrationskursgeschaeftsstatistik-gesamt_bund.pdf?__blob=publicationFile&v=2
7. AGF Videoforschung, press release 2025-01-08, TV year 2024 (79 minutes a day, ages 14–49): https://www.agf.de/fileadmin/agf/service/Pressemitteilungen/2025/250108_PM_Jahresbilanz_2024/250108_AGF_PM_TV_Jahresbilanz_2024.pdf
   7a. Secondary report (heise online): https://www.heise.de/news/Fernsehkonsum-in-Deutschland-2024-erneut-gesunken-10221980.html
8. Peters, E. & Webb, S. (2018). Incidental vocabulary acquisition through viewing L2 television and factors that affect learning. *Studies in Second Language Acquisition*: https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/abs/incidental-vocabulary-acquisition-through-viewing-l2-television-and-factors-that-affect-learning/0E45A630F37C48A5BDB6CC3F725ADDC9
9. Rodgers, M. P. H. & Webb, S. (2020). *ITL – International Journal of Applied Linguistics*: https://www.jbe-platform.com/content/journals/10.1075/itl.18034.rod
10. Montero Perez, M. et al. (2017), glossed keyword captions. `[PLACEHOLDER: Montero Perez 2017 URL (not in the plan artifact's Sources list) · owner Scribe · due Oct 15 · ticket LING-009]`
11. Roediger, H. L. & Karpicke, J. D. (2006). Test-enhanced learning. *Psychological Science*: https://colinallen.dnsalias.org/Readings/2006_Roediger_Karpicke_PsychSci.pdf
12. Hackathon rules: https://amazonappdev2026.devpost.com/rules

## 17. Open questions

- [QUESTION for Moiz: were Kiro Crew and the Amazon Devices Builder Tools MCP actually used? docs/aws.md says so; nothing in the repo shows it. Confirm, or the claim goes (here and in docs/aws.md).]
- [QUESTION for Moiz: Described's current feature set is not in this checkout. Please confirm the uniqueness paragraph (§9) against Described's README before Oct 21, so Described's services are named only as its README names them.]
- [QUESTION for Moiz: YouTube visibility for the video link (§13). The runbook says "unlisted" in week 5 and "public" in its definition of done; the default is **public** unless the rules page says otherwise.]
- [QUESTION for Moiz (Orchestrator decides): should `scripts/lint-words.mjs` also scan `docs/*.md`? Today it scans only `packages/shared-ui/src/**` and `apps/phone/src/**`, so this file is checked by hand with the grep in docs/plans/LING-009.md §5.]
