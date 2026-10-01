import React from 'react'
import { Text } from 'react-native'
import { strings } from '../strings'
import type { Hint as HintKey } from '../state/app'
import { color, type } from '../theme'
/** A polite alert in text colour (never marker, never colour alone: the words carry it). */
export function Hint({ hint, text }: { hint?: HintKey | null; text?: string | null }) {
  const t = text ?? (hint ? strings.hint[hint] : null)
  if (!t) return null
  return <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[type.body, { color: color.text }]}>{t}</Text>
}
