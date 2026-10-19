import React, { useEffect, useRef, useState } from 'react'
import { BackHandler, ScrollView, View } from 'react-native'
import type { RemoteEvent } from '@moizp/vega-media-kit'
import type { LibraryWord } from '@lingo/contracts'
import { Focusable, MiniPlayer, Screen, SkeletonBlock, StateMessage, T } from '../components'
import { Check } from '../components/Check'
import { announce } from '../a11y'
import { dueLabel, filterWords } from '../app/selectors'
import type { Resource } from '../data/resource'
import { pickPreferred, type FocusMemoryProps } from '../nav/focusMemory'
import type { WordsFilter } from '../nav/stack'
import type { RemoteSource } from '../remote/types'
import { useRemoteKeys } from '../remote/useRemoteKeys'
import { strings } from '../strings'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'
import { oneLine, wordsLayout } from './words/layout'

export interface WordsProps extends FocusMemoryProps {
  words: Resource<LibraryWord[]>; filter: WordsFilter; onFilter(f: WordsFilter): void; remote: RemoteSource
  now?: Date; onReload(): void; onFindClip(): void
}
const FILTERS: WordsFilter[] = ['all', 'due', 'learned']
const filterName = (f: WordsFilter) => strings.words.filters[FILTERS.indexOf(f)]!
const EMPTY: Record<WordsFilter, string> = { all: strings.words.empty, due: strings.words.emptyDue, learned: strings.words.emptyLearned }

