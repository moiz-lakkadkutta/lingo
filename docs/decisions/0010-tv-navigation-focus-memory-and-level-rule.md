# 0010 — TV navigation, focus memory and the level rule

Status: accepted (LING-005 plan §0, 2026-10-01; code done 2026-10-02, review fixes 7c72046 and 8c50e2f). Device behaviour on the Fire TV
Stick and the Vega Virtual Device is not verified yet (docs/plans/LING-005.md §10).
Plan: docs/plans/LING-005.md §0. Review: docs/reviews/2026-10-02-ling-005.md (M1, M4).
Numbering: the plan proposed `0009-tv-navigation-and-level.md`. 0009 is taken by `0009-gloss-quality.md` (LING-002 Gate C, on
`origin/feat/ling-001-pipeline`), so this record is 0010.

## Context

LING-005 adds the TV screens around the Player: Home, Clip, Summary, Quiz (TV), Words, Settings, About, First run with placement,
and Pair. Both OSes run the same `packages/shared-ui`, which may import only Vega-supported libraries. Decision 0006 already fixed
how remote keys reach shared-ui (`RemoteSource`), that the Explain sheet is a view and not an RN `<Modal>` (Vega's `BackHandler` is
silent behind one), and that Vega honours `hasTVPreferredFocus` on initial mount only. PLAN §2 asks for level nudges from the
learner's own quiz results, never a downgrade, and decision 0007 (M5) asks the API to drop highlights below the learner's band.

## Decision

1. **Navigation is a hand-rolled stack**, not react-navigation: a pure reducer (`packages/shared-ui/src/nav/stack.ts`) and one
   `BackHandler` listener in Root (`app/Root.tsx`), registered first. Only the top route is mounted. react-navigation is on Vega's
   supported list, but its native stack needs `react-native-screens` and `safe-area-context` on both OSes (a native rebuild for nothing
   Lingo needs), and the reducer is testable in Node.
2. **Focus memory = remount + `hasTVPreferredFocus` on the remembered element.** Root keeps a per-route-key map of element ids
   (`nav/focusMemory.ts`) for the app's lifetime. A popped-back screen remounts, so the remembered element mounts with the prop and takes
   focus on both OSes. Each mounted screen state has exactly one preferred element. Where focus must move inside a mounted screen, the
   view is remounted by `key`: Words keys its list by filter and picks the preferred row per filter (the last focused row if it is still
   listed, else the first; review M4, commit 8c50e2f). The kit's `useFocusMemory` is not used (module-global map, no reset from tests).
3. **◄► change values on Words and Settings through the `RemoteSource`** (decision 0006 §3). Both are single vertical columns with no
   horizontal focus neighbour, so native focus does not move on ◄►. The rail is rendered on Home only.
4. **Level rule** (`PUT /me/level`, source `quiz`; `apps/api/src/lib/levelRule.ts`). Only attempts since the learner's last level change
   count. An attempt is eligible when the quiz had at least 5 items and the clip's level is at or above the learner's level at the time.
   Ineligible attempts neither count nor break a run. Consecutive attempts on the same clip collapse to the latest. When the two newest
   eligible attempts are on distinct clips and both are at least 90 %, the level goes up one band (B2 stays B2) and `levelChangedAt = now`.
   The level never goes down automatically; Settings can lower it. Placement and Settings set the level directly (A1–B2 only, `LevelPut`)
   and also set `levelChangedAt`.
5. **Eligibility comes from the server** (review M1, commit 7c72046). `PUT /me/level` and `PUT /me/progress` accept only **published**
   clips (a draft or preparing clip is 404, as an unknown slug). A quiz attempt is stored with the clip's real `QuizItem` count as
   `total`; a client `total` that disagrees is `409 QUIZ_MISMATCH`, so "at least 5 items" is the server's count, never the caller's.
   These routes resolve the learner from `x-device-id` only; a session code is ignored there (decision 0011), so a phone cannot post a
   level or progress for the TV. A phone `quiz:result` is an SM-2 review tally and never feeds the level rule.
6. **Decision 0007 M5 is applied in `GET /clips/:slug`**: a highlight is returned only when `rank ≥ highlightFloor(learner.level)`
   (A1 → 1000, A2 → 2000, B1 → 4000, B2 → 4000), and `wordsYoullMeet` is the first 8 distinct lemmas of the filtered set. `LEVELS`,
   `BANDS`, `NEXT` and `highlightFloor` live in `@lingo/contracts`; the pipeline re-exports them. `Learner.knownRank` is dropped.
7. **`PUT /me` stays narrowed** to `LearnerSettingsPatch` (learning, native, native line, auto-pause, cue size, first run). The level
   changes only through `PUT /me/level`; `plus` only through the server's entitlement (decision 0012).
8. **"Learned" on the TV Words screen = SM-2 interval ≥ 21 days** (Anki's "mature"). This is a different measure from the phone's
   "known" (interval ≥ 6 days, decision 0011), on purpose: the phone's bar must move during a hackathon week.
9. The plan's separate device-id lookup for the TV routes (`lib/learnerLookup.ts`) was replaced at the merge (d4f1c48) by the shared
   `learner(req)` from LING-006, which since the LING-006 review answers only to `x-device-id` unless a route opts in (decision 0011).

## Consequences

- No react-navigation dependency on either OS. Back is one listener; a screen that needs its own Back behaviour handles it through the
  stack, not through a second listener.
- Any view that must regain focus on Vega has to remount. Code that changes a list in place (filters, refreshes) must re-key it, or focus
  can be lost on Vega (friction log `2026-10-02-vega-hastvpreferredfocus-applies-only-on-first-mount.md`).
- A client cannot raise its own level with a forged score, a draft clip or a phone. The level still trusts the device's own answers
  (`correct`); a modified TV app could post perfect scores. Acceptable for a learning app with no stakes.
- The TV Words screen's "Due today" uses the device's local end of day (`app/selectors.ts:42`), while the API and the phone use UTC days
  (decision 0011). Around midnight the two can disagree by a day; recorded as a follow-up in TASKS.md.
- Root's clip cache is tagged with the learning language, native language and level it was fetched for (review M3, commit 6a1c73c), so a
  change in Settings refetches native lines and highlights.
