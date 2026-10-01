import React from 'react'
import { View } from 'react-native'
import { T } from '../../components/Text'
import { tokens } from '../../theme/tokens'
import { px } from '../../theme/scale'

/** 28 px bottom-left status ("Challenge · 0.75×"), shown with the chrome. */
export function StatusLine(p: { parts: string[]; visible: boolean }): React.JSX.Element | null {
  if (!p.visible || p.parts.length === 0) return null
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: px(tokens.layout.safeX), bottom: px(tokens.layout.safeY) }}>
      <T variant="label" color={tokens.color.textSecondary}>{p.parts.join(' · ')}</T>
    </View>
  )
}
