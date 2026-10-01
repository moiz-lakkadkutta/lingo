import React from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'

export type Style = Record<string, unknown>
export const is = (n: ReactTestInstance, host: string) => (n.type as unknown) === host
export const flat = (s: unknown): Style => (Array.isArray(s) ? Object.assign({}, ...s.map(flat)) : s && typeof s === 'object' ? (s as Style) : {})
const mounted: ReactTestRenderer[] = []
/** Unmount everything a test rendered, so effects (BackHandler listeners, timers) never leak into the next test. */
afterEach(() => { act(() => { for (const r of mounted.splice(0)) { try { r.unmount() } catch { /* already unmounted */ } } }) })
export const render = (el: React.ReactElement): ReactTestRenderer => {
  let r: ReactTestRenderer | undefined
  act(() => { r = create(el, { createNodeMock: () => ({}) }) })
  mounted.push(r!)
  return r!
}
export const rerender = (r: ReactTestRenderer, el: React.ReactElement) => { act(() => { r.update(el) }) }
export const textOf = (n: ReactTestInstance): string => [n.props.children].flat(Infinity).filter((c) => typeof c === 'string' || typeof c === 'number').join('')
export const texts = (r: ReactTestRenderer | ReactTestInstance) => ('root' in r ? r.root : r).findAll((n) => is(n, 'Text')).map(textOf)
export const pressables = (r: ReactTestRenderer) => r.root.findAll((n) => is(n, 'Pressable'))
export const labels = (r: ReactTestRenderer) => pressables(r).map((p) => p.props['aria-label'] as string)
export const preferred = (r: ReactTestRenderer) => pressables(r).filter((p) => p.props.hasTVPreferredFocus)
export const byLabel = (r: ReactTestRenderer, label: string) => r.root.find((n) => is(n, 'Pressable') && n.props['aria-label'] === label)
export const press = async (n: ReactTestInstance) => { await act(async () => { await n.props.onPress?.() }) }
export const focus = (n: ReactTestInstance) => { act(() => { n.props.onFocus?.() }) }
export const blur = (n: ReactTestInstance) => { act(() => { n.props.onBlur?.() }) }
/** The Animated.View inside a Focusable (its visual box). */
export const box = (p: ReactTestInstance): Style => flat(p.findByType('Animated.View' as never).props.style)
export const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
import { BackHandler } from 'react-native'
/** Press the hardware Back key: listeners run newest first until one returns true. Returns whether it was handled (false → the OS would exit). */
export const pressBack = (): boolean => {
  const ls = (BackHandler as unknown as { __listeners: Array<() => boolean | null | undefined> }).__listeners
  let handled = false
  act(() => { for (const fn of [...ls].reverse()) if (fn()) { handled = true; break } })
  return handled
}
export const backListeners = () => (BackHandler as unknown as { __listeners: unknown[] }).__listeners.length
/** Identity of a mounted Focusable: its Animated.Value lives in a ref, so it changes only on a remount (focus would be lost). */
export const mountId = (p: ReactTestInstance): unknown => (box(p).transform as Array<{ scale: unknown }>)[0]!.scale
