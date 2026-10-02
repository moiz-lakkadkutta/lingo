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
      <T variant="label" color={tokens.color.textSecondary}>{strings.words.hint}</T>
    </View>
  )

  let body: React.ReactNode
  if (!all && words.state === 'error') {
    const offline = words.error === 'offline'
    body = <StateMessage title={offline ? strings.offline : strings.common.error} announceOnMount={offline} actions={[{ label: strings.common.retry, text: strings.common.retry, onPress: onReload }]} />
  } else if (!all) {
    body = <View style={{ gap: px(16) }}>{Array.from({ length: 5 }, (_, i) => <SkeletonBlock key={i} w={1100} h={96} />)}</View>
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
              style={{ width: px(1100), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: px(28), paddingVertical: px(16), backgroundColor: tokens.color.surface1 }}
            >
              <View style={{ flex: 1 }}>
                <T variant="title">{x.lemma}</T>
                <T variant="body" color={tokens.color.textSecondary} numberOfLines={1}>{x.gloss}</T>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
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
      <View style={{ flex: 1 }}>{body}</View>
      <T variant="label" color={tokens.color.textSecondary} accessibilityLiveRegion="polite">{noLine ? strings.words.noLine : ''}</T>
      {playing && playing.word.clip.manifestUrl ? (
        <View style={{ position: 'absolute', left: px(1180), top: px(tokens.layout.safeY + 200) }}>
          <MiniPlayer manifestUrl={playing.word.clip.manifestUrl} startS={playing.word.cue.startS} endS={playing.word.cue.endS} playKey={playing.key} caption={playing.word.cue.text.replace('\n', ' ')} />
        </View>
      ) : null}
    </Screen>
  )
}
