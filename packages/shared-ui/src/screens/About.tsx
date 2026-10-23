import React from 'react'
import { ScrollView, View } from 'react-native'
import type { ClipCredit } from '@lingo/contracts'
import { Button, Screen, T } from '../components'
import { strings } from '../strings'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'

export interface AboutProps {
  /** every published clip's credit (GET /clips/attributions); null while it loads */ credits: ClipCredit[] | null
  /** the credits could not load (and nothing is cached) */ failed?: boolean
  onBack(): void
}
/** About & attributions: machine/AI notice, fonts, frequency list, and every published clip's attribution — all languages and levels
 *  (device test 2026-10-23: it listed only the current Home rows, and nothing right after a Settings change). Back is the only focusable. */
export function About({ credits, failed, onBack }: AboutProps) {
  const credited = (credits ?? []).filter((c) => c.attribution.trim())
  const status = credits === null ? (failed ? strings.about.clipsOffline : strings.about.clipsLoading) : null
  return (
    <Screen>
      <T variant="display" style={{ marginBottom: px(16) }}>{strings.about.title}</T>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: px(16), paddingBottom: px(24) }}>
        <T variant="body">{strings.about.machine}</T>
        <T variant="body" color={tokens.color.textSecondary}>{strings.about.fonts}</T>
        <T variant="body" color={tokens.color.textSecondary}>{strings.about.freq}</T>
        {status || credited.length ? (
          <View style={{ gap: px(8), marginTop: px(16) }}>
            <T variant="title">{strings.about.clips}</T>
            {status ? <T variant="label" color={tokens.color.textSecondary} accessibilityLiveRegion="polite">{status}</T> : null}
            {credited.map((c) => <T key={c.slug} variant="label" color={tokens.color.textSecondary}>{`${c.title} — ${c.attribution}`}</T>)}
          </View>
        ) : null}
      </ScrollView>
      <Button primary preferred label={strings.about.backLabel} text={strings.common.back} onPress={onBack} />
    </Screen>
  )
}
