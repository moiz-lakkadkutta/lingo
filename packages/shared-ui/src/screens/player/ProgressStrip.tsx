import React from 'react'
import { View } from 'react-native'
import { T } from '../../components/Text'
import { strings } from '../../strings'
import { tokens } from '../../theme/tokens'
import { px } from '../../theme/scale'
import { knownDuration, progressFraction, progressText } from './progress'

/** Strip height in design px (1920×1080): one label line plus vertical padding. Player.tsx reserves this much when it places the strip. */
export const PROGRESS_STRIP_H = tokens.type.label.line + 2 * tokens.layout.progressPadY

/**
 * Elapsed / total time and a thin bar (QA #12), 880 px wide (the Explain card's width), centred, on the cue box colour so it reads on
 * any picture. Not focusable: one accessible element that states the time. Without a duration it shows elapsed time only and no bar.
 */
export function ProgressStrip({ positionS, durationS, bottom }: { positionS: number; durationS: number | null | undefined; bottom: number }) {
  const dur = knownDuration(durationS)
  const f = progressFraction(positionS, dur)
  const { elapsed, total } = progressText(positionS, dur)
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom, alignItems: 'center' }}>
      <View
        accessible
        accessibilityRole="progressbar"
        aria-label={strings.player.progressLabel(elapsed, total)}
        accessibilityValue={dur === null ? { text: strings.player.progressLabel(elapsed, total) } : { min: 0, max: Math.round(dur), now: Math.round(Math.min(positionS, dur)) }}
        style={{
          width: px(tokens.layout.explainW), flexDirection: 'row', alignItems: 'center', justifyContent: f === null ? 'center' : 'flex-start', gap: px(tokens.layout.progressPadX),
          backgroundColor: tokens.color.cueBox, borderRadius: px(tokens.radius.lg), paddingHorizontal: px(tokens.layout.progressPadX), paddingVertical: px(tokens.layout.progressPadY),
        }}
      >
        {f !== null ? (
          <View style={{ flex: 1, height: px(tokens.layout.progressBarH), borderRadius: px(tokens.layout.progressBarH / 2), backgroundColor: tokens.color.track, overflow: 'hidden' }}>
            <View style={{ width: `${f * 100}%`, height: '100%', backgroundColor: tokens.color.interactive }} />
          </View>
        ) : null}
        <T variant="label" color={tokens.color.textSecondary} style={{ fontVariant: ['tabular-nums'] }}>{strings.player.progress(elapsed, total)}</T>
      </View>
    </View>
  )
}
