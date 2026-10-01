import { useCallback, useEffect, useRef } from 'react'
import { mediaControls, personalization } from '@moizp/vega-media-kit'
import type { RemoteEvent } from '@moizp/vega-media-kit'
import type { ClipDetail } from '@lingo/contracts'
import type { PlayerState } from '../screens/player/machine'
import { createPlaybackReporter, type PlaybackPhase } from './playback'
import { createTransportDeduper, transportToKey } from './transport'

/**
 * Media Controls + Personalization for the Player, through the kit's public API only. On Vega both are kit-logged no-ops until
 * KIT-007 (TODO(KIT-E4): VMC is bound to the kit's Vega VideoPlayer; TODO(KIT-E3): reportPlayback carries no playback state).
 * https://developer.amazon.com/docs/vega/0.22/media-controls-get-started · https://developer.amazon.com/docs/vega/0.22/watch-activity.html
 * Returns the wrapped key handler; Player passes it to useRemoteKeys.
 */
export function usePlatformMedia(a: { clip: ClipDetail; state: PlayerState; onKey(ev: RemoteEvent): void }): (ev: RemoteEvent) => void {
  const { clip, state, onKey } = a
  const onKeyRef = useRef(onKey)
  onKeyRef.current = onKey
  const deduper = useRef(createTransportDeduper()).current

  // Transport (Alexa / VMC) → the same key events the remote produces, minus duplicates of a key just seen.
  useEffect(() => mediaControls.onControl((c) => {
    const k = transportToKey(c)
    if (k && deduper.accept(k, Date.now())) onKeyRef.current({ key: k, longPress: false, repeat: false })
  }), [deduper])

  const clipRef = useRef(clip)
  clipRef.current = clip
  const reporter = useRef(createPlaybackReporter({
    report: (s) => {
      void personalization.reportPlayback(s.slug, s.positionS, s.durationS).catch(() => {})
      mediaControls.setNowPlaying({ title: s.title, durationS: s.durationS, positionS: s.positionS, playing: s.phase === 'playing' })
    },
  })).current

  const phase: PlaybackPhase = state.ended ? 'ended' : state.phase === 'playing' || state.phase === 'holding' ? 'playing' : 'paused'
  const positionRef = useRef(state.positionS)
  positionRef.current = state.positionS
  useEffect(() => {
    reporter.update({ slug: clip.slug, title: clip.title, positionS: state.positionS, durationS: clip.durationS, phase }, Date.now())
  }, [reporter, clip.slug, clip.title, clip.durationS, state.positionS, phase])
  useEffect(() => () => {
    const c = clipRef.current
    reporter.update({ slug: c.slug, title: c.title, positionS: positionRef.current, durationS: c.durationS, phase: 'exit' }, Date.now())
  }, [reporter])

  return useCallback((ev: RemoteEvent) => {
    deduper.sawKey(ev.key, Date.now())
    onKeyRef.current(ev)
  }, [deduper])
}
