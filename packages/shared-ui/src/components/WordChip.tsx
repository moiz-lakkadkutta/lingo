import React, { useRef } from 'react'
import { Animated, Pressable, Text, type View } from 'react-native'
import '../tvProps'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'

export interface WordChipProps {
  text: string; highlighted: boolean; focusable: boolean; saved?: boolean
  /** aria-label, e.g. strings.explain.wordLabel(word) */
  label: string
  onFocus?(): void; onPress?(): void
  /** node handle */
  nextFocusDown?: number
  /** px at 1080p before scale (44 for cue, 32 in the card) */
  size: number
  chipRef?: React.Ref<View>
}

/**
 * One word of the target cue (decision 0006 B). Highlighted: marker background, dark text. Focus on a word is an outline only
 * (wordWidth at wordOffset, opacity in focusMs), never a scale, so the line does not reflow. Non-focusable chips also take
 * pointerEvents="none" because Vega ignores `focusable` on Pressable.
 */
export function WordChip({ text, highlighted, focusable, saved, label, onFocus, onPress, nextFocusDown, size, chipRef }: WordChipProps) {
  const ring = useRef(new Animated.Value(0)).current
  const fade = (to: number) => Animated.timing(ring, { toValue: to, duration: tokens.motion.focusMs, useNativeDriver: true }).start()
  const inset = -px(tokens.focus.wordWidth + tokens.focus.wordOffset)
  return (
    <Pressable
      ref={chipRef}
      focusable={focusable}
      pointerEvents={focusable ? 'auto' : 'none'}
      onFocus={() => { fade(1); onFocus?.() }}
      onBlur={() => fade(0)}
      onPress={onPress}
      nextFocusDown={nextFocusDown}
      aria-label={focusable ? label : undefined}
      accessibilityRole={focusable ? 'button' : undefined}
      style={[{ outlineWidth: 0 }, highlighted ? { backgroundColor: tokens.color.marker, paddingHorizontal: px(tokens.layout.wordPadX), borderRadius: 3 } : null]}
    >
      <Text style={{ fontFamily: tokens.type.cueTarget.family, fontWeight: tokens.type.cueTarget.weight, fontSize: px(size), lineHeight: px(size * 1.3), color: highlighted ? tokens.color.ground : tokens.color.text }}>
        {saved ? '✓ ' : ''}{text}
      </Text>
      <Animated.View
        pointerEvents="none"
        style={{ position: 'absolute', left: inset, top: inset, right: inset, bottom: inset, borderWidth: px(tokens.focus.wordWidth), borderColor: tokens.color.focus, borderRadius: 5, opacity: ring }}
      />
    </Pressable>
  )
}
