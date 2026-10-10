import React, { useCallback, useState } from 'react'
import { Animated, Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import { tokens, type ButtonVariant } from '../theme/tokens'
import { px } from '../theme/scale'
import { tvFocusProps, useSelfHandle, type FocusTarget } from '../tvFocus'

export interface FocusableProps {
  /** A function child gets the focus state, e.g. to pick tokens.button[variant].focused.text. */
  children: React.ReactNode | ((state: { focused: boolean }) => React.ReactNode)
  /** Action button fill per state from tokens.button; a focused primary draws its outline at an offset (the fill is the focus colour). */
  variant?: ButtonVariant
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
  /** Node handles, or 'self' to keep focus here on that key (decision 0006: pins the card/chip links against Android's spatial search). */
  nextFocusUp?: FocusTarget
  nextFocusDown?: FocusTarget
  nextFocusLeft?: FocusTarget
  nextFocusRight?: FocusTarget
  /** Still focusable (focus does not jump), but announced as disabled and Select does nothing. */
  disabled?: boolean
  /**
   * A semantic ring that must stay visible while focused (Quiz: correct = interactive blue, incorrect = coral). The box keeps the tone border
   * and focus is drawn as an extra outer ring (focus colour, offset tokens.focus.offset) plus the 1.04 scale, so neither hides the other.
   */
  tone?: 'correct' | 'incorrect'
}

/** Focus is a physical change: outline + 1.04 scale in 150 ms. Selected is a persistent accent ring. Never colour alone. */
export function Focusable({ children, variant, onPress, onFocus, onBlur, label, hint, selected, style, hasTVPreferredFocus, testID, focusRef, nextFocusUp, nextFocusDown, nextFocusLeft, nextFocusRight, disabled, tone }: FocusableProps) {
  const [focused, setFocused] = useState(false)
  const links = { nextFocusUp, nextFocusDown, nextFocusLeft, nextFocusRight }
  const [selfRef, self] = useSelfHandle(Object.values(links).includes('self'))
  const ref = useCallback((v: View | null) => {
    selfRef(v)
    if (typeof focusRef === 'function') focusRef(v)
    else if (focusRef) (focusRef as React.MutableRefObject<View | null>).current = v
  }, [focusRef, selfRef])
  // A ring outside the box when the box keeps its own border (tone) or its fill is the focus colour (focused primary).
  const ringed = !!tone || variant === 'primary'
  const fill = variant ? tokens.button[variant][focused ? 'focused' : 'rest'].fill : undefined
  const scale = React.useRef(new Animated.Value(1)).current
  const ringOut = (tone ? px(3) : 0) + px(tokens.focus.offset) + px(tokens.focus.width) // outside the 3 px tone border (if any), with the brief's offset
  const animate = (to: number) => Animated.timing(scale, { toValue: to, duration: tokens.motion.focusMs, useNativeDriver: true }).start()
  return (
    <Pressable
      ref={ref}
      {...tvFocusProps(links, self)}
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
          fill !== undefined && { backgroundColor: fill },
          selected && !tone && { borderColor: tokens.color.interactive, borderWidth: px(3) },
          tone && { borderColor: tone === 'correct' ? tokens.color.interactive : tokens.color.incorrect, borderWidth: px(3) },
          focused && !ringed && { borderColor: tokens.color.focus, borderWidth: px(tokens.focus.width), margin: -px(tokens.focus.width) },
          { transform: [{ scale }] },
        ]}
      >
        {typeof children === 'function' ? children({ focused }) : children}
        {focused && ringed ? <View testID="focus-ring" pointerEvents="none" style={[styles.ring, { top: -ringOut, left: -ringOut, right: -ringOut, bottom: -ringOut, borderWidth: px(tokens.focus.width) }]} /> : null}
      </Animated.View>
    </Pressable>
  )
}
const styles = StyleSheet.create({
  base: { borderRadius: 6, borderColor: 'transparent', borderWidth: 0 },
  ring: { position: 'absolute', borderRadius: 10, borderColor: tokens.color.focus },
})
