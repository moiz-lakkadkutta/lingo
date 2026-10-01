/**
 * Explicit TV focus neighbours (node handles from findNodeHandle) for a Pressable or View.
 * nextFocus* exist at runtime on react-native-tvos (Fire OS) and on React Native for Vega, but the typings differ: react-native-tvos
 * declares them as FocusDestination, plain React Native omits them on View. Spreading `{...tvFocusProps(...)}` keeps shared-ui
 * independent of either platform's typings.
 * React Native nextFocus*: https://reactnative.dev/docs/view#nextfocusdown-android · Vega: https://developer.amazon.com/docs/vega/0.22/focus-management
 */
export interface TvFocusNeighbours { nextFocusUp?: number; nextFocusDown?: number; nextFocusLeft?: number; nextFocusRight?: number }

/** An opaque, spreadable bag of host props. */
export type TvFocusProps = {}

export function tvFocusProps(n: TvFocusNeighbours): TvFocusProps {
  const out: Record<string, number> = {}
  for (const k of ['nextFocusUp', 'nextFocusDown', 'nextFocusLeft', 'nextFocusRight'] as const) {
    const v = n[k]
    if (v !== undefined) out[k] = v
  }
  return out
}
