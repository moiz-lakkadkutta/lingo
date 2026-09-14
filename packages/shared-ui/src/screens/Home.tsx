import React from 'react'
import { ScrollView, View } from 'react-native'
import type { Catalog, LearnerDto } from '@lingo/contracts'
import { Card, Focusable, Row, T } from '../components'
import { strings } from '../strings'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'
const LEVELS = ['A1', 'A2', 'B1', 'B2'] as const
export function Home({ catalog, learner, onOpen, onWatch }: { catalog: Catalog | null; learner: LearnerDto; onOpen: (slug: string) => void; onWatch: (slug: string) => void }) {
  const hero = catalog?.justRight[0]
  const up = LEVELS[Math.min(LEVELS.indexOf(learner.level) + 1, 3)]!
  const card = (c: Catalog['justRight'][number]) => <Card key={c.slug} title={c.title} imageUrl={c.posterUrl ?? undefined} badge={c.level} meta={`${Math.round(c.durationS / 60)} min`} label={`Open ${c.title}, level ${c.level}`} onPress={() => onOpen(c.slug)} />
  return (
    <ScrollView>
      {hero ? (
        <View style={{ height: px(tokens.layout.heroH), justifyContent: 'flex-end', marginBottom: px(40) }}>
          <T variant="label" color={tokens.color.textSecondary}>{`${hero.level} · ${Math.round(hero.durationS / 60)} MIN`}</T>
          <T variant="display">{hero.title}</T>
          <Focusable label={`${strings.home.watch} ${hero.title}`} hasTVPreferredFocus onPress={() => onWatch(hero.slug)} style={{ backgroundColor: tokens.color.interactive, paddingHorizontal: px(32), paddingVertical: px(18), alignSelf: 'flex-start', marginTop: px(20) }}>
            <T variant="title" color={tokens.color.ground}>▶ {strings.home.watch}</T>
          </Focusable>
        </View>
      ) : null}
      {catalog?.continue.length ? <Row label={strings.home.continue}>{catalog.continue.map(card)}</Row> : null}
      <Row label={strings.home.justRight(learner.level)}>{(catalog?.justRight ?? []).map(card)}</Row>
      <Row label={strings.home.harder(up)}>{(catalog?.harder ?? []).map(card)}</Row>
      <Row label={strings.home.fresh}>{(catalog?.fresh ?? []).map(card)}</Row>
    </ScrollView>
  )
}
