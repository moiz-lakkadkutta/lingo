# 0012 — Lingo Plus: SKUs, server-computed entitlement, verify-then-fulfil

Status: accepted (LING-007 plan §0, 2026-10-01; code done 2026-10-02 with review fixes 8a9cac4 and the Root wiring in d4f1c48).
**Pending human confirmation:** the Developer Console entries (parent SKU `lingo.plus`, term SKU `lingo.plus.monthly`, price) and the
App Tester / RVS sandbox run on both OSes; the cancel line's URL (amazon.com/appstoresubscriptions, plan Q3); the
`AppstoreAuthenticationKey.pem` from the console (git-ignored; EAS builds do not carry it yet, review L10).
Plan: docs/plans/LING-007.md §0. Review: docs/reviews/2026-10-02-ling-007.md (H1, M1–M5).
Numbering: the plan and the code comments call this "decision 0009" (`apps/api/src/lib/env.ts`, `lib/entitlement.ts`, `routes/iap.ts`,
`packages/contracts/src/iap.ts`, `packages/shared-ui/src/plus/flow.ts`). 0009 is taken by `0009-gloss-quality.md`, so this record is
0012; the comments are to be renumbered (TASKS.md follow-up).

## Context

PLAN §10: one subscription, Lingo Plus, unlocks Challenge mode, unlimited saves (the free tier saves 20 words a day) and 0.75×
playback. It must work in the Amazon sandbox on Fire OS and Vega, behind a feature flag, with an honest screen. Amazon subscriptions
are a non-buyable parent SKU plus buyable term SKUs, and the receipt carries both. An app cannot cancel a subscription. The review
found that the first version ended Plus only when the client opened the Plus screen, re-checked only the newest purchase, and failed
open in a production deployment with default settings.

## Decision

1. **SKUs.** Parent `lingo.plus`; term SKU `lingo.plus.monthly` (Monthly), which is what the client buys. The server accepts an RVS
   result whose `termSku` is `lingo.plus.monthly` or whose `productId` is `lingo.plus` or `lingo.plus.monthly`.
2. **One entitlement, computed on the server.** `plus` = mode `demo`, or mode `iap` and at least one active `Purchase` row of the learner.
   A row is active while its `cancelDate` is null or ahead **and** its `renewalDate` is null or `renewalDate + 3 days` is ahead
   (`RENEWAL_GRACE_MS`, `apps/api/src/lib/entitlement.ts`). Every gate reads the server value: the save limit runs on the server, and
   Challenge mode and 0.75× read `learner.plus` from `GET /me`, which answers the computed value (as does `PUT /me`). The client never
   sets `plus`; `Learner.plus` is only a cache.
3. **Feature flag `LINGO_PLUS_MODE` = `iap` (default) | `demo` | `off`**, server env, shown by `GET /iap/status`. `iap` verifies with
   RVS; `demo` gives everyone Plus and the Plus screen says so (for filming and a flaky sandbox); `off` gives nobody Plus and makes no
   store call.
4. **Verify, then fulfil.** The client posts the receipt to `POST /iap/verify` and tells the store FULFILLED (`notifyFulfillment` on
   Vega, `finishTransaction` on Fire OS) only after the server answers `fulfil: true`. An unfulfilled receipt comes back on the next
   purchase-updates call, so a lost verify retries itself on the next start (Root runs one restore after `/me` in mode `iap` with a store)
   or on Restore. When the store has charged but verify did not confirm Plus, the screen shows the "pending" line and never "nothing was
   charged" (review M3). A store that cannot answer a restore gives its own line, not "no purchase found" (review M4).
5. **Re-verify on the server.** `refreshStale` re-verifies every not-cancelled purchase verified more than 24 h ago, on `GET /me` and
   `GET /iap/status`, at most once an hour per purchase and in parallel. The save gate and `/iap/verify` never wait on RVS. If RVS is
   never reached again, a row still lapses at `renewalDate + 3 days`, so Plus is bounded to one billing period plus grace (review H1).
6. **Production safety (fails closed).** Whenever `LINGO_PLUS_MODE` is not `off`, `RVS_ENV` must be set explicitly (`sandbox` or
   `production`); the API refuses to start without it, and no flag overrides that. Unless `NODE_ENV` is `development` or `test`
   (an unset `NODE_ENV` counts as a deploy), the API also refuses to start in mode `demo`, with sandbox RVS, with the default shared
   secret, or with `RVS_ENV=production` and an `RVS_BASE` other than `https://appstore-sdk.amazon.com`, unless
   `LINGO_ALLOW_UNSAFE_PLUS=true` (then each problem is logged at startup). `apps/api` `start` sets `NODE_ENV=production` and `dev`
   sets `development`; turbo passes `NODE_ENV` and `PORT` through (`globalEnv`). Every Plus variable is documented in `.env.example`.
   Mode and `RVS_ENV` are logged once, never the secret. Test receipts are refused when `RVS_ENV=production` (review-007 M2;
   PR #2 review A-M1 and A-L6, which found the first version keyed on `NODE_ENV=production` and so failed open).
7. **Identity.** Plus belongs to the TV learner (`x-device-id`, decision 0014). `/iap/*` never resolves a learner from a session code,
   and `/iap/verify` without `x-device-id` is 400. A receipt posted by a second learner moves to that learner (the newest poster wins);
   RVS still requires the matching Amazon user id.
8. **Libraries.** Fire OS: `react-native-iap` ~16.7.2 (OpenIAP, Amazon store via Gradle `openiapStore=amazon`, set by
   `apps/expo/plugins/withAmazonIap.js`). Vega: `@amazon-devices/keplerscript-appstore-iap-lib` ~2.13.0 used directly (2.12.13 fails
   every call; `pnpm check:vega` refuses it). Both are injected into shared-ui through `PlusStore`; shared-ui imports neither.
9. **Cancel.** The subscribed state shows one line pointing to Amazon's subscription page. Cancellation reaches Lingo through RVS
   `cancelDate` on re-verify, a restore with `isCancelled`, or the renewal grace running out.

## Consequences

- Plus ends on the server without any client cooperation; a tampered or old client cannot keep it.
- A production deploy cannot hand out Plus by accident; a deliberate demo needs `LINGO_ALLOW_UNSAFE_PLUS=true` and logs it.
- RVS (`appstore-sdk.amazon.com`, sandbox path `/sandbox/version/1.0/verifyReceiptId/…`) is an Amazon Appstore service, not AWS; it is
  listed in docs/aws.md under that heading.
- Residual risks accepted for the demo: receipt takeover by a learner who knows another's receipt id and Amazon user id (review L4);
  dot segments in RVS path parts (L1); the Vega Content Launcher answers SUCCESS for unknown slugs (L2). Open lows are in TASKS.md.
- Media Controls, Personalization and Content Launcher on Vega depend on kit escalations E1–E4 (plan §Escalations); until the kit
  implements them they are logged no-ops.
