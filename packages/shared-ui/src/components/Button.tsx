import React from 'react'
import { View } from 'react-native'
import { Focusable } from './Focusable'
import { T } from './Text'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'

export interface ButtonProps {
  /** aria-label of purpose */ label: string; text: string; onPress(): void; primary?: boolean; preferred?: boolean; disabled?: boolean
  id?: string; onFocusId?(id: string): void; focusRef?: React.Ref<View>
  nextFocusUp?: number; nextFocusDown?: number; nextFocusLeft?: number; nextFocusRight?: number; testID?: string
  /** e.g. a Check before the text */ children?: React.ReactNode
}
/** The one action button: primary = interactive fill + ground text; secondary = surface2 + text. Focus is the Focusable's outline + scale. */
export function Button({ label, text, onPress, primary, preferred, disabled, id, onFocusId, focusRef, nextFocusUp, nextFocusDown, nextFocusLeft, nextFocusRight, testID, children }: ButtonProps) {
  const fg = primary ? tokens.color.ground : tokens.color.text
  return (
    <Focusable
      label={label} onPress={onPress} hasTVPreferredFocus={preferred} disabled={disabled} testID={testID} focusRef={focusRef}
      onFocus={id && onFocusId ? () => onFocusId(id) : undefined}
      nextFocusUp={nextFocusUp} nextFocusDown={nextFocusDown} nextFocusLeft={nextFocusLeft} nextFocusRight={nextFocusRight}
      style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: px(12), backgroundColor: primary ? tokens.color.interactive : tokens.color.surface2, paddingHorizontal: px(28), paddingVertical: px(16) }}
    >
      {children}
      <T variant="body" color={fg}>{text}</T>
    </Focusable>
  )
}
