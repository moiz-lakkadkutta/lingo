import React, { useEffect, useRef } from 'react'
import { View } from 'react-native'
import { KitPlayer } from '@moizp/vega-media-kit'
import type { KitPlayerRef } from '@moizp/vega-media-kit'
import { T } from './Text'
import { announce } from '../a11y'
import { caps as platformCaps, type Caps } from '../platformCaps'
import { strings } from '../strings'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'

export interface MiniPlayerProps { manifestUrl: string; startS: number; endS: number; playKey: number; caption?: string; onEnd?(): void; caps?: Caps }
/** Stop 50 ms early: onPosition fires at ≤ 4 Hz, so waiting for the exact end would bleed into the next line. */
export function shouldStop(positionS: number, endS: number): boolean { return positionS >= endS - 0.05 }
/**
 * 640×360 player for one cue span (Words, Quiz replay). Not focusable; pauses at the cue end and calls onEnd once.
 * caps.playback === false (Vega until KIT-010): shows and speaks strings.playbackOff.title instead of mounting KitPlayer, which would
 * reach the Shaka stub and crash, and calls onEnd once per play so a caller waiting for the end (Quiz replay) moves on (PR #2 review B-M2).
 */
export function MiniPlayer({ manifestUrl, startS, endS, playKey, caption, onEnd, caps = platformCaps }: MiniPlayerProps) {
  const ref = useRef<KitPlayerRef>(null)
  const ended = useRef<string | null>(null)
  const onEndRef = useRef(onEnd)
  onEndRef.current = onEnd
  const key = `${manifestUrl}:${startS}:${playKey}`
  const off = caps.playback === false
  useEffect(() => {
    if (!off || ended.current === key) return
    ended.current = key
    announce(strings.playbackOff.title)
    onEndRef.current?.()
  }, [off, key])
  return (
    <View pointerEvents="none" style={{ width: px(640), backgroundColor: tokens.color.surface1, borderRadius: 6, overflow: 'hidden' }}>
      <View style={{ width: px(640), height: px(360), backgroundColor: tokens.color.stage, justifyContent: off ? 'center' : undefined, padding: off ? px(32) : 0 }}>
        {off ? (
          <T testID="mini-playback-off" style={{ fontSize: px(32), lineHeight: px(42) }}>{strings.playbackOff.title}</T>
        ) : (
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
        )}
      </View>
      {caption ? <T variant="cueTarget" style={{ fontSize: px(32), lineHeight: px(42), padding: px(16) }}>{caption}</T> : null}
    </View>
  )
}
