import React from 'react'
import { View } from 'react-native'
import type { ClipDetail, HighlightDto, Lang } from '@lingo/contracts'
import { Button, Screen, T } from '../components'
import { Check } from '../components/Check'
import type { PhoneQuizState } from '../session/types'
import { strings } from '../strings'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'

export interface SummaryProps {
  clip: ClipDetail; saved: HighlightDto[]; lang: Lang; phoneName: string | null; phoneQuiz: PhoneQuizState
  lastTvQuiz: { correct: number; total: number } | null
  onQuizTv(): void; onQuizPhone(): void; onAgain(): void; onNext(): void
}
/** End of a clip: "7 neue Wörter", saved chips, then Quiz on TV (focused) · Quiz on your phone · Watch again · Next clip. */
export function Summary({ clip, saved, lang, phoneName, phoneQuiz, lastTvQuiz, onQuizTv, onQuizPhone, onAgain, onNext }: SummaryProps) {
  const quizTv = clip.quiz.length > 0
  const quizPhone = phoneName !== null && saved.length > 0
  const accuracy = phoneQuiz.status === 'done' ? strings.summary.phoneResult(phoneQuiz.correct, phoneQuiz.total)
    : phoneQuiz.status === 'sent' && phoneName ? strings.summary.phoneSent(phoneName)
    : lastTvQuiz ? strings.summary.lastQuiz(lastTvQuiz.correct, lastTvQuiz.total) : null
  return (
    <Screen>
      <View style={{ flex: 1, gap: px(28), justifyContent: 'center', maxWidth: px(1400) }}>
        {saved.length ? <T variant="display">{strings.summary.newWords(saved.length, lang)}</T> : <T variant="title">{strings.summary.none}</T>}
        {saved.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: px(12) }} accessibilityElementsHidden={false}>
            {saved.map((h) => (
              <View key={h.id} testID="saved-chip" style={{ flexDirection: 'row', alignItems: 'center', gap: px(6), backgroundColor: tokens.color.marker, paddingHorizontal: px(14), paddingVertical: px(6), borderRadius: 4 }}>
                <Check size={px(24)} color={tokens.color.ground} />
                <T variant="body" color={tokens.color.ground}>{h.word}</T>
              </View>
            ))}
          </View>
        ) : null}
        <T variant="body" color={tokens.color.textSecondary} accessibilityLiveRegion="polite">{accuracy ?? ''}</T>
        <View style={{ flexDirection: 'row', gap: px(16) }}>
          {quizTv ? <Button primary preferred label={strings.summary.quizTv} text={strings.summary.quizTv} onPress={onQuizTv} /> : null}
          {quizPhone ? <Button label={strings.summary.quizPhone} text={strings.summary.quizPhone} onPress={onQuizPhone} /> : null}
          <Button primary={!quizTv} preferred={!quizTv} label={strings.summary.again} text={strings.summary.again} onPress={onAgain} />
          <Button label={strings.summary.next} text={strings.summary.next} onPress={onNext} />
        </View>
      </View>
    </Screen>
  )
}
