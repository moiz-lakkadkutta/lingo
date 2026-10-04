# Fonts

Noto Sans everywhere, Manrope 800 for display only (docs/PLAN.md; `src/theme/tokens.ts`). The file basenames equal the token families
(`NotoSans-Regular`, `NotoSans-SemiBold`, `Manrope-ExtraBold`): on Android the expo-font config plugin registers each embedded font
under its file name, and the Vega app copies the same files to `apps/vega/assets/fonts/` (`npm run copy-fonts`).

| File | Source (downloaded 2026-10-01) | sha256 | Licence |
|---|---|---|---|
| NotoSans-Regular.ttf | https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSans/hinted/ttf/NotoSans-Regular.ttf (Noto Project, static hinted TTF) | 478c558ea716033cd60c03438f628dfa75694dcf6b5f6d505a2f05fd2b4f3823 | SIL OFL 1.1, OFL-NotoSans.txt |
| NotoSans-SemiBold.ttf | https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSans/hinted/ttf/NotoSans-SemiBold.ttf | a4e91fd530ac2b4ef5367240144ff37d7d65d66cf76f2e9a2187b93c676f92d0 | SIL OFL 1.1, OFL-NotoSans.txt |
| Manrope-ExtraBold.ttf | npm `@expo-google-fonts/manrope@0.4.2`, `800ExtraBold/Manrope_800ExtraBold.ttf` (Google Fonts static instance, Manrope v20, renamed). The upstream repo https://github.com/sharanda/manrope was not reachable from the sandbox. | 5be6d9b21d23981ab520f0bfc7800c434c9d093467ef24b85b16877e7709b03b | SIL OFL 1.1, OFL-Manrope.txt (the package's LICENSE_FONT) |

OFL-NotoSans.txt is https://raw.githubusercontent.com/notofonts/latin-greek-cyrillic/main/OFL.txt. https://openfontlicense.org

Known gaps (not fixed here): Noto Sans (Latin/Greek/Cyrillic) has no Arabic glyphs, so an `ar` native line needs Noto Sans Arabic;
the tokens pair `NotoSans-SemiBold` with `fontWeight: '700'`, and Android may synthesise bold on top — a design-QA check
(docs/design-qa/README.md, check 6), not a token change.
