import React from 'react'
import { ScrollView, View } from 'react-native'
import type { ClipCard } from '@lingo/contracts'
import { Button, Screen, T } from '../components'
import { strings } from '../strings'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'

export interface AboutProps { /** from the cached catalog; may be empty */ clips: ClipCard[]; onBack(): void }
/** About & attributions: machine/AI notice, fonts, frequency list, and every clip's attribution. Back is the only focusable. */
export function About({ clips, onBack }: AboutProps) {
  const credited = clips.filter((c) => c.attribution)
  return (
    <Screen>
      <T variant="display" style={{ marginBottom: px(16) }}>{strings.about.title}</T>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: px(16), paddingBottom: px(24) }}>
        <T variant="body">{strings.about.machine}</T>
        <T variant="body" color={tokens.color.textSecondary}>{strings.about.fonts}</T>
        <T variant="body" color={tokens.color.textSecondary}>{strings.about.freq}</T>
        {credited.length ? (
          <View style={{ gap: px(8), marginTop: px(16) }}>
            <T variant="title">{strings.about.clips}</T>
            {credited.map((c) => <T key={c.slug} variant="label" color={tokens.color.textSecondary}>{`${c.title} — ${c.attribution}`}</T>)}
          </View>
        ) : null}
      </ScrollView>
      <Button primary preferred label={strings.common.back} text={strings.common.back} onPress={onBack} />
    </Screen>
  )
}
