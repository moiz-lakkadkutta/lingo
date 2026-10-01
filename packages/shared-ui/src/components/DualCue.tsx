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
  /** Save button handle (chips → card) */
  nextFocusDown?: number
  /** indexed by highlightIdx, for nextFocusUp from the card */
  chipRefs?: React.RefObject<Array<View | null>>
}

const geo = defaultCueTheme // kit geometry (padding, radius, line height); Lingo owns the colours (decision 0006)

/** Two-line cue: native (32 px, cooler) above target (44 px, bright) as rows of word chips; the hold bar sits under the target box. */
export function DualCue({ cue, alignment, nativeVisible, wordFocus, onFocusWord, savedIds, userScale, hold, nextFocusDown, chipRefs }: DualCueProps) {
  const [boxW, setBoxW] = useState(0)
  const box = { backgroundColor: tokens.color.cueBox, paddingHorizontal: px(geo.paddingH), paddingVertical: px(geo.paddingV), borderRadius: geo.radius, maxWidth: '86%' as const }
  const nativeSize = tokens.type.cueNative.size * userScale
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, paddingHorizontal: px(tokens.layout.safeX), paddingVertical: px(tokens.layout.safeY), justifyContent: 'flex-end', alignItems: 'center', gap: px(8) }}>
      {cue && alignment ? (
        <>
          {nativeVisible && cue.native ? (
            <View style={box}>
              <T variant="cueNative" color={tokens.color.nativeCue} numberOfLines={2} style={{ textAlign: 'center', fontSize: px(nativeSize), lineHeight: px(nativeSize * geo.lineHeight) }}>{cue.native}</T>
            </View>
          ) : null}
          <View style={box} onLayout={(e) => setBoxW(e.nativeEvent.layout.width)} pointerEvents="box-none">
            {alignment.lines.map((line, li) => (
              <View key={li} pointerEvents="box-none" style={{ flexDirection: 'row', justifyContent: 'center', columnGap: px(tokens.layout.wordGap), flexWrap: 'nowrap' }}>
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
                      label={saved ? strings.explain.savedLabel(word) : strings.explain.wordLabel(word)}
                      size={tokens.type.cueTarget.size * userScale}
                      onFocus={idx !== null ? () => onFocusWord(idx) : undefined}
                      nextFocusDown={h ? nextFocusDown : undefined}
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
        </>
      ) : null}
    </View>
  )
}
