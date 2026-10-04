# 0011 — Phone access through the session code, reviews, UTC days and the streak

Status: accepted (LING-006 plan, 2026-10-01; code done 2026-10-02 with review fixes 9b98e2c). Two questions are **pending human
confirmation**: whether there is an Apple Developer membership (iOS ad hoc build or simulator only), and whether the demo API runs on
the laptop LAN over cleartext HTTP or behind HTTPS (docs/plans/LING-006.md, Open question 10).
Plan: docs/plans/LING-006.md (Risks R3–R8, Open questions). Review: docs/reviews/2026-10-02-ling-006.md (M1–M6).
Numbering: the plan suggested `0009-phone-review.md`; 0009 is taken (`0009-gloss-quality.md`), so this record is 0011.
Builds on 0005 (the session code is the single source of truth for pairing).

## Context

The phone reviews the words saved on the TV. Before LING-006 the phone had its own `x-device-id` learner and saw none of the TV's
words. The TV shows a 6-character code (32-letter alphabet, about 1.07 × 10⁹ codes) that the phone already uses to join the Socket.IO
room. The review found that resolving the TV's learner from that code on every `/me/*` route made the code a permanent, unthrottled
bearer credential with write access to the TV's settings, that `GET /me` leaked the TV's `deviceId`, that pino-http logged the code,
and that a retried review applied SM-2 twice.

## Decision

1. **`x-session-code` resolves the TV's learner on four phone routes only**: `GET /me`, `GET /me/words`, `POST /me/reviews` and
   `GET /me/stats` (`learner(req, { allowCode: true })`, `apps/api/src/lib/learner.ts`). Every other route uses `x-device-id` only and
   ignores the header, so a code holder can never change the TV's settings, level, progress or purchases.
2. **Uniform 404 and a rate limit.** A malformed code and a well-formed unknown code both answer `404 UNKNOWN_CODE`, so a code's
   existence cannot be probed by its format. Each miss counts against the client IP; 20 misses a minute give `429 RATE_LIMITED` for any
   code until the window passes. The limiter is in memory and shared with the socket `join`.
3. **Responses and logs carry no second credential.** `GET /me` and `PUT /me` answer `LearnerDto` only (no `deviceId`, `id` or internal
   columns). pino-http redacts `x-session-code` and `x-device-id`.
4. **Reviews are idempotent.** `POST /me/reviews` takes a client `reviewId` (optional in the contract, unique per saved word; a
   `reviewId` already recorded returns the current schedule unchanged) and updates the schedule conditionally on the values it read,
   so a retry after a lost response, or a double tap, applies SM-2 once. SM-2 stays literal and
   server-side (`apps/api/src/lib/sm2.ts`); the phone never computes an interval. Same-session repeats of items graded below "good" stay
   on the phone; only the first grade is sent.
5. **Days are UTC calendar days** for "due today" (`GET /me/words?due=today` uses the next UTC midnight), the streak, the stats and,
   since the LING-007 review (M5), the free tier's 20 saves a day. A Berlin learner's day rolls at 01:00 or 02:00 local time.
6. **The server owns the streak.** `Learner.streak` and `lastStudyDay` are written only by `touchStreak` (`apps/api/src/lib/streak.ts`),
   on a saved word and on a graded review. A missed day shows "Welcome back" (decision 0002), never a zero streak. Any screen that shows
   the streak reads `GET /me/stats.streak` (`displayStreak`), not `LearnerDto.streak`, which keeps the old count until the next activity
   (review L5). A clip completion does not count as a study day (LING-005 did not wire `touchStreak` into `PUT /me/progress`).
7. **"Known" for the Progress bands = SM-2 interval ≥ 6 days** (`KNOWN_MIN_INTERVAL_D`): the word survived its first 1-day review.
8. **Quiz events** (`quiz:start`, `quiz:result`) go to the room except the sender and need membership of that room. A phone
   `quiz:result` is a review tally and never feeds `PUT /me/level` (decision 0010).
9. **The phone refuses a TV only on `UNKNOWN_CODE`.** Other session errors retry the join with backoff (1 s, 2 s, … 30 s) and keep the
   remembered TV.
10. **Audio is on-device TTS** (`expo-speech`): no Polly, no AWS call. Cleartext HTTP (`usesCleartextTraffic`, ATS exceptions) is for
    internal LAN builds only and goes when the API moves behind HTTPS.

## Consequences

- The session code is still a long-lived secret for reading the TV's words and grading them. Rotation on "Pair a new phone" or a
  per-phone token from the socket `join`, a shared limiter store before a second API instance, and `trust proxy` behind a load balancer
  are open (TASKS.md, LING-006 follow-up). The API must not be exposed to the internet as it is; today it runs on the LAN only.
- One review tap is one SM-2 step, even on a flaky network.
- UTC days are simple and testable; a per-learner time zone is a follow-up. The TV's Words "Due today" filter still uses local time
  (decision 0010, Consequences).
- Open review lows (quiz-event roles, stale room membership, Backspace in the code boxes, ATS keys, streak edge cases, fetch timeout,
  deep-link forgetting the TV, mid-deck repeats, EAS pinning) are listed in TASKS.md.
