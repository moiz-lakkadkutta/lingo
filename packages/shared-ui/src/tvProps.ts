/**
 * TV focus props that react-native's TypeScript types omit (they exist at runtime on Android TV / react-native-tvos and on Vega).
 * Imported for its side effect by components that wire explicit focus neighbours.
 * React Native nextFocus*: https://reactnative.dev/docs/view#nextfocusdown-android · Vega: https://developer.amazon.com/docs/vega/0.22/focus-management
 */
export {}
declare module 'react-native' {
  interface ViewProps {
    nextFocusUp?: number | undefined
    nextFocusDown?: number | undefined
    nextFocusLeft?: number | undefined
    nextFocusRight?: number | undefined
  }
}
