import React from 'react'
import { View } from 'react-native'
import type { Level } from '@lingo/contracts'
import { T } from './Text'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'
/** "A2" on surface2 in the text colour: one chip style for every level (never a colour per level, never the marker). Hidden from
 *  accessibility: cards and the hero carry "about <level>" in their own labels. */
export function LevelChip({ level }: { level: Level }) {
  return (
    <View testID="level-chip" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ alignSelf: 'flex-start', backgroundColor: tokens.color.surface2, paddingHorizontal: px(10), paddingVertical: px(4), borderRadius: 3 }}>
      <T variant="label" color={tokens.color.text}>{level}</T>
    </View>
  )
}
