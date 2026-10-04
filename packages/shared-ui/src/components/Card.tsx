import React from 'react'
import { Image, View } from 'react-native'
import type { Level } from '@lingo/contracts'
import { Focusable } from './Focusable'
import { LevelChip } from './LevelChip'
import { T } from './Text'
import { formatMinutes } from '../app/selectors'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'

export interface CardProps {
  title: string; imageUrl?: string; level?: Level; durationS?: number; /** 0..1 resume bar */ progress?: number
  label: string; onPress(): void; onFocus?(): void; preferred?: boolean; focusRef?: React.Ref<View>; nextFocusLeft?: number; testID?: string
}
/** 16:9 card, 412×232 px at 1080p. Level chip top-left (surface2), duration bottom-right (cue box), optional resume bar. */
export function Card({ title, imageUrl, level, durationS, progress, label, onPress, onFocus, preferred, focusRef, nextFocusLeft, testID }: CardProps) {
  const w = tokens.layout.cardW, h = tokens.layout.cardH
  return (
    <Focusable label={label} onPress={onPress} onFocus={onFocus} hasTVPreferredFocus={preferred} focusRef={focusRef} nextFocusLeft={nextFocusLeft} testID={testID}>
      <View style={{ width: px(w) }}>
        <View style={{ width: px(w), height: px(h), borderRadius: 6, overflow: 'hidden', backgroundColor: tokens.color.surface2 }}>
          {imageUrl ? <Image source={{ uri: imageUrl }} style={{ width: '100%', height: '100%' }} accessibilityIgnoresInvertColors /> : null}
          {level ? <View style={{ position: 'absolute', top: px(12), left: px(12) }}><LevelChip level={level} /></View> : null}
          {durationS !== undefined ? (
            <View testID="duration" style={{ position: 'absolute', right: px(12), bottom: px(12), backgroundColor: tokens.color.cueBox, paddingHorizontal: px(10), paddingVertical: px(4), borderRadius: 3 }}>
              <T variant="label">{formatMinutes(durationS)}</T>
            </View>
          ) : null}
          {progress !== undefined ? (
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: px(6), backgroundColor: tokens.color.scrim }}>
              <View testID="resume-bar" style={{ height: '100%', width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`, backgroundColor: tokens.color.interactive }} />
            </View>
          ) : null}
        </View>
        <T variant="body" numberOfLines={1} style={{ marginTop: px(10) }}>{title}</T>
      </View>
    </Focusable>
  )
}
