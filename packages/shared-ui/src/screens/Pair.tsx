import React from 'react'
import { View } from 'react-native'
import { Focusable, T } from '../components'
import { strings } from '../strings'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'
/** QR + 6-character code. QR rendering via react-native-svg (Vega-supported) — LING-004 adds the encoder. */
export function Pair({ code, connected, onLater }: { code: string; connected: string | null; onLater: () => void }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: px(24), maxWidth: px(1200) }}>
      <T variant="display">{strings.pair.title}</T>
      <T variant="body" color={tokens.color.textSecondary}>{strings.pair.body}</T>
      <View style={{ flexDirection: 'row', gap: px(40), alignItems: 'center' }}>
        <View style={{ width: px(320), height: px(320), backgroundColor: tokens.color.text, borderRadius: 8 }} accessibilityLabel={`QR code for ${code}`} />
        <T variant="display" style={{ letterSpacing: px(8) }}>{code}</T>
      </View>
      {connected ? <T variant="title" color={tokens.color.interactive} accessibilityLiveRegion="polite">✓ {strings.pair.connected(connected)}</T> : <Focusable label={strings.pair.later} hasTVPreferredFocus onPress={onLater} style={{ alignSelf: 'flex-start', backgroundColor: tokens.color.surface2, paddingHorizontal: px(28), paddingVertical: px(16) }}><T variant="body">{strings.pair.later}</T></Focusable>}
    </View>
  )
}
