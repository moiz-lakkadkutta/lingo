import React, { useRef } from 'react'
import { ScrollView, View } from 'react-native'
import type { ClipCredit } from '@lingo/contracts'
import { Button, Focusable, Screen, T } from '../components'
import { strings } from '../strings'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'
import { focusBleed } from '../theme/bleed'

const L = tokens.layout

export interface AboutProps {
  /** every published clip's credit (GET /clips/attributions); null while it loads */ credits: ClipCredit[] | null
  /** the credits could not load (and nothing is cached) */ failed?: boolean
  onBack(): void
}

/**
 * The scroll offset that shows [top, bottom] (content y, device px) in full with `pad` around it, or null when it already is.
 * A row above the view lines up with the top, a row below it with the bottom; a row taller than the view lines up with the top.
 */
export function revealOffset(top: number, bottom: number, offset: number, viewH: number, pad: number): number | null {
  const lo = top - pad, hi = bottom + pad
  if (lo < offset || hi - lo > viewH) return Math.max(0, lo)
  if (hi > offset + viewH) return hi - viewH
  return null
}

/**
 * About & attributions: machine/AI notice, fonts, frequency list, and every published clip's attribution — all languages and levels
 * (device test 2026-10-23: it listed only the current Home rows, and nothing right after a Settings change). Each credit is a focusable row,
 * so Up and Down on a remote reach every credit; the focused row scrolls fully into view with its 1.04 scale and outline (focusBleed).
 */
export function About({ credits, failed, onBack }: AboutProps) {
  const credited = (credits ?? []).filter((c) => c.attribution.trim())
  const status = credits === null ? (failed ? strings.about.clipsOffline : strings.about.clipsLoading) : null

  const scroll = useRef<ScrollView | null>(null)
  const at = useRef({ offset: 0, viewH: 0, listY: 0, rows: new Map<string, { y: number; h: number }>() }).current
  const bleedX = focusBleed(L.rowW), bleedY = Math.max(px(8), focusBleed(L.rowH))
  const reveal = (slug: string, i: number) => {
    const row = at.rows.get(slug)
    if (!row || !at.viewH) {
      // No layout yet (or a platform that skips onLayout): the first credit shows the page from the top, the last one the end.
      if (i === 0) scroll.current?.scrollTo?.({ y: 0, animated: true })
      else if (i === credited.length - 1) scroll.current?.scrollToEnd?.({ animated: true })
      return
    }
    const top = at.listY + row.y
    const y = revealOffset(top, top + row.h, at.offset, at.viewH, bleedY)
    if (y !== null) { at.offset = y; scroll.current?.scrollTo?.({ y, animated: true }) }
  }

  return (
    <Screen>
      <T variant="display" style={{ marginBottom: px(16) }}>{strings.about.title}</T>
      <ScrollView
        ref={scroll} testID="about-scroll" showsVerticalScrollIndicator={false} scrollEventThrottle={16}
        onLayout={(e) => { at.viewH = e.nativeEvent.layout.height }}
        onScroll={(e) => { at.offset = e.nativeEvent.contentOffset.y }}
        style={{ marginLeft: -bleedX }}
        contentContainerStyle={{ gap: px(16), paddingVertical: bleedY, paddingLeft: bleedX, paddingRight: bleedX }}
      >
        <T variant="body">{strings.about.machine}</T>
        <T variant="body" color={tokens.color.textSecondary}>{strings.about.fonts}</T>
        <T variant="body" color={tokens.color.textSecondary}>{strings.about.freq}</T>
        {status || credited.length ? (
          <View style={{ gap: px(L.rowGap), marginTop: px(16) }} onLayout={(e) => { at.listY = e.nativeEvent.layout.y }}>
            <T variant="title">{strings.about.clips}</T>
            {status ? <T variant="label" color={tokens.color.textSecondary} accessibilityLiveRegion="polite">{status}</T> : null}
            {credited.map((c, i) => (
              <View key={c.slug} onLayout={(e) => { at.rows.set(c.slug, { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height }) }}>
                <Focusable
                  label={strings.about.creditLabel(c.title, c.attribution)} testID={`credit-${c.slug}`}
                  onFocus={() => reveal(c.slug, i)}
                  style={{ width: px(L.rowW), paddingHorizontal: px(L.rowPadX), paddingVertical: px(L.rowPadY), gap: px(4), borderRadius: px(tokens.radius.md), backgroundColor: tokens.color.surface1 }}
                >
                  <T variant="body">{c.title}</T>
                  <T variant="label" color={tokens.color.textSecondary}>{c.attribution}</T>
                </Focusable>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
      <View style={{ marginTop: px(16) }}>
        <Button primary preferred label={strings.about.backLabel} text={strings.common.back} onPress={onBack} />
      </View>
    </Screen>
  )
}