/** Saved words sorted by due; ◄► switch All / Due today / Learned (RemoteSource, decision §0.3); Select plays the line in a mini player. */
export function Words({ words, filter, onFilter, remote, now: nowProp, onReload, onFindClip, initialFocus, onFocusId }: WordsProps) {
  const now = nowProp ?? new Date()
  const all = words.data
  const list = all ? filterWords(all, filter, now) : []
  const [playing, setPlaying] = useState<{ word: LibraryWord; key: number } | null>(null)
  const [noLine, setNoLine] = useState(false)
  // Preferred row per filter (review-005 M4): the last focused row if it is still listed, else the first. The list is keyed by filter, so
  // the rows remount and the one preferred row takes focus on Fire OS and on Vega (which applies hasTVPreferredFocus on mount only).
  const lastFocused = useRef<string | undefined>(initialFocus)
  const pref = useRef<{ filter: WordsFilter; id: string | null } | null>(null)

  const live = useRef({ filter, all, now, onFilter }); live.current = { filter, all, now, onFilter }
  useRemoteKeys(remote, (e: RemoteEvent) => {
    if (e.longPress || (e.key !== 'left' && e.key !== 'right')) return
    const { filter: f, all: ws, now: n, onFilter: set } = live.current
    const i = FILTERS.indexOf(f) + (e.key === 'right' ? 1 : -1)
    if (i < 0 || i >= FILTERS.length) return
    const next = FILTERS[i]!
    set(next)
    announce(strings.words.filterLabel(filterName(next), ws ? filterWords(ws, next, n).length : 0))
  }, true)

  // Back closes the mini player first; added while open, so it runs before Root's listener.
  const open = playing !== null
  const shown = playing && playing.word.clip.manifestUrl ? playing.word : null
  const layout = wordsLayout(shown !== null)
  useEffect(() => {
    if (!open) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setPlaying(null); return true })
    return () => sub.remove()
  }, [open])

  const header = (
    <View style={{ gap: px(12), marginBottom: px(24) }}>
      <T variant="display">{strings.words.title}</T>
      <View style={{ flexDirection: 'row', gap: px(16) }}>
        {FILTERS.map((f) => {
          const cur = f === filter
          return (
            <View key={f} testID={`pill-${f}`} style={{ flexDirection: 'row', alignItems: 'center', gap: px(8), paddingHorizontal: px(20), paddingVertical: px(8), borderRadius: 999, borderWidth: px(3), borderColor: cur ? tokens.color.interactive : 'transparent', backgroundColor: tokens.color.surface1 }}>
              {cur ? <Check size={px(24)} color={tokens.color.interactive} /> : null}
              <T variant="label" color={cur ? tokens.color.interactive : tokens.color.textSecondary}>{filterName(f)}</T>
            </View>
          )
        })}
      </View>
      <T variant="label" color={tokens.color.textSecondary} aria-label={strings.words.hintLabel}>{strings.words.hint}</T>
    </View>
  )

  let body: React.ReactNode
  if (!all && words.state === 'error') {
    const offline = words.error === 'offline'
    body = <StateMessage title={offline ? strings.offline : strings.common.error} announceOnMount={offline} actions={[{ label: strings.words.retryLabel, text: strings.common.retry, onPress: onReload }]} />
  } else if (!all) {
    body = <View style={{ gap: px(16) }}>{Array.from({ length: 5 }, (_, i) => <SkeletonBlock key={i} w={layout.listW} h={96} />)}</View>
  } else if (!list.length) {
    body = <StateMessage title={EMPTY[filter]} actions={[{ label: strings.words.findClip, text: strings.words.findClip, onPress: onFindClip }]} />
  } else {
    const ids = list.map((x) => `word:${x.savedWordId}`)
    if (pref.current?.filter !== filter) pref.current = { filter, id: pickPreferred(lastFocused.current, ids, ids[0]!) }
    const preferredId = pref.current.id
    body = (
      <ScrollView key={filter} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: px(12), paddingVertical: px(8) }}>
        {list.map((x) => {
          const id = `word:${x.savedWordId}`
          const due = dueLabel(x.due, now)
          return (
            <Focusable
              key={x.savedWordId} label={strings.words.rowLabel(x.lemma, x.gloss, due, x.clip.title, x.clip.manifestUrl !== null)} hasTVPreferredFocus={preferredId === id}
              onFocus={() => { lastFocused.current = id; onFocusId(id) }}
              onPress={() => {
                if (!x.clip.manifestUrl) { setPlaying(null); setNoLine(true); return }
                setNoLine(false)
                setPlaying((p) => ({ word: x, key: (p?.key ?? 0) + 1 }))
              }}
              style={{ width: px(layout.listW), minHeight: px(tokens.layout.rowH), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: px(tokens.layout.gutter), paddingHorizontal: px(tokens.layout.rowPadX), paddingVertical: px(tokens.layout.rowPadY), borderRadius: px(tokens.radius.md), backgroundColor: tokens.color.surface1 }}
            >
              <View style={{ flex: 1 }}>
                <T variant="title">{x.lemma}</T>
                <T variant="body" color={tokens.color.textSecondary} numberOfLines={1}>{x.gloss}</T>
              </View>
              <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
                <T variant="label">{due}</T>
                <T variant="label" color={tokens.color.textSecondary} numberOfLines={1}>{x.clip.title}</T>
              </View>
            </Focusable>
          )
        })}
      </ScrollView>
    )
  }

  return (
    <Screen>
      {header}
      {/* QA #17: list and player side by side inside the safe area; the rows narrow while the player is open (words/layout.ts). */}
      {/* The list column takes the width the panel leaves, so a focused row's 1.04 growth is not clipped by the ScrollView on the right. */}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start' }}>
        <View testID="words-list" style={{ flex: 1, alignSelf: 'stretch' }}>{body}</View>
        {shown?.clip.manifestUrl ? (
          <View testID="words-player" style={{ width: px(layout.panelW), padding: px(tokens.layout.panelPad), gap: px(12), borderRadius: px(tokens.radius.lg), backgroundColor: tokens.color.surface1 }}>
            <T variant="title" numberOfLines={1}>{shown.lemma}</T>
            <T variant="body" color={tokens.color.textSecondary} numberOfLines={1}>{shown.gloss}</T>
            <MiniPlayer manifestUrl={shown.clip.manifestUrl} startS={shown.cue.startS} endS={shown.cue.endS} playKey={playing!.key} caption={oneLine(shown.cue.text)} />
            <T variant="label" color={tokens.color.textSecondary} aria-label={strings.words.playerHintLabel}>{strings.words.playerHint}</T>
          </View>
        ) : null}
      </View>
      <T variant="label" color={tokens.color.textSecondary} accessibilityLiveRegion="polite">{noLine ? strings.words.noLine : ''}</T>
    </Screen>
  )
}
