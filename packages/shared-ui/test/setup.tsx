/**
 * react-native as plain host components for render tests (react-test-renderer in Node). Logic tests see the same module:
 * Platform.OS is 'web', px() is identity (window 1920 wide, PixelRatio rounds nothing), Animated values are inert.
 */
import React from 'react'
import { vi } from 'vitest'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('react-native', () => {
  const host = (name: string) => {
    const C = (props: Record<string, unknown>) => React.createElement(name, props)
    C.displayName = name
    return C
  }
  class Value {
    v: number
    constructor(v: number) { this.v = v }
    setValue(v: number) { this.v = v }
    interpolate(c: { inputRange: number[]; outputRange: Array<number | string> }) { return { interpolated: c } }
  }
  const anim = () => ({ start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }), stop: () => {}, reset: () => {} })
  const View = host('View')
  return {
    Platform: { OS: 'web', select: <T,>(o: { default?: T; web?: T }) => o.web ?? o.default },
    StyleSheet: { create: <T,>(s: T) => s, absoluteFill: {}, absoluteFillObject: {}, hairlineWidth: 1, flatten: <T,>(s: T) => s },
    Dimensions: { get: () => ({ width: 1920, height: 1080, scale: 1, fontScale: 1 }) },
    PixelRatio: { roundToNearestPixel: (n: number) => n, get: () => 1 },
    View,
    Text: host('Text'),
    Image: host('Image'),
    ScrollView: host('ScrollView'),
    Pressable: host('Pressable'),
    Animated: { View: host('Animated.View'), Text: host('Animated.Text'), Value, timing: anim, spring: anim, parallel: anim, sequence: anim },
    // Records listeners so tests can press Back (helpers.pressBack): RN calls the most recently added listener first.
    BackHandler: (() => {
      const listeners: Array<() => boolean | null | undefined> = []
      return {
        __listeners: listeners,
        addEventListener: (_ev: string, fn: () => boolean | null | undefined) => { listeners.push(fn); return { remove: () => { const i = listeners.lastIndexOf(fn); if (i >= 0) listeners.splice(i, 1) } } },
      }
    })(),
    AccessibilityInfo: { announceForAccessibility: vi.fn(), isScreenReaderEnabled: async () => false },
    findNodeHandle: (r: unknown) => (r ? 1 : null),
  }
})

// react-native-svg imports react-native's Flow source; QrCode only needs host stand-ins (Pair, First run render tests).
vi.mock('react-native-svg', () => {
  const host = (name: string) => { const C = (props: Record<string, unknown>) => React.createElement(name, props); C.displayName = name; return C }
  return { default: host('Svg'), Svg: host('Svg'), Path: host('Path'), Rect: host('Rect') }
})
