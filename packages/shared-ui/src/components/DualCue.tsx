import React, { useState } from 'react'
import { Animated, View } from 'react-native'
import { defaultCueTheme } from '@moizp/vega-media-kit'
import type { CueDto } from '@lingo/contracts'
import type { Alignment } from '../screens/player/align'
import { strings } from '../strings'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'
import { T } from './Text'
import { WordChip } from './WordChip'

export interface DualCueProps {
  cue: CueDto | null; alignment: Alignment | null; nativeVisible: boolean
  /** 'cue' → highlighted chips focusable; 'card' → chips not focusable */
  wordFocus: 'cue' | 'card'
  focusedIdx: number | null; onFocusWord(idx: number): void
  savedIds: ReadonlySet<string>; userScale: number
  /** 0→1 over holdMs while holding; null otherwise */
  hold: Animated.Value | null
  /** Save button handle (chips ▼ → card); ▲ on a chip stays on the chip (decision 0006, S1) */
  nextFocusDown?: number
  /** indexed by highlightIdx, for nextFocusUp from the card */
  chipRefs?: React.RefObject<Array<View | null>>
  /** Height of the cue block (native + target + hold bar), so the Explain card can sit above it. */
  onBlockLayout?(height: number): void
}

const geo = defaultCueTheme // kit geometry (padding, radius, line height); Lingo owns the colours (decision 0006)

/** Two-line cue: native (32 px, cooler) above target (44 px, bright) as rows of word chips; the hold bar sits under the target box. */
export function DualCue({ cue, alignment, nativeVisible, wordFocus, onFocusWord, savedIds, userScale, hold, nextFocusDown, chipRefs, onBlockLayout }: DualCueProps) {
  const [boxW, setBoxW] = useState(0)
  const box = { backgroundColor: tokens.color.cueBox, paddingHorizontal: px(geo.paddingH), paddingVertical: px(geo.paddingV), borderRadius: geo.radius, maxWidth: userScale >= 1.5 ? ('100%' as const) : ('86%' as const) } // full safe width at 150 %
  const nativeSize = tokens.type.cueNative.size * userScale
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, paddingHorizontal: px(tokens.layout.safeX), paddingVertical: px(tokens.layout.safeY), justifyContent: 'flex-end', alignItems: 'center', gap: px(8) }}>
      {cue && alignment ? (
        <View pointerEvents="box-none" style={{ alignItems: 'center', gap: px(8), alignSelf: 'stretch' }} onLayout={(e) => onBlockLayout?.(e.nativeEvent.layout.height)}>
          {nativeVisible && cue.native ? (
            <View style={box}>
              <T variant="cueNative" color={tokens.color.nativeCue} numberOfLines={2} style={{ textAlign: 'center', fontSize: px(nativeSize), lineHeight: px(nativeSize * geo.lineHeight) }}>{cue.native}</T>
            </View>
          ) : null}
          <View style={box} onLayout={(e) => setBoxW(e.nativeEvent.layout.width)} pointerEvents="box-none">
            {alignment.lines.map((line, li) => (
              <View key={li} pointerEvents="box-none" style={{ flexDirection: 'row', justifyContent: 'center', columnGap: px(tokens.layout.wordGap * userScale), flexWrap: 'wrap' }}>
                {line.map((slot, si) => {
                  const h = slot.highlightIdx !== null ? cue.highlights[slot.highlightIdx] : undefined
                  const idx = slot.highlightIdx
                  const saved = !!h && savedIds.has(h.id)
                  const word = h?.word ?? slot.text
                  return (
                    <WordChip
                      key={si}
                      text={slot.text}
                      highlighted={!!h}
                      focusable={wordFocus === 'cue' && !!h}
                      saved={saved}
                      label={saved ? strings.explain.wordSavedLabel(word) : strings.explain.wordLabel(word)}
                      size={tokens.type.cueTarget.size * userScale}
                      userScale={userScale}
                      onFocus={idx !== null ? () => onFocusWord(idx) : undefined}
                      nextFocusDown={h ? nextFocusDown : undefined}
                      nextFocusUp={h ? 'self' : undefined}
                      chipRef={idx !== null && chipRefs ? (r) => { chipRefs.current[idx] = r } : undefined}
                    />
                  )
                })}
              </View>
            ))}
          </View>
          {hold ? (
            <View style={{ height: px(tokens.layout.holdBarH), width: boxW }} accessibilityLabel={strings.player.hold}>
              <Animated.View style={{ height: '100%', backgroundColor: tokens.color.interactive, width: hold.interpolate({ inputRange: [0, 1], outputRange: [0, boxW] }) }} />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}
