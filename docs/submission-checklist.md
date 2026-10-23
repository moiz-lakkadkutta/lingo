# Lingo: pre-submission checklist

The definition of done for the hackathon submission (runbook §9), mapped to owners, due dates and a check anyone can run. Status as of 2026-10-19 (§1 status cells and §2 ticks refreshed from Moiz's answers of that day; §3 rules facts checked on the live Devpost pages on 2026-10-14).

- Dates are 2026, Berlin time. **Submit by Oct 22, 23:00 Berlin** (internal safe date). Official deadline: **Fri Oct 23, 2026, 12:00 pm PT (PDT) = 21:00 Berlin (CEST)** (checked on the rules page 2026-10-14).
- Owners: **Moiz** (human: devices, filming, voice-over, accounts, upload, final sign-off, submit) · **Orchestrator** (dispatch, commit, push) · **Scribe** (opus; docs) · **Reviewer** (fable; cold read) · **LING-00x implementer** where a feature blocks a claim.
- Line format: `- [ ] item · owner · due · how to verify`.
- Companion files: docs/video-script.md (file A), docs/submission.md (file B), plan docs/plans/LING-009.md.

## 1. Definition of done (runbook §9) → owner, due, verify

| DoD item | Status 2026-10-19 | Owner | Due | Verify |
|---|---|---|---|---|
| Public GitHub repo, MIT LICENSE visible at the root | LICENSE exists; repo is public (checked on the rules page 2026-10-14: the rules require a public repo with a licence file) | Moiz | Oct 15 | Open https://github.com/moiz-lakkadkutta/lingo logged out; LICENSE shows "MIT" |
| README: ≤ 10-step setup, architecture, "what's new since Aug 31" | Present (README.md) | Scribe (LING-008) | Oct 15 | Count the setup steps (≤ 10); architecture block and "What's new since Aug 31, 2026" present |
| Runs on the stick **and** the VVD, or documents exactly why Vega is experimental | Fire OS: **Built, run on device**: the full device checklist (docs/spot-checks/2026-10-14-device-run.md) ran on a Fire TV Stick between 2026-10-15 and 2026-10-18 and every row passed (reported by Moiz 2026-10-19); spike S1 (2026-10-04) before it. Vega: **Code done, not on device** (experimental, VVD, no video): runs on the Vega Virtual Device (SDK 0.24, 2026-10-14): Home, the rail, Clip and Words with the live catalog; no video until KIT-010, the Player says so on screen; Pair/QR, Quiz and the S2 questions not run there (docs/spikes/2026-10-14-vega-vvd.md, screenshots and recording there) (status 2026-10-19) | LING-003 / LING-008 implementers + Moiz | Oct 15 | Screenshots in README from both, or a written "Vega status" note linked from README |
| ≥ 3 Fire TV integrations (Content Launcher, Personalization, Media Controls; IAP), each with a screenshot or log in README | Fire OS, **run on device** (reported by Moiz 2026-10-19): Amazon Appstore IAP (a sandbox purchase completed in App Tester, device run rows 30–34), Content Launcher deep link `lingo://clip/<slug>` (row 47), the remote's media keys (rows 12–15). Personalization and Media Controls go through the kit, whose bindings are no-ops: never claimed. Vega IAP not run on the VVD. README screenshot or log per integration: pending (status 2026-10-19). The judging iap API verifies against the RVS sandbox (docs/deploy/ec2.md), so App Tester purchases verify there. No Lingo Plus in-app item in the Developer Console and Live App Testing not claimed (decision 2026-10-22); judges sideload the latest release, `fire-tv-judging-2`, starting with "Lingo Plus Demo" | LING-007 implementer + Moiz | Oct 15 (freeze) | README section with one artifact each. Anything missing is removed from the video and from docs/submission.md |
| Video < 3:00, public on YouTube or Vimeo, in English, Lingo running on a real Fire TV device or the Fire TV / Vega simulator; a moment of Fire OS and of Vega | Filmed, with the save words registrieren and Konsulat as planned; not cut or uploaded yet (reported by Moiz 2026-10-19) | Moiz | Shoot Oct 16–18, cut Oct 19, **upload Oct 20** | `ffprobe` prints < 180; logged-out playback works; visibility public (checked on the rules page 2026-10-14) |
| Text: what, how, who, impact with a cited number | Draft (docs/submission.md) | Scribe, Reviewer | **Forms Oct 21** | Claims register (submission.md §15) has no unresolved placeholder; every number has a source |
| Tracks Fire TV + AWS Builder + Open Source; kit repo, release tag, GitHub handle, upstream PR | Done: tag `v0.1.0` and GitHub release 2026-10-14; npm `@moizp/vega-media-kit` 0.1.0 (MIT) published 2026-10-15 (`npm view`, checked 2026-10-19); upstream PR https://github.com/AmazonAppDev/vega-scrolling-sample/pull/26 opened 2026-10-19 | Moiz | Oct 18 | Every link in submission.md §8 and §13 opens logged out |
| docs/aws.md lists every AWS call with purpose and cost | Present; Polly listed under "Declared, not used" with $0 cost to Lingo (no call in code, re-checked 2026-10-15); Nova Pro v1 is the default model since 2026-10-04; Nova Pro, Nova Lite, Polly, Transcribe and Translate prices checked 2026-10-15 against the AWS Price List API and pricing pages (Transcribe is now $0.006/min, 12-clip estimate about $2.9); `MODEL_PRICES` carries `verified: true`; the dev-tooling clause is gone: Kiro Crew and the Devices Builder Tools MCP were not used (reported by Moiz 2026-10-19). **2026-10-19** (AWS CLI): the pipeline ran under the deploying developer profile (30 Transcribe jobs by a shared IAM user, 6 by root), never `PipelineRole` (a gap, written down); `lingo-nova-dev` not deployed; actual Lingo spend 2026-10-01..19 ≈ $2.27 (upper bound, S3 shared with Described), whole account $7.80 offset by credits ($0 billed) | Scribe | Oct 15 | Matches plan §1; Nova price checked at https://aws.amazon.com/bedrock/pricing/ |
| Feedback (five answers), feature requests with priorities, ≥ 8 friction logs | Feedback: all five answers filled 2026-10-19 (reported by Moiz 2026-10-19); feature requests: a prioritised row for each of the 36 friction logs (status 2026-10-19) | Scribe (LING-008) | Oct 15 | All five feedback questions answered; each feature request has a priority; `ls docs/friction/*.md` minus README ≥ 8 |
| Tests pass in CI on the default branch; `pnpm i && pnpm dev` shows something | Green on main: https://github.com/moiz-lakkadkutta/lingo/actions/runs/39170139834 (2026-10-18, commit 1a80782); the old `apps/expo/RemoteBridge.tsx` TS2305 baseline is gone (fixed in f67fd9e) (status 2026-10-19) | Orchestrator | Oct 15 | CI run link is green |
| All materials in English | — | Reviewer | Oct 21 | Read-through of README, docs/submission.md, the video captions and the Devpost forms |

## 2. Dated run-down

### By Oct 8 (kill date)

- [x] Decide per plan §1 row whether the video shows the feature or uses the fallback (S02 Content Launcher, S06 TV quiz score, S07b client IAP, S07c Personalization, S08 Vega); record each in docs/video-script.md §3 · Orchestrator (asks Moiz once) · Oct 8 · the five decision placeholders in docs/video-script.md are filled · **Decided by Moiz and recorded 2026-10-14** (S02 fallback path, S06 if built, S07b attempt the App Tester dialog only, S07c partial, S08 VVD Home without video)

### By Oct 15 (freeze)

- [x] Re-check every plan §1 row; update the Status cells in docs/video-script.md §3 and the claims register in docs/submission.md §15 · Scribe · Oct 15 · each row cites a file, test or screenshot that exists on the branch · **Done 2026-10-19** after the device run: rows it covers read "Built, run on device" (docs/spot-checks/2026-10-14-device-run.md, reported by Moiz 2026-10-19); Vega stays experimental
- [x] Demo clip `terra-x-friedlaender` (B1, approx.; decided 2026-10-14, replacing `terra-x-so-trinken-baeume`, which now rates about B2) plays from CloudFront on the stick, with its full attribution · LING-008 implementer + Moiz · Oct 15 · clip plays from CloudFront; the attribution in the `Clip` row matches docs/content.md row 3 character for character · **Done**: plays (device run row 11), and the on-screen attribution on the stick matched docs/content.md row 3 (reported by Moiz 2026-10-19)
- [x] Saved line reads correctly for one word (risk R3: "Saved. 1 words this clip.") · LING-005 implementer · Oct 15 · unit test for `explain.saved(1)` · **Fixed**: `packages/shared-ui/src/strings.ts:20` picks "word" for 1 (checked 2026-10-15)
- [x] Gloss of the chosen save word passed the spot check (risk R4) · Scribe + Moiz · Oct 15 · docs/spot-checks/ lists the word as judged correct · **Done**: registrieren and Konsulat are "ok" in docs/spot-checks/2026-10-10-gate-c-de-r3.md rows 5 and 6
- [x] Kit release: git tag and npm publish of `@moizp/vega-media-kit` · Moiz · Oct 15 · `git -C ../vega-media-kit tag` lists the tag; `npm view @moizp/vega-media-kit version` prints it · **Tag done**: `v0.1.0` (package version 0.1.0) with a GitHub release published 2026-10-14, https://github.com/moiz-lakkadkutta/vega-media-kit/releases/tag/v0.1.0. **npm published**: `@moizp/vega-media-kit` 0.1.0, MIT, 2026-10-15 (`npm view @moizp/vega-media-kit` checked 2026-10-19)
- [x] docs/aws.md corrected: Polly removed unless used in code; Nova Pro (default) and Nova Lite prices checked; dev-tooling line confirmed (open question 3) · Scribe · Oct 15 · `grep -rn -i polly apps packages` finds code, or docs/aws.md no longer lists Polly · **2026-10-15**: Polly stays under "Declared, not used" with $0 cost (grep finds only comments and the unused dependency); Nova Pro and Nova Lite prices checked (they match the code); **2026-10-19**: the dev-tooling clause is removed (Kiro Crew and the MCP were not used, reported by Moiz 2026-10-19)
- [x] docs/feedback.md (five answers) and docs/feature-requests.md (with priorities) filled · Scribe (LING-008) · Oct 15 · no empty template fields left · **Done 2026-10-19** (reported by Moiz 2026-10-19; Sie/du counted over the published cue files)
- [ ] README: Vega status note, and one screenshot or log per Fire TV integration that exists · Scribe (LING-008) + Moiz · Oct 15 · links from README open · Vega note present; **2026-10-23**: TV screens, Explain card with a saved word, phone Live tab and the Content Launcher deep-link log added (docs/images/readme/, taken on the stick over adb); the IAP purchase screenshot or RVS sandbox log is still pending (App Tester is not installed on the current stick)
- [x] Montero Perez 2017 source URL found and added to docs/submission.md §16 · Scribe · Oct 15 · URL opens to the article · https://doi.org/10.1080/09588221.2017.1375960 resolves to the publisher's page (checked 2026-10-15)
- [x] CI green on the default branch · Orchestrator · Oct 15 · CI run link · https://github.com/moiz-lakkadkutta/lingo/actions/runs/39170139834 (main, 2026-10-18)

### Oct 16–18 (shoot)

- [ ] Ask the organisers whether the CC BY / CC BY-SA / public-domain demo clips may appear in the video; the rules ask for this before using CC footage (checked on the rules page 2026-10-14) · Moiz · before the shoot, Oct 16 · the organisers' answer saved; if no, the video shows a public-domain clip or the pipeline's own test pattern · **Asked by email ~2026-10-14, no reply as of 2026-10-19 (reported by Moiz 2026-10-19); clip attribution shown in full on screen.** Save their reply here when it comes
- [x] Shoot in the order of docs/video-script.md §4 "Shoot schedule": Oct 15 device run; Oct 16 both-screens setup (cold open, then S06), then the other camera positions and screen captures; Oct 17 App Tester (S07b); Oct 17–18 VVD (S08); graphics and voice-over any time, after the S07d price is fixed · Moiz · Oct 15–18 · each day's shots in hand, or the decided fallback used · **Filmed** (reported by Moiz 2026-10-19)
- [ ] Pre-shoot checklist done (docs/video-script.md §5), including the learner level reset to about A2 on the stick · Moiz · Oct 16 · every box ticked
- [x] Save word, cue index and timecode written into docs/video-script.md §2 · Moiz · Oct 16 · filled 2026-10-14 from the clip data (S05 registrieren, cue 9, 0:39.2; S04 Konsulat, cue 11, 0:47.0); confirmed: both passed the device run and were filmed as planned (reported by Moiz 2026-10-19)
- [ ] Shoot all setups (tripods 1–3, FOS-cap, PH-cap, VVD if used, voice-over) · Moiz · Oct 18 · at least three good takes of S05 with both screens in one frame
- [x] Upstream PR to an AmazonAppDev sample opened; URL in hand · Moiz · Oct 18 · the PR URL opens logged out · https://github.com/AmazonAppDev/vega-scrolling-sample/pull/26 (opened 2026-10-19; README fix replacing stale Kepler CLI commands with `vega virtual-device start` / `vega run-app`)

### Oct 19 (edit)

- [ ] Cut to 2:40–2:55; burnt-in captions; `.srt`; about −14 LUFS · Moiz · Oct 19 · `ffprobe -v error -show_entries format=duration -of csv=p=0 lingo.mp4` prints < 180 · edit kit: PR #12 (docs/video/, `scripts/check-video.sh`)
- [ ] Reviewer (fable) watches the cut against the claims register · Reviewer · Oct 19 · every spoken claim matches a Built or Code-done row, or the take shows the feature working

### Oct 20 (upload)

- [ ] **Upload the video to YouTube**; paste the URL into docs/submission.md §13 and docs/video-script.md §5 · Moiz · **Oct 20** · logged-out playback works with visibility **public** (checked on the rules page 2026-10-14)

### Oct 21 (forms)

- [ ] **Devpost forms filled** from docs/submission.md · Moiz (Scribe drafts) · **Oct 21** · every field in the form matches the file
- [ ] Reviewer reads the forms cold (someone who did not write them) · Reviewer · Oct 21 · list of fixes, all applied
- [ ] No placeholders left · Scribe · Oct 21 · `grep -n PLACEHOLDER docs/submission.md docs/video-script.md` prints nothing
- [x] Wording check on the three files · Scribe · Oct 21 · `pnpm lint:words` exits 0 and the grep in docs/plans/LING-009.md §5 prints nothing · **2026-10-23**: both clean
- [ ] Moiz signs off · Moiz · Oct 21 · written "OK to submit" in the session

### Oct 22 (submit)

- [x] Re-read the deadline and timezone on https://amazonappdev2026.devpost.com/rules: Fri Oct 23, 2026, 12:00 pm PT (PDT) = 21:00 Berlin (CEST); this plan keeps Oct 22, 23:00 Berlin as the safe date · Orchestrator · 2026-10-14 · written into §3 below (checked on the rules page 2026-10-14)
- [x] Re-read the rules page for video visibility, the language rule and the mini-challenge fields; record any difference in §3 below · Orchestrator · 2026-10-14 · §3 filled (checked on the rules page 2026-10-14)
- [ ] **Submit by Oct 22, 23:00 Berlin** · Moiz · **Oct 22, 23:00 Berlin** · Devpost shows "Submitted"; screenshot of the confirmation saved

## 3. Rules page notes (fill before Oct 22)

| Rule | Runbook / plan says | Rules page says (date read) |
|---|---|---|
| Deadline and timezone | Runbook: Oct 23 21:00, no timezone. Plan: submit by Oct 22, 23:00 Berlin | Fri Oct 23, 2026, 12:00 pm PT (PDT) = 21:00 Berlin (CEST). The internal safe date stays Oct 22, 23:00 Berlin (checked on the rules page 2026-10-14) |
| Video length and visibility | < 3 minutes; public (default) | Under 3 minutes; public on YouTube or Vimeo; in English; must show the app running on a real Fire TV device or the Fire TV / Vega simulator (the FAQ accepts an emulator); no third-party trademarks or copyrighted footage; ask the organisers before using CC footage (checked on the rules page 2026-10-14) |
| Language | English | English (checked on the rules page 2026-10-14) |
| Mini-challenge fields (AWS Builder, Open Source) | Repo, tag, handle, upstream PR | Open Source: contribution URL, repo URL, GitHub username, description. AWS Builder: documented AWS integrations (checked on the rules page 2026-10-14) |
| Judging | — | Stage 1 pass/fail: theme fit and required technology. Stage 2: four equally weighted criteria, Technological Implementation, Design, Potential Impact, Quality of the Idea. Friction logs: up to a 10 % bonus. Repo must be public with a licence file; it is public (checked on the rules page 2026-10-14) |

## 4. Open questions

- [QUESTION for Moiz (Orchestrator decides): should `scripts/lint-words.mjs` also scan `docs/*.md`? Out of scope for LING-009, which touches docs only.]
- Resolved: video visibility is **public**, on YouTube or Vimeo (checked on the rules page 2026-10-14).
- Resolved: Kiro Crew and the Amazon Devices Builder Tools MCP were not used (reported by Moiz 2026-10-19); the claim is gone from docs/aws.md and docs/submission.md.
- Resolved: Described's README (https://github.com/moiz-lakkadkutta/described) says Qwen3-VL on Amazon Bedrock describes shots, Nova Lite fits narration into dialogue gaps, Polly voices it, ffmpeg ducks the soundtrack, delivered as a second HLS audio track; it shares `@moizp/vega-media-kit`. docs/submission.md §9 now names these as the README does (checked against Described's README 2026-10-14).
- Resolved risk: the "device shown" rule (plan R2). The device run on a Fire TV Stick passed (2026-10-15..18) and the video was filmed on it (reported by Moiz 2026-10-19).
