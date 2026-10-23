import React from 'react'
import { ScrollView, View } from 'react-native'
import { T } from './Text'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'
import { focusBleed } from '../theme/bleed'

/** Left-aligned 28 px label above a horizontal row; 24 px gutters; 3 cards visible + a peek of the fourth. */
export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: px(40) }}>
      <T variant="label" color={tokens.color.textSecondary} style={{ marginBottom: px(14) }}>{label.toUpperCase()}</T>
      {/* The first card's focus (1.04 + outline) would be clipped by the ScrollView: reach left by its bleed and pad it back. */}
      <ScrollView testID="row-scroll" horizontal showsHorizontalScrollIndicator={false} style={{ marginLeft: -focusBleed(tokens.layout.cardW) }}
        contentContainerStyle={{ columnGap: px(tokens.layout.gutter), paddingVertical: px(12), paddingLeft: focusBleed(tokens.layout.cardW), paddingRight: focusBleed(tokens.layout.cardW) }}>
        {children}
      </ScrollView>
    </View>
  )
}
