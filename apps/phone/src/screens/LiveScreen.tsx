import React, { useEffect } from 'react'
import { AccessibilityInfo, ScrollView, Text, View } from 'react-native'
import type { Lang, WordSavedPayload } from '@lingo/contracts'
import { Button } from '../components/Button'
import { Page } from '../components/Page'
import { WordChip } from '../components/WordChip'
import { speakWord } from '../lib/speech'
import type { LinkState } from '../state/app'
import { strings } from '../strings'
import { color, space, type } from '../theme'

export interface LiveScreenProps {
  link: LinkState; saved: WordSavedPayload[]; open: string | null; learning: Lang; quizOffer: boolean
  onToggle(id: string): void; onQuiz(): void; onForget(): void
}
/** While the TV plays: the clip title and a marker chip per saved word, in arrival order. "Quiz me now" appears on quiz:start (announced, never auto-opened). */
export function LiveScreen({ link, saved, open, learning, quizOffer, onToggle, onQuiz, onForget }: LiveScreenProps) {
  useEffect(() => { if (quizOffer) AccessibilityInfo.announceForAccessibility(strings.live.quizReady) }, [quizOffer])
  return (
    <Page bottom={false}>
      <Text accessibilityLiveRegion="polite" style={[type.label, { color: color.textSecondary }]}>{strings.live.status[link]}</Text>
      <Text accessibilityRole="header" style={[type.title, { color: color.text }]}>{saved.at(-1)?.clipTitle ?? strings.live.noClip}</Text>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
        {saved.length === 0 ? <Text style={[type.body, { color: color.textSecondary }]}>{strings.live.empty}</Text> : null}
        {saved.map((w) => (
          <WordChip
            key={w.savedWordId}
            w={w}
            open={open === w.savedWordId}
            onToggle={() => { if (open !== w.savedWordId) speakWord(w.word, learning); onToggle(w.savedWordId) }}
            onHear={() => speakWord(w.word, learning)}
          />
        ))}
      </ScrollView>
      <View style={{ gap: space.s }}>
        {quizOffer ? <Button label={strings.live.quizNow} variant="primary" onPress={onQuiz} /> : null}
        <Button label={strings.live.forget} onPress={onForget} />
      </View>
    </Page>
  )
}
