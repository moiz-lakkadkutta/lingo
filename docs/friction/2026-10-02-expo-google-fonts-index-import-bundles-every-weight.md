# Expo Google Fonts: importing from the package index bundles every weight (about 11 MB of TTFs)

Task attempted: Load Noto Sans 400 and 600 and Manrope 800 in the phone app (LING-006) with `useFonts` from expo-font.
Steps:
  1. The usual pattern is `import { NotoSans_400Regular, NotoSans_600SemiBold } from '@expo-google-fonts/noto-sans'`.
  2. Read the package index: `node_modules/@expo-google-fonts/noto-sans/index.js`.
Expected: Importing two named fonts bundles two TTFs.
Actual: The generated `index.js` is a list of `export const NotoSans_100Thin = require('./100Thin/NotoSans_100Thin.ttf')` lines,
one per weight and style. Metro resolves every `require` in the module statically, so importing the index puts all of them in the
app. `@expo-google-fonts/noto-sans` 0.4.2 holds 18 TTFs, 11 MB in total (`du -ch` on 2026-10-02); Manrope 0.4.2 holds 7 TTFs (672 KB).
Severity: Low. Bundle size only; found while writing the phone app; minutes lost TBD by human.
Workaround: Import the per-weight entry points, as `apps/phone/src/App.tsx:10-13` does
(`@expo-google-fonts/noto-sans/400Regular`, `/600SemiBold`, `@expo-google-fonts/manrope/800ExtraBold`), with a comment saying why.
Suggestion: Lead the package README with the per-weight import, or say that the index bundles every weight.
Environment: Third party (Expo Google Fonts). Expo SDK 54, @expo-google-fonts/noto-sans 0.4.2, @expo-google-fonts/manrope 0.4.2,
Metro (Expo CLI 54.0.27).
Links:
  - `apps/phone/src/App.tsx:10` (the comment and the per-weight imports), commit 7a24999 ("fonts (per-weight Noto Sans 400/600, Manrope 800)")
  - https://github.com/expo/google-fonts
