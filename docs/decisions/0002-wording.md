# 0002 — Wording

A missed day says "Welcome back", never "streak broken". Quiz feedback shows the right answer; it never says "wrong" or "failed".
Levels are labelled as approximate CEFR from frequency bands. Copy speaks like a good teacher: short, warm, specific.
Enforced by `pnpm lint:words` for `packages/shared-ui/src/**`, `apps/phone/src/**`, `apps/vega/src/**` and `apps/expo/**` (generated `android`,
`ios`, `build`, `dist`, `.expo` and `node_modules` trees skipped); the last two were added in PR #14 (`fix/pre-submission-polish`).
