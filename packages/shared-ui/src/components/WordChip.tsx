import React, { useCallback, useRef } from 'react'
import { Animated, Pressable, Text, View } from 'react-native'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'
import { tvFocusProps, useSelfHandle, type FocusTarget } from '../tvFocus'
import { Check } from './Check'

export interface WordChipProps {
  text: string; highlighted: boolean; focusable: boolean; saved?: boolean
  /** aria-label, e.g. strings.explain.wordLabel(word) */
  label: string
  onFocus?(): void; onPress?(): void
  /** node handle of the card's Save word (▼); 'self' stays */
  nextFocusDown?: FocusTarget
  /** 'self' pins ▲ so Android's spatial search cannot leave the chips upwards (decision 0006, S1) */
  nextFocusUp?: FocusTarget
  /** px at 1080p before scale (44 for cue, 32 in the card); already multiplied by the learner's subtitle size */
  size: number
  /** the learner's subtitle size; scales the marker padding with the text */
  userScale?: number
  chipRef?: React.Ref<View>
}

/**
 * One word of the target cue (decision 0006 B). Highlighted: marker background, dark text, and a reserved check slot so the
 * line does not reflow when the word is saved. Focus on a word is an outline only (wordWidth at wordOffset, opacity in focusMs),
 * never a scale. Non-focusable chips also take pointerEvents="none" because Vega ignores `focusable` on Pressable.
 */
export function WordChip({ text, highlighted, focusable, saved, label, onFocus, onPress, nextFocusDown, nextFocusUp, size, userScale = 1, chipRef }: WordChipProps) {
  const [selfRef, self] = useSelfHandle(focusable && (nextFocusUp === 'self' || nextFocusDown === 'self'))
  const ref = useCallback((v: View | null) => {
    selfRef(v)
    if (typeof chipRef === 'function') chipRef(v)
    else if (chipRef) (chipRef as React.MutableRefObject<View | null>).current = v
  }, [chipRef, selfRef])
  const ring = useRef(new Animated.Value(0)).current
  const fade = (to: number) => Animated.timing(ring, { toValue: to, duration: tokens.motion.focusMs, useNativeDriver: true }).start()
  const inset = -px(tokens.focus.wordWidth + tokens.focus.wordOffset)
  const color = highlighted ? tokens.color.ground : tokens.color.text
  return (
    <Pressable
      ref={ref}
      focusable={focusable}
      pointerEvents={focusable ? 'auto' : 'none'}
      onFocus={() => { fade(1); onFocus?.() }}
      onBlur={() => fade(0)}
      onPress={onPress}
      {...(focusable ? tvFocusProps({ nextFocusDown, nextFocusUp }, self) : {})}
      aria-label={focusable ? label : undefined}
      accessibilityRole={focusable ? 'button' : undefined}
      style={[{ outlineWidth: 0, flexDirection: 'row', alignItems: 'center' }, highlighted ? { backgroundColor: tokens.color.marker, paddingHorizontal: px(tokens.layout.wordPadX * userScale), borderRadius: 3 } : null]}
    >
      {highlighted ? <Check size={px(size * 0.7)} color={color} visible={!!saved} /> : null}
      <Text style={{ fontFamily: tokens.type.cueTarget.family, fontWeight: tokens.type.cueTarget.weight, fontSize: px(size), lineHeight: px(size * 1.3), color }}>{text}</Text>
      <Animated.View
        pointerEvents="none"
        style={{ position: 'absolute', left: inset, top: inset, right: inset, bottom: inset, borderWidth: px(tokens.focus.wordWidth), borderColor: tokens.color.focus, borderRadius: 5, opacity: ring }}
      />
    </Pressable>
  )
}
