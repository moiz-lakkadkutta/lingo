# Lingo: pre-submission checklist

The definition of done for the hackathon submission (runbook §9), mapped to owners, due dates and a check anyone can run. Status as of 2026-10-01.

- Dates are 2026, Berlin time. **Submit by Oct 22, 23:00 Berlin.**
- Owners: **Moiz** (human: devices, filming, voice-over, accounts, upload, final sign-off, submit) · **Orchestrator** (dispatch, commit, push) · **Scribe** (opus; docs) · **Reviewer** (fable; cold read) · **LING-00x implementer** where a feature blocks a claim.
- Line format: `- [ ] item · owner · due · how to verify`.
- Companion files: docs/video-script.md (file A), docs/submission.md (file B), plan docs/plans/LING-009.md.

## 1. Definition of done (runbook §9) → owner, due, verify

| DoD item | Status 2026-10-01 | Owner | Due | Verify |
|---|---|---|---|---|
| Public GitHub repo, MIT LICENSE visible at the root | LICENSE exists; repo visibility unknown; GitHub push is broken from this environment | Moiz | Oct 15 | Open https://github.com/moiz-lakkadkutta/lingo logged out; LICENSE shows "MIT" |
| README: ≤ 10-step setup, architecture, "what's new since Aug 31" | Present (README.md) | Scribe (LING-008) | Oct 15 | Count the setup steps (≤ 10); architecture block and "What's new since Aug 31, 2026" present |
| Runs on the stick **and** the VVD, or documents exactly why Vega is experimental | Neither verified; Vega app not created | LING-003 / LING-008 implementers + Moiz | Oct 15 | Screenshots in README from both, or a written "Vega status" note linked from README |
| ≥ 3 Fire TV integrations (Content Launcher, Personalization, Media Controls; IAP), each with a screenshot or log in README | None verified in Lingo | LING-007 implementer + Moiz | Oct 15 (freeze) | README section with one artifact each. Anything missing is removed from the video and from docs/submission.md |
| Video < 3:00, public, device shown, a moment of Fire OS and of Vega | Not shot | Moiz | Shoot Oct 16–18, cut Oct 19, **upload Oct 20** | `ffprobe` prints < 180; logged-out playback works; visibility as the rules page asks |
| Text: what, how, who, impact with a cited number | Draft (docs/submission.md) | Scribe, Reviewer | **Forms Oct 21** | Claims register (submission.md §15) has no unresolved placeholder; every number has a source |
| Tracks Fire TV + AWS Builder + Open Source; kit repo, release tag, GitHub handle, upstream PR | Tag and PR missing | Moiz | Oct 18 | Every link in submission.md §8 and §13 opens logged out |
| docs/aws.md lists every AWS call with purpose and cost | Present, but lists Amazon Polly (not used in code) and Nova Lite prices not yet checked | Scribe | Oct 15 | Matches plan §1; Nova price checked at https://aws.amazon.com/bedrock/pricing/ |
| Feedback (five answers), feature requests with priorities, ≥ 8 friction logs | Feedback and feature requests are empty templates; 10 friction logs | Scribe (LING-008) | Oct 15 | All five feedback questions answered; each feature request has a priority; `ls docs/friction/*.md` minus README ≥ 8 |
| Tests pass in CI on the default branch; `pnpm i && pnpm dev` shows something | Baseline: one known TS error (`apps/expo/RemoteBridge.tsx`, TS2305) | Orchestrator | Oct 15 | CI run link is green |
| All materials in English | — | Reviewer | Oct 21 | Read-through of README, docs/submission.md, the video captions and the Devpost forms |

## 2. Dated run-down

### By Oct 8 (kill date)

- [ ] Decide per plan §1 row whether the video shows the feature or uses the fallback (S02 Content Launcher, S06 TV quiz score, S07b client IAP, S07c Personalization, S08 Vega); record each in docs/video-script.md §3 · Orchestrator (asks Moiz once) · Oct 8 · the five decision placeholders in docs/video-script.md are filled

### By Oct 15 (freeze)

- [ ] Re-check every plan §1 row; update the Status cells in docs/video-script.md §3 and the claims register in docs/submission.md §15 · Scribe · Oct 15 · each row cites a file, test or screenshot that exists on the branch
- [ ] Demo clip prepared and its full attribution string copied from the ZDF page (`terra-x-so-trinken-baeume`, else `terra-x-friedlaender`) · LING-008 implementer + Moiz · Oct 15 · clip plays from CloudFront; attribution in the DB row matches the ZDF page character for character
- [ ] Saved line reads correctly for one word (risk R3: "Saved. 1 words this clip.") · LING-005 implementer · Oct 15 · unit test for `explain.saved(1)`
- [ ] Gloss of the chosen save word passed the spot check (risk R4) · Scribe + Moiz · Oct 15 · docs/spot-checks/ lists the word as judged correct
- [ ] Kit release: git tag and npm publish of `@moizp/vega-media-kit` · Moiz · Oct 15 · `git -C ../vega-media-kit tag` lists the tag; `npm view @moizp/vega-media-kit version` prints it
- [ ] docs/aws.md corrected: Polly removed unless used in code; Nova Lite prices checked; dev-tooling line confirmed (open question 3) · Scribe · Oct 15 · `grep -rn -i polly apps packages` finds code, or docs/aws.md no longer lists Polly
- [ ] docs/feedback.md (five answers) and docs/feature-requests.md (with priorities) filled · Scribe (LING-008) · Oct 15 · no empty template fields left
- [ ] README: Vega status note, and one screenshot or log per Fire TV integration that exists · Scribe (LING-008) + Moiz · Oct 15 · links from README open
- [ ] Montero Perez 2017 source URL found and added to docs/submission.md §16 · Scribe · Oct 15 · URL opens to the article
- [ ] CI green on the default branch · Orchestrator · Oct 15 · CI run link

