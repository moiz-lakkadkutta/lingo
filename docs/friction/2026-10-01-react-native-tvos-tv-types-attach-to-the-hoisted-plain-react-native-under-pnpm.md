# react-native-tvos: the TV types attach to the hoisted plain react-native under pnpm

Task attempted: Typecheck the Fire OS entry (`apps/expo`, react-native-tvos 0.81.5-2 under the `react-native` alias) in the pnpm
monorepo; `RemoteBridge.tsx` imports `useTVEventHandler` and `HWEvent` from `react-native` (LING-003 G3).
Steps:
  1. `pnpm --filter @lingo/expo typecheck` (`tsc --noEmit`).
  2. `tsc --traceResolution` to see where `react-native` resolves.
Expected: The TV APIs that react-native-tvos exports at runtime are visible to TypeScript through `import … from 'react-native'`.
Actual:
  - `RemoteBridge.tsx(2,10): error TS2305: Module '"react-native"' has no exported member 'useTVEventHandler'` and `(2,34)` for `HWEvent`.
    CI typecheck was red from LING-003 G3 until the fix, and `pnpm test` never ran in CI (docs/reviews/2026-10-01-pipeline-pr.md, H1).
  - Cause (traced): `react-native-tvos/types/public/ReactNativeTVTypes.d.ts` declares the TV types as an augmentation,
    `declare module 'react-native' { … }`. TypeScript resolves that module name from the file's own location in pnpm's virtual store,
    where there is no `react-native` sibling, so it walks up to `node_modules/.pnpm/node_modules/react-native` — plain react-native 0.81.0,
    hoisted there because `apps/phone` depends on it. The augmentation lands on the plain RN types; the app's imports see the tvos types
    without it (52 resolutions to react-native-tvos, 10 to react-native 0.81.0). Runtime is unaffected (Metro bundles tvos).
Severity: Medium — CI red for about a day, with a misleading error (the exports do exist); minutes lost: TBD by human.
Workaround: `apps/expo/tsconfig.json` `compilerOptions.paths: { "react-native": ["./node_modules/react-native"] }` (commit f67fd9e);
`tsc --noEmit` exits 0 with it and the two errors return without it. Un-hoisting plain RN does not help: the augmentation then
resolves to nothing.
Suggestion: Ship the TV types in react-native-tvos's own `types/index.d.ts` exports instead of a `declare module 'react-native'`
augmentation (or document the `paths` pin for pnpm / monorepos); Amazon's Fire OS guidance for react-native-tvos could mention it.
Environment: Platform: Fire OS (third party: react-native-tvos, pnpm). Expo SDK 54, react-native-tvos 0.81.5-2), pnpm 9.15.9 workspaces, TypeScript 5.x, `moduleResolution` Bundler;
Linux sandbox and CI (ubuntu-latest), 2026-10-01.
Links:
  - docs/reviews/2026-10-01-pipeline-pr.md (H1, with the trace)
  - commit f67fd9e (`apps/expo/tsconfig.json`)
  - https://github.com/react-native-tvos/react-native-tvos
