import React from 'react'
import { Pressable, Text, View } from 'react-native'
import type { WordSavedPayload } from '@lingo/contracts'
import { strings } from '../strings'
import { color, radius, space, tap, type } from '../theme'
import { Button } from './Button'

export interface WordChipProps { w: WordSavedPayload; open: boolean; onToggle(): void; onHear(): void }
/** A saved word: marker fill, ground text (the marker is only for saved words). Open shows gloss, example and "Hear it".
 *  The label replaces the children for a screen reader, so an open chip's label carries the gloss and the example itself. */
export function WordChip({ w, open, onToggle, onHear }: WordChipProps) {
  return (
    <View style={{ gap: space.s, width: open ? '100%' : undefined }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        aria-label={open ? strings.live.chipOpenLabel(w.word, w.gloss, w.example) : strings.live.chipLabel(w.word)}
        aria-expanded={open}
        style={{ backgroundColor: color.marker, borderRadius: radius.chip, minHeight: tap, paddingHorizontal: space.m, paddingVertical: space.s, justifyContent: 'center', gap: space.xs }}
      >
        <Text style={[type.title, { color: color.ground }]}>{w.word}</Text>
        {open ? <>
          <Text style={[type.body, { color: color.ground }]}>{w.gloss}</Text>
          <Text style={[type.body, { color: color.ground, fontStyle: 'italic' }]}>{w.example}</Text>
        </> : null}
      </Pressable>
      {open ? <Button label={strings.live.hear} ariaLabel={strings.live.hearLabel(w.word)} onPress={onHear} /> : null}
    </View>
  )
}
