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
import { cycleSetting, selectSetting, settingsRows, type SettingsAction, type SettingsKey } from './settings/model'

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

  return (
    <Screen>
      <T variant="display" style={{ marginBottom: px(24) }}>{strings.settings.title}</T>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: px(8), paddingVertical: px(8) }}>
        {rows.map((r) => {
          const id = `row:${r.key}`
          return (
            <Focusable
              key={r.key} label={r.label} hasTVPreferredFocus={preferred === id}
              onFocus={() => { focused.current = r.key; onFocusId(id) }}
              onPress={() => act(selectSetting(r.key, live.current.learner))}
              style={{ width: px(1100), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: px(28), paddingVertical: px(14), backgroundColor: tokens.color.surface1 }}
            >
              <T variant="body">{r.name}</T>
              <View style={{ flexDirection: 'row', gap: px(16) }}>
                {r.kind === 'cycle'
                  ? <T variant="body" color={tokens.color.interactive}>{r.value}</T>
                  : <>{r.value !== strings.settings.open ? <T variant="body" color={tokens.color.textSecondary}>{r.value}</T> : null}<T variant="body" color={tokens.color.textSecondary}>{strings.settings.open}</T></>}
              </View>
            </Focusable>
          )
        })}
      </ScrollView>
      <T variant="label" color={tokens.color.textSecondary} accessibilityLiveRegion="polite" style={{ marginTop: px(16) }}>{status ?? strings.settings.hint}</T>
    </Screen>
  )
}
