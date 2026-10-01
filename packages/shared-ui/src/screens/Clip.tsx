import React, { useEffect, useRef, useState } from 'react'
import { Image, View } from 'react-native'
import type { ClipResponse, LearnerDto } from '@lingo/contracts'
import { Button, LevelChip, Screen, SkeletonBlock, StateMessage, T } from '../components'
import { formatClock, formatMinutes } from '../app/selectors'
import type { Resource } from '../data/resource'
import { pickPreferred, type FocusMemoryProps } from '../nav/focusMemory'
import { strings } from '../strings'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'

export interface ClipProps extends FocusMemoryProps {
  clip: Resource<ClipResponse>; learner: LearnerDto; inContinue: boolean; onReload(): void
  onWatch(challenge: boolean): void; onPlus(): void; onAddToContinue(): Promise<boolean>; onBack(): void
}
const POSTER = { w: 768, h: 432 }
const MEET_MAX = 8
export const PREPARING_POLL_MS = 30_000

/** Re-fetches every 30 s while the clip is still being prepared; stops on unmount. */
function usePoll(active: boolean, fn: () => void, ms: number) {
  const ref = useRef(fn); ref.current = fn
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => ref.current(), ms)
    return () => clearInterval(t)
  }, [active, ms])
}

/** Clip page: poster, title, level, duration, words you'll meet (≤ 8 marker chips), attribution; Watch · Challenge · Add to Continue. */
export function Clip({ clip, learner, inContinue, onReload, onWatch, onPlus, onAddToContinue, onBack, initialFocus, onFocusId }: ClipProps) {
  const data = clip.data
  const preparing = data?.status === 'preparing'
  usePoll(preparing, onReload, PREPARING_POLL_MS)
  const [added, setAdded] = useState<'no' | 'yes' | 'error'>('no')
  const pref = useRef<string | null | undefined>(undefined)

  const back = { label: strings.common.back, text: strings.common.back, onPress: onBack }
  if (!data) {
    if (clip.state === 'error') {
      if (clip.error === 'notFound') return <Screen><StateMessage title={strings.clip.notFound} actions={[back]} /></Screen>
      const offline = clip.error === 'offline'
      return <Screen><StateMessage title={offline ? strings.offline : strings.common.error} announceOnMount={offline} actions={[{ label: strings.common.retry, text: strings.common.retry, onPress: onReload }, back]} /></Screen>
    }
    return (
      <Screen>
        <View style={{ flexDirection: 'row', gap: px(48), alignItems: 'flex-start' }}>
          <SkeletonBlock w={POSTER.w} h={POSTER.h} />
          <View style={{ gap: px(20) }}>
            <SkeletonBlock w={640} h={64} radius={3} />
            <SkeletonBlock w={240} h={28} radius={3} />
            <SkeletonBlock w={560} h={28} radius={3} />
          </View>
        </View>
      </Screen>
    )
  }
  if (data.status === 'preparing') {
    return <Screen><StateMessage title={strings.clip.preparing(data.etaMin)} body={strings.clip.preparingBody} actions={[back]} /></Screen>
  }

  const showAdd = !inContinue && data.resumeS === null
  const ids = ['watch', 'challenge', ...(showAdd ? ['continue'] : [])]
  if (pref.current === undefined) pref.current = pickPreferred(initialFocus, ids, 'watch')
  const preferred = pref.current
  const at = data.resumeS !== null ? formatClock(data.resumeS) : null
  const words = data.wordsYoullMeet.slice(0, MEET_MAX)
  const status = added === 'yes' ? strings.clip.added : added === 'error' ? strings.common.saveError : null
  const addToContinue = async () => {
    if (added === 'yes') return
    setAdded((await onAddToContinue()) ? 'yes' : 'error')
  }

  return (
    <Screen>
      <View style={{ flex: 1, flexDirection: 'row', gap: px(48), alignItems: 'flex-start' }}>
        <View style={{ width: px(POSTER.w), height: px(POSTER.h), borderRadius: 6, overflow: 'hidden', backgroundColor: tokens.color.surface2 }}>
          {data.posterUrl ? <Image source={{ uri: data.posterUrl }} style={{ width: '100%', height: '100%' }} accessibilityIgnoresInvertColors /> : null}
        </View>
        <View style={{ flex: 1, gap: px(20) }}>
          <T variant="display" numberOfLines={2}>{data.title}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: px(12) }}>
            <LevelChip level={data.level} />
            <T variant="label" color={tokens.color.textSecondary}>{`${strings.level.about(data.level)} · ${formatMinutes(data.durationS)}`}</T>
          </View>
          <T variant="label" color={tokens.color.textSecondary} style={{ marginTop: px(12) }}>{strings.clip.wordsYoullMeet.toUpperCase()}</T>
          {words.length ? (
            <View testID="meet-row" aria-label={strings.clip.meetLabel(words.map((h) => h.word).join(', '))} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: px(12) }}>
              {words.map((h) => (
                <View key={h.id} testID="meet-chip" style={{ backgroundColor: tokens.color.marker, paddingHorizontal: px(14), paddingVertical: px(6), borderRadius: 4 }}>
                  {/* TODO(LING-005 follow-up): Polly pronunciation on chips ("tap to hear", plan §8) is deferred — display-only until then. */}
                  <T variant="body" color={tokens.color.ground}>{h.word}</T>
                </View>
              ))}
            </View>
          ) : <T variant="body" color={tokens.color.textSecondary}>{strings.clip.noWords}</T>}
          <View style={{ flexDirection: 'row', gap: px(16), marginTop: px(16) }}>
            <Button primary label={at ? strings.home.resumeLabel(data.title, at) : strings.home.watchLabel(data.title)} text={at ? strings.home.resume(at) : strings.clip.watch}
              onPress={() => onWatch(false)} preferred={preferred === 'watch'} id="watch" onFocusId={onFocusId} />
            {learner.plus
              ? <Button label={strings.clip.challengeLabel} text={strings.clip.challenge} onPress={() => onWatch(true)} preferred={preferred === 'challenge'} id="challenge" onFocusId={onFocusId} />
              : <Button label={strings.clip.challengePlusLabel} text={strings.clip.challengePlus} onPress={onPlus} preferred={preferred === 'challenge'} id="challenge" onFocusId={onFocusId} />}
            {showAdd ? (
              <Button key="continue" label={added === 'yes' ? strings.clip.inContinue : strings.clip.addContinue} text={added === 'yes' ? strings.clip.inContinue : strings.clip.addContinue}
                disabled={added === 'yes'} onPress={() => { void addToContinue() }} preferred={preferred === 'continue'} id="continue" onFocusId={onFocusId} />
            ) : null}
          </View>
          <T variant="label" color={tokens.color.textSecondary} accessibilityLiveRegion="polite">{status ?? ''}</T>
        </View>
      </View>
      <T variant="label" color={tokens.color.textSecondary} numberOfLines={2}>{data.attribution}</T>
    </Screen>
  )
}
