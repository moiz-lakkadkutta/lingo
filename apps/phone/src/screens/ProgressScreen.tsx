import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import type { ProgressStats } from '@lingo/contracts'
import { BandBar } from '../components/BandBar'
import { Button } from '../components/Button'
import { Hint } from '../components/Hint'
import { Page } from '../components/Page'
import type { PhoneApi } from '../lib/api'
import { bandRows, nextReview, streakView } from '../lib/progress'
import { strings } from '../strings'
import { color, space, type } from '../theme'

/** Streak (Manrope display number only here; a missed day says "Welcome back"), words known per approximate level, clips, next review. No icons, no fire, no confetti. */
export function ProgressScreen({ api, onReview }: { api: PhoneApi; onReview(): void }) {
  const [stats, setStats] = useState<ProgressStats | null>(null)
  const [error, setError] = useState(false)
  const fetchStats = useCallback(() => { setError(false); api.stats().then(setStats, () => setError(true)) }, [api])
  useEffect(() => { fetchStats() }, [fetchStats])

  if (error) return (
    <Page bottom={false}>
      <Hint text={strings.progress.loadError} />
      <Button label={strings.quiz.tryAgain} onPress={fetchStats} />
    </Page>
  )
  if (!stats) return <Page bottom={false}><ActivityIndicator color={color.interactive} /></Page>
  const streak = streakView(stats.streak)
  const next = nextReview(stats)
  return (
    <Page bottom={false}>
      <Text accessibilityRole="header" style={[streak.kind === 'day' ? type.display : streak.kind === 'welcome' ? type.title : type.body, { color: color.text }]}>{streak.text}</Text>
      <Text accessibilityRole="header" style={[type.title, { color: color.text }]}>{strings.progress.bandsTitle}</Text>
      <View style={{ gap: space.m }}>
        {bandRows(stats.bands).map((r) => <BandBar key={r.level} row={r} />)}
      </View>
      <Text style={[type.body, { color: color.text }]}>{strings.progress.clips(stats.clipsWatched)}</Text>
      <Text style={[type.body, { color: color.text }]}>{next.text}</Text>
      {next.canReview ? <Button label={strings.progress.reviewNow} variant="primary" onPress={onReview} /> : null}
    </Page>
  )
}
