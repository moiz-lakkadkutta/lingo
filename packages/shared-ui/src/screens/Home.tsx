import React, { useLayoutEffect, useRef, useState } from 'react'
import { findNodeHandle, Image, ScrollView, View } from 'react-native'
import type { Catalog, ClipCard, LearnerDto } from '@lingo/contracts'
import { Button, Card, LevelChip, Rail, Row, Screen, SkeletonBlock, SkeletonRow, StateMessage, T, type RailItem } from '../components'
import { formatClock, formatMinutes, homeRows, pickHero } from '../app/selectors'
import type { Resource } from '../data/resource'
import { pickPreferred, type FocusMemoryProps } from '../nav/focusMemory'
import { strings } from '../strings'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'

export interface HomeProps extends FocusMemoryProps {
  catalog: Resource<Catalog>; learner: LearnerDto; onReload(): void
  onWatch(card: ClipCard): void; onOpen(slug: string): void; onRail(k: RailItem['key']): void; onSettings(): void
}

export const RAIL_ITEMS: RailItem[] = [
  { key: 'home', label: strings.rail.watchLabel, text: strings.rail.watch },
  { key: 'review', label: strings.rail.reviewLabel, text: strings.rail.review },
  { key: 'words', label: strings.rail.wordsLabel, text: strings.rail.words },
  { key: 'plus', label: strings.rail.plusLabel, text: strings.rail.plus },
  { key: 'settings', label: strings.rail.settingsLabel, text: strings.rail.settings },
]
const FALLBACK = 'hero:watch'
const HERO_POSTER = { w: 768, h: 432 }

/** The rail's 96 px slot without focusables: shown while nothing else can take focus, so the hero Watch is the first focusable to mount. */
const RailSlot = () => <View style={{ width: px(tokens.layout.rail), backgroundColor: tokens.color.surface1 }} />

/**
 * Home (docs/plans/LING-005.md §5): rail · hero (next clip at the learner's level) · rows. Focus starts on hero Watch (or the
 * remembered element); ◄ from hero Watch or a row's first card opens the rail; ► from the rail returns to hero Watch.
 */
export function Home({ catalog, learner, onReload, onWatch, onOpen, onRail, onSettings, initialFocus, onFocusId }: HomeProps) {
  const data = catalog.data
  const hero = data ? pickHero(data) : null
  const rows = data ? homeRows(data, learner.level) : []
  const ids = data ? [
    ...(hero ? ['hero:watch', 'hero:meet'] : []),
    ...rows.flatMap((r) => r.cards.map((c) => `card:${r.key}:${c.slug}`)),
    ...RAIL_ITEMS.map((i) => `rail:${i.key}`),
  ] : []
  // Once per mount, at the first render that has something focusable (data may arrive after mount).
  const pref = useRef<string | null | undefined>(undefined)
  if (pref.current === undefined && data && (hero || rows.length)) pref.current = pickPreferred(initialFocus, ids, FALLBACK)
  const preferred = pref.current ?? null

  const railRefs = useRef<Partial<Record<RailItem['key'], View | null>>>({})
  const heroWatch = useRef<View | null>(null)
  const firstCards = useRef<Record<string, View | null>>({})
  const [handles, setHandles] = useState<{ left?: number; right?: number }>({})
  useLayoutEffect(() => {
    const h = (v: View | null | undefined) => (v ? findNodeHandle(v) ?? undefined : undefined)
    const left = h(railRefs.current.home)
    const right = h(heroWatch.current) ?? (rows[0] ? h(firstCards.current[rows[0].key]) : undefined)
    if (left !== handles.left || right !== handles.right) setHandles({ left, right })
  })

  if (!data && catalog.state !== 'error') {
    return (
      <Screen rail={<RailSlot />}>
        <T accessibilityLiveRegion="polite" style={{ position: 'absolute', opacity: 0 }}>{strings.home.loading}</T>
        <View style={{ gap: px(40) }}>
          <SkeletonBlock w={1728 - tokens.layout.rail} h={tokens.layout.heroH} />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      </Screen>
    )
  }
  if (!data && catalog.state === 'error') {
    const offline = catalog.error === 'offline'
    return (
      <Screen rail={<RailSlot />}>
        <StateMessage title={offline ? strings.offline : strings.common.error} announceOnMount={offline} actions={[{ label: strings.common.retry, text: strings.common.retry, onPress: onReload }]} />
      </Screen>
    )
  }
  if (!hero && !rows.length) {
    return (
      <Screen rail={<RailSlot />}>
        <StateMessage title={strings.home.empty} actions={[{ label: strings.home.emptyAction, text: strings.home.emptyAction, onPress: onSettings }]} />
      </Screen>
    )
  }

  const rail = <Rail items={RAIL_ITEMS} current="home" onSelect={onRail} itemRefs={railRefs} rightTarget={handles.right} initialFocus={preferred ?? undefined} onFocusId={onFocusId} />
  const at = hero?.resumeS ? formatClock(hero.resumeS) : null // 0 s (added to Continue, not started) reads Watch
  return (
    <Screen rail={rail}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {hero ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: px(tokens.layout.heroH), marginBottom: px(40) }}>
            <View style={{ flex: 1, gap: px(16), paddingRight: px(48) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: px(12) }}>
                <LevelChip level={hero.level} />
                <T variant="label" color={tokens.color.textSecondary}>{`${strings.level.about(hero.level)} · ${formatMinutes(hero.durationS)}`}</T>
              </View>
              <T variant="display" numberOfLines={2}>{hero.title}</T>
              <View style={{ flexDirection: 'row', gap: px(16), marginTop: px(8) }}>
                <Button
                  primary label={at ? strings.home.resumeLabel(hero.title, at) : strings.home.watchLabel(hero.title)} text={at ? strings.home.resume(at) : strings.home.watch}
                  onPress={() => onWatch(hero)} preferred={preferred === 'hero:watch'} id="hero:watch" onFocusId={onFocusId}
                  focusRef={(v) => { heroWatch.current = v }} nextFocusLeft={handles.left}
                />
                <Button label={strings.home.meetLabel(hero.title)} text={strings.home.meet} onPress={() => onOpen(hero.slug)} preferred={preferred === 'hero:meet'} id="hero:meet" onFocusId={onFocusId} />
              </View>
            </View>
            <View style={{ width: px(HERO_POSTER.w), height: px(HERO_POSTER.h), borderRadius: 6, overflow: 'hidden', backgroundColor: tokens.color.surface2 }}>
              {hero.posterUrl ? <Image source={{ uri: hero.posterUrl }} style={{ width: '100%', height: '100%' }} accessibilityIgnoresInvertColors /> : null}
            </View>
          </View>
        ) : null}
        {rows.map((row) => (
          <Row key={row.key} label={row.title}>
            {row.cards.map((c, i) => {
              const id = `card:${row.key}:${c.slug}`
              return (
                <Card
                  key={c.slug} title={c.title} imageUrl={c.posterUrl ?? undefined} level={c.level} durationS={c.durationS}
                  progress={row.key === 'continue' && c.resumeS !== null && c.durationS > 0 ? c.resumeS / c.durationS : undefined}
                  label={strings.home.cardLabel(c.title, c.level, formatMinutes(c.durationS))}
                  onPress={() => onOpen(c.slug)} onFocus={() => onFocusId(id)} preferred={preferred === id}
                  focusRef={i === 0 ? (v) => { firstCards.current[row.key] = v } : undefined}
                  nextFocusLeft={i === 0 ? handles.left : undefined}
                />
              )
            })}
          </Row>
        ))}
      </ScrollView>
    </Screen>
  )
}
