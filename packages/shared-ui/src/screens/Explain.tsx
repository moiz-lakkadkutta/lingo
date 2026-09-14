import React, { useState } from 'react'
import { View } from 'react-native'
import type { CueDto } from '@lingo/contracts'
import { Focusable, T } from '../components'
import { strings } from '../strings'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'

/** Fixed anatomy, 880×420, bottom-centred over the dimmed picture: word · lemma · rank chip / gloss 44 / grammar 32 / example / three actions. */
export function Explain({ cue, wordIdx, onWord, onSave, onReplay, onSlower, onContinue, sessionCode }: {
  cue: CueDto; wordIdx: number | null; onWord: (i: number) => void; onSave: (highlightId: string) => Promise<'saved' | 'limit'>; onReplay: () => void; onSlower: () => void; onContinue: () => void; sessionCode?: string
}) {
  const h = cue.highlights[wordIdx ?? 0] ?? cue.highlights[0]
  const [status, setStatus] = useState<string | null>(null)
  void onWord; void sessionCode
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(15,21,27,0.4)', justifyContent: 'flex-end', alignItems: 'center', paddingBottom: px(tokens.layout.safeY + 60) }} accessibilityViewIsModal>
      <View style={{ width: px(tokens.layout.explainW), minHeight: px(tokens.layout.explainH), backgroundColor: tokens.color.surface1, borderRadius: 8, padding: px(32), gap: px(12) }}>
        {h ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: px(14) }}>
              <View style={{ backgroundColor: tokens.color.marker, paddingHorizontal: px(10), paddingVertical: px(2), borderRadius: 3 }}><T variant="title" color={tokens.color.ground}>{h.word}</T></View>
              <T variant="body" color={tokens.color.textSecondary}>· {h.lemma} · {h.level}</T>
            </View>
            <T variant="cueTarget">{h.gloss}</T>
            <T variant="body" color={tokens.color.textSecondary}>{h.grammar}</T>
            <T variant="body" style={{ fontStyle: 'italic' }}>"{cue.text}"</T>
          </>
        ) : <T variant="body">{cue.native}</T>}
        <View style={{ flexDirection: 'row', gap: px(14), marginTop: 'auto' }}>
          {h ? <Focusable label={`${strings.explain.save}: ${h.word}`} hasTVPreferredFocus onPress={async () => setStatus((await onSave(h.id)) === 'limit' ? strings.explain.limit : strings.explain.saved(1))} style={{ backgroundColor: tokens.color.interactive, paddingHorizontal: px(28), paddingVertical: px(16) }}><T variant="body" color={tokens.color.ground}>{strings.explain.save}</T></Focusable> : null}
          <Focusable label={strings.explain.replay} onPress={onReplay} style={{ backgroundColor: tokens.color.surface2, paddingHorizontal: px(28), paddingVertical: px(16) }}><T variant="body">{strings.explain.replay}</T></Focusable>
          <Focusable label={strings.explain.slower} onPress={onSlower} style={{ backgroundColor: tokens.color.surface2, paddingHorizontal: px(28), paddingVertical: px(16) }}><T variant="body">{strings.explain.slower}</T></Focusable>
          <Focusable label={strings.explain.continue} onPress={onContinue} style={{ backgroundColor: tokens.color.surface2, paddingHorizontal: px(28), paddingVertical: px(16) }}><T variant="body">{strings.explain.continue}</T></Focusable>
        </View>
        {status ? <T variant="label" color={tokens.color.textSecondary} accessibilityLiveRegion="polite">{status}</T> : null}
      </View>
    </View>
  )
}
