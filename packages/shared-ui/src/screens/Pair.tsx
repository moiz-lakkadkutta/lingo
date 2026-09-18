import React from 'react'
import { View } from 'react-native'
import { Focusable, QrCode, T } from '../components'
import { strings } from '../strings'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'
/** QR + 6-character code. The QR carries joinUrl; the code is the single source of truth (docs/decisions/0005-realtime-session.md). */
export function Pair({ code, joinUrl, connected, onLater }: { code: string | null; joinUrl: string | null; connected: string | null; onLater: () => void }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: px(24), maxWidth: px(1200) }}>
      <T variant="display">{strings.pair.title}</T>
      <T variant="body" color={tokens.color.textSecondary}>{strings.pair.body}</T>
      <View style={{ flexDirection: 'row', gap: px(40), alignItems: 'center' }}>
        {joinUrl && code
          ? <QrCode value={joinUrl} sizePx={320} label={strings.pair.qrLabel(code)} testID="pair-qr" />
          : <View style={{ width: px(320), height: px(320), backgroundColor: tokens.color.surface2, borderRadius: 8 }} accessibilityRole="image" aria-label={strings.pair.waiting} />}
        <T variant="display" style={{ letterSpacing: px(8) }}>{code ?? '······'}</T>
      </View>
      {connected ? <T variant="title" color={tokens.color.interactive} accessibilityLiveRegion="polite">✓ {strings.pair.connected(connected)}</T> : <Focusable label={strings.pair.later} hasTVPreferredFocus onPress={onLater} style={{ alignSelf: 'flex-start', backgroundColor: tokens.color.surface2, paddingHorizontal: px(28), paddingVertical: px(16) }}><T variant="body">{strings.pair.later}</T></Focusable>}
    </View>
  )
}
