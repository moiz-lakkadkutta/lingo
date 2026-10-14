import React from 'react'
import { View } from 'react-native'
import { Focusable } from './Focusable'
import { T } from './Text'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'
import type { FocusTarget } from '../tvFocus'

export interface ButtonProps {
  /** aria-label of purpose */ label: string; text: string; onPress(): void; primary?: boolean; preferred?: boolean; disabled?: boolean
  id?: string; onFocusId?(id: string): void; focusRef?: React.Ref<View>
  nextFocusUp?: FocusTarget; nextFocusDown?: FocusTarget; nextFocusLeft?: FocusTarget; nextFocusRight?: FocusTarget; testID?: string
  /** e.g. a Check before the text; a function gets the text colour for the current focus state */
  children?: React.ReactNode | ((fg: string) => React.ReactNode)
}
/**
 * The one action button. Fill and text per state come from tokens.button (primary: interactive fill + ground text, focused: focus fill +
 * ground text; secondary: surface2 + text). Focus is the Focusable's outline + scale.
 */
export function Button({ label, text, onPress, primary, preferred, disabled, id, onFocusId, focusRef, nextFocusUp, nextFocusDown, nextFocusLeft, nextFocusRight, testID, children }: ButtonProps) {
  const variant = primary ? 'primary' : 'secondary'
  return (
    <Focusable
      label={label} onPress={onPress} hasTVPreferredFocus={preferred} disabled={disabled} testID={testID} focusRef={focusRef} variant={variant}
      onFocus={id && onFocusId ? () => onFocusId(id) : undefined}
      nextFocusUp={nextFocusUp} nextFocusDown={nextFocusDown} nextFocusLeft={nextFocusLeft} nextFocusRight={nextFocusRight}
      style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: px(12), paddingHorizontal: px(28), paddingVertical: px(16) }}
    >
      {({ focused }) => {
        const fg = tokens.button[variant][focused ? 'focused' : 'rest'].text
        return (
          <>
            {typeof children === 'function' ? children(fg) : children}
            <T variant="body" color={fg}>{text}</T>
          </>
        )
      }}
    </Focusable>
  )
}
