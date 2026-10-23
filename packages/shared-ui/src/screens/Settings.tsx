import React, { useRef } from 'react'
import { ScrollView, View } from 'react-native'
import type { RemoteEvent } from '@moizp/vega-media-kit'
import type { LearnerDto } from '@lingo/contracts'
import { Focusable, Screen, T } from '../components'
import { announce } from '../a11y'
import { pickPreferred, type FocusMemoryProps } from '../nav/focusMemory'
import type { RemoteSource } from '../remote/types'
import { useRemoteKeys } from '../remote/useRemoteKeys'
import { strings } from '../strings'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'
import { focusBleed } from '../theme/bleed'
import { cycleSetting, selectSetting, settingsRows, type SettingsAction, type SettingsKey } from './settings/model'

const L = tokens.layout

export interface SettingsProps extends FocusMemoryProps {
  learner: LearnerDto; phoneName: string | null; remote: RemoteSource; status: string | null
  /** Root applies it (PUT /me, PUT /me/level, navigation) */ onAction(a: SettingsAction): void
}

/** One column of rows; ◄► change the focused row's value (RemoteSource, decision §0.3) and the new value is announced; Select opens links. */
export function Settings({ learner, phoneName, remote, status, onAction, initialFocus, onFocusId }: SettingsProps) {
  const rows = settingsRows(learner, phoneName)
  const [preferred] = React.useState(() => pickPreferred(initialFocus, rows.map((r) => `row:${r.key}`), 'row:learning'))
  const focused = useRef<SettingsKey>((preferred?.slice(4) as SettingsKey | undefined) ?? 'learning')
  const live = useRef({ learner, onAction }); live.current = { learner, onAction }
  const act = (a: SettingsAction | null) => {
    if (!a) return
    live.current.onAction(a)
    if (a.kind !== 'open') announce(a.announce)
  }
  useRemoteKeys(remote, (e: RemoteEvent) => {
    if (e.longPress || (e.key !== 'left' && e.key !== 'right')) return
    act(cycleSetting(focused.current, e.key === 'right' ? 1 : -1, live.current.learner))
  }, true)

  // The list reaches left by a focused row's bleed and pads it back; the first and last rows scroll fully into view with their padding,
  // so their focus is never cut at the ScrollView's edge (device test 2026-10-23, shot 70).
  const scroll = useRef<ScrollView | null>(null)
  const bleedX = focusBleed(L.rowW), bleedY = Math.max(px(8), focusBleed(L.rowH))
  return (
    <Screen>
      <T variant="display" style={{ marginBottom: px(24) }}>{strings.settings.title}</T>
      <ScrollView ref={scroll} testID="settings-scroll" showsVerticalScrollIndicator={false} style={{ marginLeft: -bleedX }} contentContainerStyle={{ gap: px(L.rowGap), paddingVertical: bleedY, paddingLeft: bleedX, paddingRight: bleedX }}>
        {rows.map((r, i) => {
          const id = `row:${r.key}`
          // A link row's value is worth showing only when it says something ("Not paired", "On"); About's value is just "Open".
          const linkValue = r.kind === 'link' && r.value !== strings.settings.open ? r.value : null
          return (
            <Focusable
              key={r.key} label={r.label} hasTVPreferredFocus={preferred === id}
              onFocus={() => {
                focused.current = r.key; onFocusId(id)
                if (i === 0) scroll.current?.scrollTo?.({ y: 0, animated: true })
                else if (i === rows.length - 1) scroll.current?.scrollToEnd?.({ animated: true })
              }}
              onPress={() => act(selectSetting(r.key, live.current.learner))}
              style={{ width: px(L.rowW), minHeight: px(L.rowH), flexDirection: 'row', alignItems: 'center', gap: px(L.gutter), paddingHorizontal: px(L.rowPadX), paddingVertical: px(L.rowPadY), borderRadius: px(tokens.radius.md), backgroundColor: tokens.color.surface1 }}
            >
              <T variant="body" style={{ flex: 1 }} numberOfLines={1}>{r.name}</T>
              {/* QA #1: every value sits right-aligned in one column of the same width, so values line up down the list. */}
              <View testID={`value-${r.key}`} style={{ width: px(L.rowValueW), flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: px(16) }}>
                {r.kind === 'cycle'
                  ? r.single
                    ? <T variant="body" color={tokens.color.textSecondary} numberOfLines={1} style={{ flexShrink: 1 }}>{r.value}</T>
                    : <T variant="body" color={tokens.color.interactive} numberOfLines={1} style={{ flexShrink: 1 }}>{strings.settings.cycleValue(r.value)}</T>
                  : <>
                      {/* Review M1: a long value ("Connected: <phone name>") shrinks and ends in an ellipsis inside its column; the chevron keeps its width. */}
                      {linkValue ? <T variant="body" color={tokens.color.textSecondary} numberOfLines={1} style={{ flexShrink: 1 }}>{linkValue}</T> : null}
                      <T testID="chevron" variant="body" color={tokens.color.textSecondary} style={{ flexShrink: 0 }}>{strings.keys.right}</T>
                    </>}
              </View>
            </Focusable>
          )
        })}
      </ScrollView>
      <T variant="label" color={tokens.color.textSecondary} accessibilityLiveRegion="polite" aria-label={status ?? strings.settings.hintLabel} style={{ marginTop: px(16) }}>{status ?? strings.settings.hint}</T>
    </Screen>
  )
}
