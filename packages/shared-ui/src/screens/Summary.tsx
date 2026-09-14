import React from 'react'
import { View } from 'react-native'
import type { HighlightDto } from '@lingo/contracts'
import { Focusable, T } from '../components'
import { strings } from '../strings'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'
export function Summary({ saved, lang, phoneConnected, onQuizTv, onQuizPhone, onAgain, onNext }: { saved: HighlightDto[]; lang: 'de' | 'en'; phoneConnected: boolean; onQuizTv: () => void; onQuizPhone: () => void; onAgain: () => void; onNext: () => void }) {
  const btn = (label: string, onPress: () => void, primary = false) => <Focusable key={label} label={label} hasTVPreferredFocus={primary} onPress={onPress} style={{ backgroundColor: primary ? tokens.color.interactive : tokens.color.surface2, paddingHorizontal: px(28), paddingVertical: px(16) }}><T variant="body" color={primary ? tokens.color.ground : tokens.color.text}>{label}</T></Focusable>
  return (
    <View style={{ flex: 1, gap: px(28), justifyContent: 'center', maxWidth: px(1300) }}>
      <T variant="display">{saved.length ? strings.summary.newWords(saved.length, lang) : strings.summary.none}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: px(12) }}>
        {saved.map((h) => <View key={h.id} style={{ backgroundColor: tokens.color.marker, paddingHorizontal: px(14), paddingVertical: px(6), borderRadius: 4 }}><T variant="body" color={tokens.color.ground}>{h.word}</T></View>)}
      </View>
      <View style={{ flexDirection: 'row', gap: px(16), flexWrap: 'wrap' }}>
        {saved.length ? btn(strings.summary.quizTv, onQuizTv, true) : null}
        {saved.length && phoneConnected ? btn(strings.summary.quizPhone, onQuizPhone) : null}
        {btn(strings.summary.again, onAgain, !saved.length)}
        {btn(strings.summary.next, onNext)}
      </View>
    </View>
  )
}
