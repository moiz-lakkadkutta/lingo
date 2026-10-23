import React from 'react'
import { View } from 'react-native'
import { T } from '../../components/Text'
import { tokens } from '../../theme/tokens'
import { px } from '../../theme/scale'

/** 28 px bottom-left status ("Challenge · 0.75×", "‹ › previous or next line"), shown with the chrome. It sits on the same cue box as the
 *  subtitles and the progress strip, so it stays readable over bright video (device test 2026-10-23, shots 16 and 46). */
export function StatusLine(p: { parts: string[]; visible: boolean }): React.JSX.Element | null {
  if (!p.visible || p.parts.length === 0) return null
  return (
    <View
      testID="status-line" pointerEvents="none"
      style={{ position: 'absolute', left: px(tokens.layout.safeX), bottom: px(tokens.layout.safeY), backgroundColor: tokens.color.cueBox, borderRadius: px(tokens.radius.lg), paddingHorizontal: px(tokens.layout.progressPadX), paddingVertical: px(tokens.layout.progressPadY) }}
    >
      <T variant="label" color={tokens.color.text}>{p.parts.join(' · ')}</T>
    </View>
  )
}