### Oct 16–18 (shoot)

- [ ] Pre-shoot checklist done (docs/video-script.md §5) · Moiz · Oct 16 · every box ticked
- [ ] Save word, cue index and timecode written into docs/video-script.md §2 · Moiz · Oct 16 · placeholder filled
- [ ] Shoot all setups (tripods 1–3, FOS-cap, PH-cap, VVD if used, voice-over) · Moiz · Oct 18 · at least three good takes of S05 with both screens in one frame
- [ ] Upstream PR to an AmazonAppDev sample opened; URL in hand · Moiz · Oct 18 · the PR URL opens logged out

### Oct 19 (edit)

- [ ] Cut to 2:40–2:55; burnt-in captions; `.srt`; about −14 LUFS · Moiz · Oct 19 · `ffprobe -v error -show_entries format=duration -of csv=p=0 lingo.mp4` prints < 180
- [ ] Reviewer (fable) watches the cut against the claims register · Reviewer · Oct 19 · every spoken claim matches a Built or Code-done row, or the take shows the feature working

### Oct 20 (upload)

- [ ] **Upload the video to YouTube**; paste the URL into docs/submission.md §13 and docs/video-script.md §5 · Moiz · **Oct 20** · logged-out playback works at the chosen visibility (open question 2)

### Oct 21 (forms)

- [ ] **Devpost forms filled** from docs/submission.md · Moiz (Scribe drafts) · **Oct 21** · every field in the form matches the file
- [ ] Reviewer reads the forms cold (someone who did not write them) · Reviewer · Oct 21 · list of fixes, all applied
- [ ] No placeholders left · Scribe · Oct 21 · `grep -n PLACEHOLDER docs/submission.md docs/video-script.md` prints nothing
- [ ] Wording check on the three files · Scribe · Oct 21 · `pnpm lint:words` exits 0 and the grep in docs/plans/LING-009.md §5 prints nothing
- [ ] Moiz signs off · Moiz · Oct 21 · written "OK to submit" in the session

### Oct 22 (submit)

- [ ] Re-read the deadline and timezone on https://amazonappdev2026.devpost.com/rules (the runbook gives Oct 23 21:00 without a timezone; this plan uses Oct 22, 23:00 Berlin as the safe date) · Moiz · before Oct 22 · the rules page date and timezone written into §3 below
- [ ] Re-read the rules page for video visibility, the language rule and the mini-challenge fields; record any difference in §3 below · Moiz · before Oct 22 · §3 filled (this environment could not fetch the rules page; egress was blocked on 2026-10-01)
- [ ] **Submit by Oct 22, 23:00 Berlin** · Moiz · **Oct 22, 23:00 Berlin** · Devpost shows "Submitted"; screenshot of the confirmation saved

## 3. Rules page notes (fill before Oct 22)

| Rule | Runbook / plan says | Rules page says (date read) |
|---|---|---|
| Deadline and timezone | Runbook: Oct 23 21:00, no timezone. Plan: submit by Oct 22, 23:00 Berlin | `[PLACEHOLDER: deadline as on the rules page · owner Moiz · due Oct 21 · ticket LING-009]` |
| Video length and visibility | < 3 minutes; public (default) | `[PLACEHOLDER: video rule as on the rules page · owner Moiz · due Oct 21 · ticket LING-009]` |
| Language | English | `[PLACEHOLDER: language rule as on the rules page · owner Moiz · due Oct 21 · ticket LING-009]` |
| Mini-challenge fields (AWS Builder, Open Source) | Repo, tag, handle, upstream PR | `[PLACEHOLDER: mini-challenge fields as on the rules page · owner Moiz · due Oct 21 · ticket LING-009]` |

## 4. Open questions

- [QUESTION for Moiz (Orchestrator decides): should `scripts/lint-words.mjs` also scan `docs/*.md`? Out of scope for LING-009, which touches docs only.]
- [QUESTION for Moiz: YouTube visibility. The runbook says "unlisted" in week 5 and "public" in its definition of done. The default is **public** unless the rules page says otherwise.]
- [QUESTION for Moiz: were Kiro Crew and the Amazon Devices Builder Tools MCP actually used? docs/aws.md says so; nothing in the repo shows it. Confirm, or the claim goes.]
- [QUESTION for Moiz: Described's current feature set is not in this checkout. Read its README before Oct 21 so the uniqueness paragraph (docs/submission.md §9) names Described's services only as its README does.]
- Risk, not a question: without a Fire TV Stick the "device shown" rule cannot be met (plan R2). If no stick is available by Oct 15, the Orchestrator escalates.
