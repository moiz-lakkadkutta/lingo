import React, { useLayoutEffect, useRef, useState } from 'react'
import { findNodeHandle, View } from 'react-native'
import type { CueDto, HighlightDto } from '@lingo/contracts'
import { Check } from '../components/Check'
import { Button } from '../components/Button'
import { T } from '../components/Text'
import { WordChip } from '../components/WordChip'
import type { Caps } from '../platformCaps'
import { strings } from '../strings'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'

export interface ExplainProps {
  cue: CueDto; highlight: HighlightDto | null; alignmentOk: boolean; wordFocus: 'cue' | 'card'
  focusedIdx: number; onFocusWord(idx: number): void
  savedIds: ReadonlySet<string>; savedCount: number; plus: boolean; caps: Caps; rate: 1 | 0.75
  onSave(highlightId: string): Promise<'saved' | 'limit' | 'error'>; onReplay(): void; onSlower(): void; onPlus(): void
  chipRefs: React.RefObject<Array<View | null>>; saveRef: React.RefObject<View | null>
  /** px from the screen bottom to the card's bottom edge: above the cue block (the Player measures it). */
  bottom: number
}

/**
 * Fixed anatomy, 880 px wide, centred above the cue block (the Player draws the scrim below the cue, so the line stays readable) (LING-003 §Explain): optional word row (card mode) /
 * word · lemma · rank chip / gloss / grammar / the cue as the example / at most three actions / status line.
 * Not an RN Modal: Vega publishes no Back events behind a Modal (decision 0006 §2). Back resumes (the Player handles it).
 */
export function Explain({ cue, highlight, wordFocus, focusedIdx, onFocusWord, savedIds, savedCount, plus, caps, rate, onSave, onReplay, onSlower, onPlus, chipRefs, saveRef, bottom }: ExplainProps) {
  const [status, setStatus] = useState<string | null>(null)
  const [limit, setLimit] = useState(false)
  const [justSaved, setJustSaved] = useState<ReadonlySet<string>>(new Set())
  const replayRef = useRef<View>(null)
  const [upHandle, setUpHandle] = useState<number | undefined>(undefined)
  const [downHandle, setDownHandle] = useState<number | undefined>(undefined)

  // Focus neighbours need mounted refs: resolve node handles after layout, never during render.
  useLayoutEffect(() => {
    const chip = chipRefs.current[focusedIdx] ?? chipRefs.current.find(Boolean) ?? null
    setUpHandle(chip ? findNodeHandle(chip) ?? undefined : undefined)
    const down = saveRef.current ?? replayRef.current
    setDownHandle(down ? findNodeHandle(down) ?? undefined : undefined)
  }, [focusedIdx, wordFocus, cue.index, chipRefs, saveRef])

  const isSaved = (h: HighlightDto) => savedIds.has(h.id) || justSaved.has(h.id)
  const saved = highlight ? isSaved(highlight) : false

  const save = async () => {
    if (!highlight || saved) return
    if (limit) { onPlus(); return }
    const r = await onSave(highlight.id)
    if (r === 'saved') { setJustSaved((s) => new Set(s).add(highlight.id)); setStatus(strings.explain.saved(savedCount + 1)) }
    else if (r === 'limit') { setLimit(true); setStatus(strings.explain.limit) }
    else setStatus(strings.explain.saveError)
  }

  const saveText = limit ? strings.explain.plusCta : saved ? strings.explain.savedState : strings.explain.save
  const saveLabel = highlight ? (limit ? strings.explain.plusCta : saved ? strings.explain.savedLabel(highlight.word) : strings.explain.saveLabel(highlight.word)) : ''

  return (
    <View pointerEvents="box-none" accessibilityViewIsModal style={{ position: 'absolute', left: 0, right: 0, bottom, alignItems: 'center' }}>
      <View style={{ width: px(tokens.layout.explainW), minHeight: px(tokens.layout.explainH), backgroundColor: tokens.color.surface1, borderRadius: 8, padding: px(32), gap: px(12) }}>
        {wordFocus === 'card' && cue.highlights.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: px(tokens.layout.wordGap) }}>
            {cue.highlights.map((h, i) => (
              <WordChip
                key={h.id}
                text={h.word}
                highlighted
                focusable
                saved={isSaved(h)}
                label={isSaved(h) ? strings.explain.wordSavedLabel(h.word) : strings.explain.wordLabel(h.word)}
                size={tokens.type.cueNative.size}
                onFocus={() => onFocusWord(i)}
                onPress={() => onFocusWord(i)}
                nextFocusDown={downHandle}
                nextFocusUp="self"
                chipRef={(r) => { chipRefs.current[i] = r }}
              />
            ))}
          </View>
        ) : null}

        {highlight ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: px(14), flexWrap: 'wrap' }}>
              <View style={{ backgroundColor: tokens.color.marker, paddingHorizontal: px(10), paddingVertical: px(2), borderRadius: 3, flexDirection: 'row', alignItems: 'center' }}>
                <Check size={px(tokens.type.title.size * 0.7)} color={tokens.color.ground} visible={saved} />
                <T variant="title" color={tokens.color.ground}>{highlight.word}</T>
              </View>
              {highlight.lemma ? <T variant="body" color={tokens.color.textSecondary}>{`· ${highlight.lemma}`}</T> : null}
              <View style={{ backgroundColor: tokens.color.surface2, paddingHorizontal: px(12), paddingVertical: px(4), borderRadius: 4 }}>
                <T variant="label">{strings.explain.rankChip(highlight.rank, highlight.level)}</T>
              </View>
            </View>
            {/* gloss/grammar may be empty for clips prepared with --no-ai (LING-001); rows collapse cleanly. */}
            {highlight.gloss ? <T variant="cueTarget">{highlight.gloss}</T> : null}
            {highlight.grammar ? <T variant="body" color={tokens.color.textSecondary}>{highlight.grammar}</T> : null}
            <T variant="body" style={{ fontStyle: 'italic' }}>{`“${cue.text.replace(/\n/g, ' ')}”`}</T>
          </>
        ) : cue.native ? (
          <T variant="cueTarget" color={tokens.color.nativeCue}>{cue.native}</T>
        ) : null}

        {/* ▲ from any action goes to the chips, ▼ stays here (decision 0006, S1): pinned so Android's spatial search never jumps to the cue line. */}
        <View style={{ flexDirection: 'row', gap: px(14), marginTop: 'auto' }}>
          {highlight ? (
            <Button primary focusRef={saveRef} label={saveLabel} text={saveText} preferred nextFocusUp={upHandle} nextFocusDown="self" onPress={save} />
          ) : null}
          <Button focusRef={replayRef} label={strings.explain.replay} text={strings.explain.replay} preferred={!highlight} nextFocusUp={upHandle} nextFocusDown="self" onPress={onReplay} />
          {caps.rate ? (
            <Button
              label={rate === 0.75 ? strings.explain.normalSpeed : plus ? strings.explain.slower : strings.explain.slowerPlus}
              text={rate === 0.75 ? strings.explain.normalSpeed : plus ? strings.explain.slower : strings.explain.slowerPlus}
              nextFocusUp={upHandle}
              nextFocusDown="self"
              onPress={() => (plus ? onSlower() : setStatus(strings.explain.slowerUpsell))}
            />
          ) : null}
        </View>
        <T variant="label" color={tokens.color.textSecondary} accessibilityLiveRegion="polite">{status ?? strings.explain.continueHint}</T>
      </View>
    </View>
  )
}
