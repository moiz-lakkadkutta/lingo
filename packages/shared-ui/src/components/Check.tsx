import React from 'react'
import { View } from 'react-native'

/**
 * A check mark drawn with Views (no glyph: '✓' is not in Noto Sans, so it would fall back per device).
 * `size` is the slot's px edge after scale; `visible` false keeps the slot so text does not reflow when a word is saved.
 */
export function Check({ size, color, visible = true }: { size: number; color: string; visible?: boolean }) {
  const stroke = Math.max(1, Math.round(size * 0.14))
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', opacity: visible ? 1 : 0 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="check">
      <View style={{ width: size * 0.36, height: size * 0.66, borderRightWidth: stroke, borderBottomWidth: stroke, borderColor: color, transform: [{ translateY: -size * 0.08 }, { rotate: '45deg' }] }} />
    </View>
  )
}
