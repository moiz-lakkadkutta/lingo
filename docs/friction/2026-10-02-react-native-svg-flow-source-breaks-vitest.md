# react-native-svg pulls React Native's Flow source into vitest, so render tests need a mock

Task attempted: Render the Pair and First run screens (they draw the pairing QR code with react-native-svg) in shared-ui's vitest
render tests, in Node (LING-005, commit d01b419).
Steps:
  1. shared-ui's `vitest.config.ts` already aliases `react-native` to a stub (`test/stubs/react-native.ts`), because react-native ships
     Flow source that Node cannot load.
  2. Render a screen that imports `react-native-svg` 15.12.1.
Expected: The `react-native` alias covers react-native-svg too, or the package's CommonJS build loads in Node.
Actual: react-native-svg's sources import React Native internals by deep path, for example
`import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent'`
(`src/fabric/IOSSvgViewNativeComponent.ts:1`). Those files are Flow. A probe test on 2026-10-02 that unmocks the package
(`vi.unmock('react-native-svg'); await import('react-native-svg')`) fails with `SyntaxError: Unexpected token 'typeof'` (Flow's
`import typeof`). The alias for the bare `react-native` name does not help.
Severity: Low. It blocks only the render tests of screens that draw the QR code; minutes lost TBD by human.
Workaround: `vi.mock('react-native-svg', …)` in `packages/shared-ui/test/setup.tsx:48-52` returns plain host components (`Svg`, `Path`,
`Rect`), which is all the QR code needs in a render test.
Suggestion: react-native-svg could keep its Node/Jest entry (`main`) free of deep `react-native/Libraries/*` imports, or document a
test mock as react-native-reanimated does.
Environment: Third party (React Native library). Node 22.22.0, vitest 2.1.9, react-native-svg 15.12.1, react-native-tvos 0.81.5-2,
React 19.1.0; Linux container.
Links:
  - `packages/shared-ui/test/setup.tsx:48` (the mock and its comment), `packages/shared-ui/vitest.config.ts` (the react-native alias)
  - Commit d01b419 (LING-005 shared-ui foundation)
