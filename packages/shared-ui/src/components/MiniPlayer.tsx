import React, { useRef } from 'react'
import { View } from 'react-native'
import { KitPlayer } from '@moizp/vega-media-kit'
import type { KitPlayerRef } from '@moizp/vega-media-kit'
import { T } from './Text'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'

export interface MiniPlayerProps { manifestUrl: string; startS: number; endS: number; playKey: number; caption?: string; onEnd?(): void }
/** Stop 50 ms early: onPosition fires at ≤ 4 Hz, so waiting for the exact end would bleed into the next line. */
export function shouldStop(positionS: number, endS: number): boolean { return positionS >= endS - 0.05 }
/** 640×360 player for one cue span (Words, Quiz replay). Not focusable; pauses at the cue end and calls onEnd once. */
export function MiniPlayer({ manifestUrl, startS, endS, playKey, caption, onEnd }: MiniPlayerProps) {
  const ref = useRef<KitPlayerRef>(null)
  const ended = useRef<string | null>(null)
  const key = `${manifestUrl}:${startS}:${playKey}`
  return (
    <View pointerEvents="none" style={{ width: px(640), backgroundColor: tokens.color.surface1, borderRadius: 6, overflow: 'hidden' }}>
      <View style={{ width: px(640), height: px(360), backgroundColor: tokens.color.stage }}>
        <KitPlayer
          key={key}
          ref={ref}
          source={{ uri: manifestUrl, type: 'hls' }}
          autoplay
          startAt={startS}
          onPosition={(s) => {
            if (ended.current === key || !shouldStop(s, endS)) return
            ended.current = key
            ref.current?.pause()
            onEnd?.()
          }}
        />
      </View>
      {caption ? <T variant="cueTarget" style={{ fontSize: px(32), lineHeight: px(42), padding: px(16) }}>{caption}</T> : null}
    </View>
  )
}
