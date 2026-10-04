# Expo: `expo install --check` and `expo-doctor` fail when api.expo.dev and reactnative.directory are unreachable

Task attempted: Run the phone checks the LING-006 plan asks for: `pnpm --filter @lingo/phone exec expo install --check` (must report
nothing to fix) and `expo-doctor` (paste the output into the report).
Steps:
  1. `curl -s -o /dev/null -w '%{http_code}'` for `https://api.expo.dev/v2/versions` and `https://reactnative.directory/api/data`
     (2026-10-02, in the cloud container).
  2. `pnpm exec expo install --check` in `apps/phone`.
  3. `npx -y expo-doctor@1.20.4 apps/phone`.
Expected: Both commands work from the locally installed SDK 54 metadata (`expo/bundledNativeModules.json`), or say clearly that the
network is the problem.
Actual: The egress proxy answers 403 with a plain-text body ("Host not in allowlist…"); registry.npmjs.org answers 200.
`expo install --check` stops with `SyntaxError: Unexpected token 'H', "Host not i"... is not valid JSON` and a stack trace from
`getNativeModuleVersionsAsync`. `expo-doctor` reports "16/18 checks passed": the app.json schema check fails with the same
`SyntaxError`, and "Validate packages against React Native Directory package metadata" fails with "Directory check failed with
unexpected server response". Neither failure is about the project. `EXPO_OFFLINE=1 expo install --check` prints "Dependency
validation is unreliable in offline-mode" and "Dependencies are up to date". The LING-006 plan already noted that docs.expo.dev
was blocked from the sandbox.
Severity: Low. The checks can be read around, but a failed doctor run cannot be pasted as evidence of a healthy project; minutes
lost TBD by human.
Workaround: `EXPO_OFFLINE=1 expo install --check` for the version check (it uses the bundled list); run `expo-doctor` on a
workstation. `expo export --platform android|ios` passed in the reviewer's sandbox (review-006 verification table).
Suggestion: Expo CLI could detect a non-JSON response and fall back to the bundled metadata with a one-line warning, and expo-doctor
could mark network-dependent checks as skipped rather than failed.
Environment: Third party (Expo tooling). Expo SDK 54 (`expo` 54.0.37, `@expo/cli` 54.0.27), expo-doctor 1.20.4, Node 22.22.0; Claude Code
cloud container behind an egress allowlist.
Links:
  - docs/plans/LING-006.md (checks list; "docs.expo.dev was blocked from this sandbox")
  - https://docs.expo.dev/more/expo-cli/ · https://github.com/expo/expo/tree/main/packages/expo-doctor
