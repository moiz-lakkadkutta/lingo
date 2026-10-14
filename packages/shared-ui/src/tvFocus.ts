import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { findNodeHandle, type View } from 'react-native'
/**
 * Explicit TV focus neighbours (node handles from findNodeHandle) for a Pressable or View.
 * nextFocus* exist at runtime on react-native-tvos (Fire OS) and on React Native for Vega, but the typings differ: react-native-tvos
 * declares them as FocusDestination, plain React Native omits them on View. Spreading `{...tvFocusProps(...)}` keeps shared-ui
 * independent of either platform's typings.
 * React Native nextFocus*: https://reactnative.dev/docs/view#nextfocusdown-android · Vega: https://developer.amazon.com/docs/vega/0.22/focus-management
 */
/** A node handle, or 'self': the key keeps focus where it is (resolved with the component's own handle). */
export type FocusTarget = number | 'self'
export interface TvFocusNeighbours { nextFocusUp?: FocusTarget; nextFocusDown?: FocusTarget; nextFocusLeft?: FocusTarget; nextFocusRight?: FocusTarget }

/** An opaque, spreadable bag of host props. */
export type TvFocusProps = {}

/** `self` is the component's own node handle; a 'self' link is dropped until it is known (first layout). */
export function tvFocusProps(n: TvFocusNeighbours, self?: number): TvFocusProps {
  const out: Record<string, number> = {}
  for (const k of ['nextFocusUp', 'nextFocusDown', 'nextFocusLeft', 'nextFocusRight'] as const) {
    const v = n[k] === 'self' ? self : n[k]
    if (v !== undefined) out[k] = v
  }
  return out
}

/**
 * The component's own node handle, for a 'self' focus link. Returns a callback ref for the host view and the handle, resolved after
 * layout (never during render) and only when `wanted`.
 */
export function useSelfHandle(wanted: boolean): [(v: View | null) => void, number | undefined] {
  const node = useRef<View | null>(null)
  const [handle, setHandle] = useState<number | undefined>(undefined)
  const ref = useCallback((v: View | null) => { node.current = v }, [])
  useLayoutEffect(() => {
    const h = wanted && node.current ? findNodeHandle(node.current) ?? undefined : undefined
    setHandle((prev) => (prev === h ? prev : h))
  })
  return [ref, handle]
}
