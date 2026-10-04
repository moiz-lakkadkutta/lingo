/**
 * react-native and the Expo modules as plain host components / spies for render tests (react-test-renderer in Node).
 * Copied from packages/shared-ui/test/setup.tsx, plus the hosts and modules the phone uses.
 */
import React from 'react'
import { vi } from 'vitest'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const host = (name: string) => {
  const C = (props: Record<string, unknown>) => React.createElement(name, props)
  C.displayName = name
  return C
}

vi.mock('react-native', () => {
  class Value {
    v: number
    constructor(v: number) { this.v = v }
    setValue(v: number) { this.v = v }
    interpolate(c: { inputRange: number[]; outputRange: Array<number | string> }) { return { interpolated: c } }
  }
  const anim = () => ({ start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }), stop: () => {}, reset: () => {} })
  const FlatList = (props: { data?: unknown[]; renderItem: (i: { item: unknown; index: number }) => React.ReactNode; keyExtractor?: (item: unknown, i: number) => string }) =>
    React.createElement('FlatList', props, (props.data ?? []).map((item, index) => React.createElement(React.Fragment, { key: props.keyExtractor?.(item, index) ?? index }, props.renderItem({ item, index }))))
  // TextInput keeps a focus() spy on its instance so tests can see focus moving between code boxes.
  const TextInput = React.forwardRef((props: Record<string, unknown>, ref) => {
    React.useImperativeHandle(ref, () => ({ focus: () => (globalThis as { __focused?: unknown }).__focused = props['aria-label'], blur: () => {} }))
    return React.createElement('TextInput', props)
  })
  TextInput.displayName = 'TextInput'
  return {
    Platform: { OS: 'android', select: <T,>(o: { default?: T; android?: T }) => o.android ?? o.default },
    StyleSheet: { create: <T,>(s: T) => s, absoluteFill: {}, absoluteFillObject: {}, hairlineWidth: 1, flatten: <T,>(s: T) => s },
    Dimensions: { get: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }) },
    PixelRatio: { roundToNearestPixel: (n: number) => n, get: () => 1 },
    View: host('View'),
    Text: host('Text'),
    Image: host('Image'),
    ScrollView: host('ScrollView'),
    Pressable: host('Pressable'),
    TextInput,
    KeyboardAvoidingView: host('KeyboardAvoidingView'),
    ActivityIndicator: host('ActivityIndicator'),
    FlatList,
    AccessibilityInfo: { announceForAccessibility: vi.fn() },
    Animated: { View: host('Animated.View'), Text: host('Animated.Text'), Value, timing: anim, spring: anim, parallel: anim, sequence: anim },
    BackHandler: { addEventListener: () => ({ remove: () => {} }) },
  }
})

vi.mock('expo-speech', () => ({ speak: vi.fn(), stop: vi.fn() }))
vi.mock('expo-camera', () => ({ CameraView: host('CameraView'), useCameraPermissions: () => [{ granted: true }, vi.fn()] }))
vi.mock('expo-device', () => ({ deviceName: 'Test phone' }))
vi.mock('expo-linking', () => ({ useURL: () => null }))
vi.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000000' }))
vi.mock('@react-native-async-storage/async-storage', () => {
  const m = new Map<string, string>()
  const store = {
    getItem: vi.fn(async (k: string) => m.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => { m.set(k, v) }),
    removeItem: vi.fn(async (k: string) => { m.delete(k) }),
    clear: async () => { m.clear() },
  }
  return { default: store }
})
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: host('SafeAreaView'),
  SafeAreaProvider: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}))
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }))
