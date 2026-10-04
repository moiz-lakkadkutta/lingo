import React from 'react'
import { Pressable, Text, type StyleProp, type ViewStyle } from 'react-native'
import { color, radius, space, tap, type } from '../theme'

export interface ButtonProps {
  label: string; onPress(): void; variant?: 'primary' | 'secondary'; disabled?: boolean
  /** Purpose for screen readers; defaults to the visible label. */
  ariaLabel?: string; style?: StyleProp<ViewStyle>; testID?: string
}
/** Primary = interactive fill + ground text; secondary = surface2 + text. Disabled = 0.5 opacity + aria-disabled (never colour alone). */
export function Button({ label, onPress, variant = 'secondary', disabled = false, ariaLabel, style, testID }: ButtonProps) {
  const primary = variant === 'primary'
  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      aria-label={ariaLabel ?? label}
      aria-disabled={disabled}
      accessibilityState={{ disabled }}
      style={[{ minHeight: tap, borderRadius: radius.button, backgroundColor: primary ? color.interactive : color.surface2, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.m, opacity: disabled ? 0.5 : 1 }, style]}
    >
      <Text style={[type.label, { color: primary ? color.ground : color.text, textAlign: 'center' }]}>{label}</Text>
    </Pressable>
  )
}
