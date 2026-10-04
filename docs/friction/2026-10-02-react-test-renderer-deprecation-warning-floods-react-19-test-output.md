# react-test-renderer prints a deprecation warning per render under React 19, which floods the test output

Task attempted: Run the shared-ui and phone render tests (LING-005, LING-006, LING-007), which use react-test-renderer in Node because
there is no DOM and no native runtime.
Steps:
  1. `pnpm --filter @lingo/shared-ui exec vitest run` (react-test-renderer 19.1.0, React 19.1.0).
  2. Count the warnings: `grep -c "react-test-renderer is deprecated"` on the output.
Expected: One notice at most, or none, since the package is still published for React 19 and the tests pass.
Actual: 135 lines of `react-test-renderer is deprecated. See https://react.dev/warnings/react-test-renderer` for 281 passing tests
(43 files), run on 2026-10-02. A real failure is easy to miss between them. React's own guidance points to React Testing Library,
which needs `@testing-library/react-native` and a Jest-style React Native preset. Lingo's tests deliberately run React Native as
plain host components in vitest (`test/setup.tsx`).
Severity: Low. Noise only; nothing fails.
Workaround: None applied. Read the vitest summary lines rather than the scrollback.
Suggestion: React could print the notice once per process, or offer a supported renderer for host-component tests in Node.
Environment: Third party (React). Node 22.22.0, vitest 2.1.9, react 19.1.0, react-test-renderer 19.1.0; Linux container.
Links:
  - https://react.dev/warnings/react-test-renderer
  - `packages/shared-ui/package.json`, `apps/phone/package.json` (react-test-renderer 19.1.0), `packages/shared-ui/test/setup.tsx`
