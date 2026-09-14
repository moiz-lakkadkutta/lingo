import React, { useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import { KitPlayer, CueOverlay } from '@moizp/vega-media-kit'
import type { Cue, KitPlayerRef } from '@moizp/vega-media-kit'
import type { ClipDetail, LearnerDto } from '@lingo/contracts'
import { T } from '../components'
import { Explain } from './Explain'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'

/**
 * Dual cues: target (44 px, bright) over native (32 px, cooler, 70 %). Cues come from the clip payload (already segmented
 * by the pipeline) rather than from HLS text tracks, so highlights and native text are guaranteed to align.
 * Pause/Select → Explain card for the current cue. ◄► while paused → word focus (kit `selectable`).
 */
export function Player({ clip, learner, scale, challenge, sessionCode, onBack, onEnd, onSave }: {
  clip: ClipDetail; learner: LearnerDto; scale: number; challenge: boolean; sessionCode?: string
  onBack: (positionS: number) => void; onEnd: () => void; onSave: (highlightId: string) => Promise<'saved' | 'limit'>
}) {
  const ref = useRef<KitPlayerRef>(null)
  const [pos, setPos] = useState(0)
  const [paused, setPaused] = useState(false)
  const [rate, setRate] = useState<1 | 0.75>(1)
  const [wordIdx, setWordIdx] = useState<number | null>(null)
  const current = useMemo(() => clip.cues.find((c) => c.startS <= pos && c.endS > pos) ?? null, [clip.cues, pos])
  const active: Cue[] = current ? [
    { trackId: 'target', id: `t${current.index}`, start: current.startS, end: current.endS, text: markHighlights(current.text, current.highlights.map((h) => h.word)) },
    ...(challenge && !paused ? [] : [{ trackId: 'native', id: `n${current.index}`, start: current.startS, end: current.endS, text: current.native }]),
  ] : []
  const nativeVisible = learner.nativeLine === 'always' || (learner.nativeLine === 'onPause' && paused)
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <KitPlayer ref={ref} source={{ uri: clip.manifestUrl, type: 'hls' }} autoplay startAt={clip.resumeS ?? 0} onPosition={setPos} onState={(s) => { setPaused(s === 'paused'); if (s === 'ended') onEnd() }} />
      <CueOverlay active={active} primaryTrackId="target" hideSecondary={!nativeVisible} scale={scale}
        theme={{ fontFamily: tokens.type.cueTarget.family, primarySize: tokens.type.cueTarget.size, secondarySize: tokens.type.cueNative.size, secondaryColor: tokens.color.nativeCue, userScale: learner.cueScale }}
        selectable={paused && current ? { focusedIndex: wordIdx } : undefined} />
      <View style={{ position: 'absolute', left: px(tokens.layout.safeX), bottom: px(tokens.layout.safeY) }}>
        <T variant="label" color={tokens.color.textSecondary}>{[challenge ? 'Challenge' : null, rate === 0.75 ? '0.75×' : null].filter(Boolean).join(' · ')}</T>
      </View>
      {paused && current ? (
        <Explain cue={current} wordIdx={wordIdx} onWord={setWordIdx} onSave={onSave} onReplay={() => { ref.current?.seek(current.startS); ref.current?.play() }} onSlower={() => { const r = rate === 1 ? 0.75 : 1; setRate(r); ref.current?.setRate(r) }} onContinue={() => ref.current?.play()} sessionCode={sessionCode} />
      ) : null}
    </View>
  )
}
/** Wrap highlighted words in <b> so the overlay renders them bold; the marker background is applied by a CueOverlay theme extension (LING-003). */
export function markHighlights(text: string, words: string[]): string {
  let out = text
  for (const w of words) out = out.replace(new RegExp(`\\b(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`), '<b>$1</b>')
  return out
}
