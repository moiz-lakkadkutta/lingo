import React, { useState } from 'react'
import { Animated, Pressable, StyleSheet, type View, type ViewStyle } from 'react-native'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'
import { tvFocusProps } from '../tvFocus'

export interface FocusableProps {
  children: React.ReactNode
  onPress?: () => void
  onFocus?: () => void
  onBlur?: () => void
  label: string // aria-label: purpose, not "button"
  hint?: string
  selected?: boolean
  style?: ViewStyle
  hasTVPreferredFocus?: boolean
  testID?: string
  /** The underlying Pressable, for nextFocus* node handles. */
  focusRef?: React.Ref<View>
  nextFocusUp?: number
  nextFocusDown?: number
  nextFocusLeft?: number
  nextFocusRight?: number
  /** Still focusable (focus does not jump), but announced as disabled and Select does nothing. */
  disabled?: boolean
}

/** Focus is a physical change: outline + 1.04 scale in 150 ms. Selected is a persistent accent ring. Never colour alone. */
export function Focusable({ children, onPress, onFocus, onBlur, label, hint, selected, style, hasTVPreferredFocus, testID, focusRef, nextFocusUp, nextFocusDown, nextFocusLeft, nextFocusRight, disabled }: FocusableProps) {
  const [focused, setFocused] = useState(false)
  const scale = React.useRef(new Animated.Value(1)).current
  const animate = (to: number) => Animated.timing(scale, { toValue: to, duration: tokens.motion.focusMs, useNativeDriver: true }).start()
  return (
    <Pressable
      ref={focusRef}
      {...tvFocusProps({ nextFocusUp, nextFocusDown, nextFocusLeft, nextFocusRight })}
      onPress={disabled ? undefined : onPress}
      onFocus={() => { setFocused(true); animate(tokens.motion.focusScale); onFocus?.() }}
      onBlur={() => { setFocused(false); animate(1); onBlur?.() }}
      hasTVPreferredFocus={hasTVPreferredFocus}
      aria-label={label}
      accessibilityHint={hint}
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      testID={testID}
      style={{ outlineWidth: 0 }}
    >
      <Animated.View
        style={[
          styles.base,
          style,
          selected && { borderColor: tokens.color.interactive, borderWidth: px(3) },
          focused && { borderColor: tokens.color.focus, borderWidth: px(tokens.focus.width), margin: -px(tokens.focus.width) },
          { transform: [{ scale }] },
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  )
}
const styles = StyleSheet.create({ base: { borderRadius: 6, borderColor: 'transparent', borderWidth: 0 } })
