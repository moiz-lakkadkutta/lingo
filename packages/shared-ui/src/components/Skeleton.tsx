import React from 'react'
import { View } from 'react-native'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'
const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const }
/** Placeholder block while data loads: surface2, hidden from accessibility, never focusable. */
export function SkeletonBlock({ w, h, radius = 6 }: { w: number; h: number; radius?: number }) {
  return <View {...hidden} style={{ width: px(w), height: px(h), borderRadius: radius, backgroundColor: tokens.color.surface2 }} />
}
export function SkeletonCard() {
  return (
    <View {...hidden} style={{ width: px(tokens.layout.cardW), gap: px(10) }}>
      <SkeletonBlock w={tokens.layout.cardW} h={tokens.layout.cardH} />
      <SkeletonBlock w={300} h={24} radius={3} />
      <SkeletonBlock w={160} h={20} radius={3} />
    </View>
  )
}
export function SkeletonRow({ count = 4 }: { count?: number }) {
  return (
    <View {...hidden} style={{ marginBottom: px(40), gap: px(14) }}>
      <SkeletonBlock w={260} h={28} radius={3} />
      <View style={{ flexDirection: 'row', columnGap: px(tokens.layout.gutter), overflow: 'hidden' }}>
        {Array.from({ length: count }, (_, i) => <SkeletonCard key={i} />)}
      </View>
    </View>
  )
}
