# translate per cue register and spelled letters

Task attempted: Produce the native-language subtitle track by translating each cue with Amazon Translate `TranslateText`
(en → de for the VOA lesson, de → en for the German clip), keeping one translation per cue so the two tracks stay aligned.
Steps:
  1. Run the pipeline on `voa-lets-learn-english-01` and `terra-x-friedlaender` with one `TranslateText` call per cue and
     no `Settings`.
  2. Read the German native track next to the English source.
Expected: A consistent register across a dialogue (all `du` or all `Sie`); spelled-out letters stay letters.
Actual:
  - Neighbouring cues of the same conversation switch between `Sie` and `du`, because each call sees one cue and has no
    context.
  - A spelled name, `N A.`, came back as `IN EINER.` (the letters read as English words).
  - `TranslateText` has no context parameter; the only way to give context is to send several cues in one call and split the
    result, which breaks the 1:1 cue alignment.
Severity: Medium — visible to every learner on the native track; a learner using the translation to check meaning gets a
different register in each line, and spelled names become nonsense.
Workaround (planned in decision 0008 §11, LING-001 quality plan): send `Settings: { Formality: 'INFORMAL' | 'FORMAL',
Brevity: 'ON' }` (formality per clip, default informal, only for target languages that support it; brevity for both
directions, since en↔de is a supported pair). A cue made only of spelled letters (`A N N A.`) is copied verbatim into the
native track instead of being translated.
Suggestion: A context field (previous/next segments that are not translated) or a batch-with-alignment mode for subtitle
use; a "do not translate" pattern for single-letter tokens. Mention per-segment register drift in the formality docs.
Environment: Amazon Translate `TranslateText`, en-US ↔ de, 2026-10-01; Node 22.19.0, AWS SDK for JavaScript v3.
Links:
  - Formality: https://docs.aws.amazon.com/translate/latest/dg/customizing-translations-formality.html
  - Brevity: https://docs.aws.amazon.com/translate/latest/dg/customizing-translations-brevity.html
  - TranslationSettings: https://docs.aws.amazon.com/translate/latest/APIReference/API_TranslationSettings.html
  - `docs/decisions/0008-upstream-quality.md` §11, `docs/plans/LING-001-quality.md`
