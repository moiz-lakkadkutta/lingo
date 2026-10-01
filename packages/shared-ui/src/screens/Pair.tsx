import React from 'react'
import { View } from 'react-native'
import { Button, QrCode, T } from '../components'
import { Check } from '../components/Check'
import { strings } from '../strings'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'

export interface PairProps { code: string | null; joinUrl: string | null; connected: string | null; onLater(): void; /** inside First run: the button reads "Start watching" once connected */ embedded?: boolean }
/**
 * QR + 6-character code. The QR carries joinUrl; the code is the single source of truth (docs/decisions/0005-realtime-session.md).
 * Exactly one focusable, the same element before and after a phone connects (Later → Continue / Start watching), so focus stays put.
 */
export function Pair({ code, joinUrl, connected, onLater, embedded }: PairProps) {
  const text = connected ? (embedded ? strings.firstRun.done : strings.pair.continue) : strings.pair.later
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
      <View style={{ minHeight: px(52) }} accessibilityLiveRegion="polite">
        {connected ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: px(12) }}>
            <Check size={px(40)} color={tokens.color.interactive} />
            <T variant="title" color={tokens.color.interactive}>{strings.pair.connected(connected)}</T>
          </View>
        ) : null}
      </View>
      <Button key="pair-action" label={text} text={text} primary={!!connected} preferred onPress={onLater} />
    </View>
  )
}
