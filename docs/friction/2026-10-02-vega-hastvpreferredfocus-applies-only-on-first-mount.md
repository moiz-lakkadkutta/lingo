# Vega: `hasTVPreferredFocus` applies only on first mount, so focus memory has to remount views

Task attempted: Give the TV screens focus memory on both OSes from one `shared-ui` (LING-005): Back returns focus to the card or row the
learner left, a filter change on Words keeps one focused row, and the Explain card hands focus back to the stage (LING-003).
Steps:
  1. Read the Vega focus-management page and the React Native for Vega `Pressable` reference (decision 0006, Doc URLs).
  2. Design focus restoration with `hasTVPreferredFocus` on the remembered element, as on Android TV.
Expected: Setting `hasTVPreferredFocus` on an already mounted view moves focus to it, or Vega offers an
imperative focus call that `shared-ui` may import.
Actual: On Vega, `hasTVPreferredFocus` is honoured on initial mount only (docs as read for decision 0006 §Context 3 and §5). A view
that is already mounted never takes focus through the prop. Every focus restoration in Lingo therefore remounts the target:
  - the nav stack mounts only the top route, so a popped-back screen remounts with the prop on the remembered element
    (docs/plans/LING-005.md §0.2, `nav/focusMemory.ts`);
  - the Player bumps the stage's `key` when the Explain card closes (decision 0006 §5);
  - Words keys its list by filter. The LING-005 review (M4) found that without this, a filter change that removed the focused row left
    no element focused, and "on Vega focus may stay lost". Fixed in commit 8c50e2f.
  Not verified on a Vega device or the Vega Virtual Device yet (spike S2 waits for a VVD).
Severity: Medium. It shapes the navigation design and caused one review finding; minutes lost TBD by human.
Workaround: Remount-based focus memory: a per-route-key map of element ids held by Root, and a `key` change wherever focus must be
restored inside a mounted screen.
Suggestion: Apply `hasTVPreferredFocus` when it changes from false to true, or document a supported
imperative focus call (and whether `FocusManager` is usable from shared code) on the focus-management page.
Environment: Platform: Vega OS. Vega SDK docs 0.22 / React Native for Vega 0.72 docs (read for decision 0006, 2026-10-01); no Vega device
or VVD run yet.
Links:
  - https://developer.amazon.com/docs/vega/0.22/focus-management
  - https://developer.amazon.com/docs/react-native-vega/0.72/pressable.html
  - docs/decisions/0006-word-focus.md, docs/plans/LING-005.md §0.2, docs/reviews/2026-10-02-ling-005.md (M4), commit 8c50e2f
