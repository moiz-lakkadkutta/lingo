import React from 'react'
import { Text, View } from 'react-native'
import type { bandRows } from '../lib/progress'
import { color, space, type } from '../theme'

type Row = ReturnType<typeof bandRows>[number]
/** One approximate level: label · bar (track surface2, fill interactive) · "known of saved" as text, so the bar never carries the number alone. */
export function BandBar({ row }: { row: Row }) {
  return (
    <View accessible aria-label={row.label} accessibilityLabel={row.label} style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
      <Text style={[type.label, { color: color.text, width: 32 }]}>{row.level}</Text>
      <View testID="band-track" style={{ flex: 1, height: 12, borderRadius: 6, backgroundColor: color.surface2, overflow: 'hidden' }}>
        <View testID="band-fill" style={{ width: `${Math.round(row.fraction * 100)}%`, height: 12, borderRadius: 6, backgroundColor: color.interactive }} />
      </View>
      <Text style={[type.label, { color: color.textSecondary, minWidth: 64, textAlign: 'right' }]}>{row.value}</Text>
    </View>
  )
}
