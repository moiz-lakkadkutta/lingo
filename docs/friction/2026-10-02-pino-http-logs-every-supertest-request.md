# pino-http logs every supertest request in the API tests, headers included

Task attempted: Run the API integration tests (supertest against `createServer().app`, real Postgres) for LING-005, 006 and 007.
Steps:
  1. `DATABASE_URL=… vitest run` in `apps/api` (20 files, 165 tests on 2026-10-02).
  2. The same with `LOG_LEVEL=silent`.
Expected: Test output shows test results; request logging stays out of unit and integration runs unless asked for.
Actual: `app.use(pinoHttp({ logger }))` logs every request at `info` (`apps/api/src/lib/logger.ts` reads `LOG_LEVEL`, default
`info`). 294 of the 350 output lines were request logs; with `LOG_LEVEL=silent` the output was 40 lines. Before the LING-006 review
fix, those lines also carried every request header: the review reproduced `"req":{"headers":{"x-session-code":"ABCDEF",
"x-device-id":"tv-1",…}}` and noted that "the API test run also prints full headers" (review-006 M3).
Severity: Low for the noise; Medium while the headers were credentials (fixed: pino-http now redacts `x-session-code` and
`x-device-id`, `apps/api/src/app.ts:21,30`).
Workaround: Run the API tests with `LOG_LEVEL=silent` (the reviewers did: docs/reviews/2026-10-02-ling-005.md "Checks run");
`LOG_LEVEL` is in turbo's `globalEnv`, so it reaches the task.
Suggestion: pino-http could document a test recipe (`autoLogging: false` or a silent logger under `NODE_ENV=test`) and point out
that the default request serializer logs all headers. For Lingo: default `LOG_LEVEL` to `silent` in `apps/api/vitest.config.ts`.
Environment: Third party (Node logging). pino 9.14.0, pino-http 10.5.0, supertest 7.2.2, vitest 2.1.9, Node 22.22.0; Linux container.
Links:
  - docs/reviews/2026-10-02-ling-006.md (M3), commit 9b98e2c (redaction)
  - https://github.com/pinojs/pino-http
