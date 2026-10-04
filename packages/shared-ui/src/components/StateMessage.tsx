import React, { useEffect } from 'react'
import { View } from 'react-native'
import { announce } from '../a11y'
import { Button } from './Button'
import { T } from './Text'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'

export interface StateAction { label: string; text: string; onPress(): void; primary?: boolean }
/** Empty / error / offline / preparing: centred title (live region) + body + 1–3 actions; the first action takes focus. */
export function StateMessage({ title, body, actions, announceOnMount, testID }: { title: string; body?: string; actions: StateAction[]; announceOnMount?: boolean; testID?: string }) {
  useEffect(() => { if (announceOnMount) announce(`${title} ${body ?? ''}`) }, []) // once per mount on purpose
  return (
    <View testID={testID} style={{ flex: 1, justifyContent: 'center', alignItems: 'flex-start', gap: px(24), maxWidth: px(1200) }}>
      <T variant="title" accessibilityLiveRegion="polite">{title}</T>
      {body ? <T variant="body" color={tokens.color.textSecondary}>{body}</T> : null}
      {actions.length ? (
        <View style={{ flexDirection: 'row', gap: px(16), marginTop: px(8) }}>
          {actions.map((a, i) => <Button key={a.label} label={a.label} text={a.text} onPress={a.onPress} primary={a.primary ?? i === 0} preferred={i === 0} />)}
        </View>
      ) : null}
    </View>
  )
}
