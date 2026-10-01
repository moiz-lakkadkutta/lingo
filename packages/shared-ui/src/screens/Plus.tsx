import React, { useCallback, useEffect, useRef, useState } from 'react'
import { BackHandler, View } from 'react-native'
import { PLUS_SKU, type PlusStatus } from '@lingo/contracts'
import { Focusable } from '../components/Focusable'
import { T } from '../components/Text'
import type { Caps } from '../platformCaps'
import { purchaseFlow, restoreFlow, type Api } from '../plus/flow'
import { initialPlus, reducePlus, type PlusEvent, type PlusState } from '../plus/machine'
import type { PlusStore, StoreProduct } from '../plus/types'
import { strings } from '../strings'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'

export interface PlusProps {
  store: PlusStore; api: Api; caps: Caps
  onBack(): void
  /** Root re-fetches /me so learner.plus updates Challenge mode, 0.75× and the save limit. */
  onChanged(): void
}

const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })

/**
 * The honest Plus screen (LING-007): one sentence, the store's own price, Subscribe / Restore / Back. No countdown, no
 * strike-through, no "most popular". What it says follows the server's mode (iap / demo / off) and entitlement.
 */
export function Plus({ store, api, caps, onBack, onChanged }: PlusProps) {
  const [s, setS] = useState<PlusState>(initialPlus)
  const dispatch = useCallback((e: PlusEvent) => setS((prev) => reducePlus(prev, e)), [])
  const changed = useRef(onChanged)
  changed.current = onChanged

  useEffect(() => {
    let live = true
    void (async () => {
      try { await store.init() } catch (e) { console.debug('[lingo] plus: store init did not complete', e) }
      const product: Promise<StoreProduct | null> = store.kind === 'none' ? Promise.resolve(null) : store.product(PLUS_SKU).catch(() => null)
      try {
        const [status, p] = await Promise.all([api<PlusStatus>('/iap/status'), product])
        if (live) dispatch({ type: 'loaded', status, storeKind: store.kind, product: p })
      } catch {
        if (live) setS({ phase: 'unavailable' })
      }
    })()
    return () => { live = false }
  }, [store, api, dispatch])

  // Back leaves the screen in every phase. A running purchase keeps going; Root's startup restore covers anything left over.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onBack(); return true })
    return () => sub.remove()
  }, [onBack])

  /** Feed a flow's events in order; tell Root when Plus may have changed. */
  const runFlow = (flow: typeof purchaseFlow) => {
    void flow(store, api).then((events) => {
      events.forEach(dispatch)
      if (events.some((e) => (e.type === 'verified' && e.result.plus) || (e.type === 'restored' && e.results.length > 0))) changed.current()
    })
  }
  const subscribe = () => { if (s.phase === 'offer' && s.price !== null) { dispatch({ type: 'subscribe' }); runFlow(purchaseFlow) } }
  const restore = () => { if (s.phase === 'offer' || s.phase === 'active') { dispatch({ type: 'restore' }); runFlow(restoreFlow) } }

  const btn = (label: string, aria: string, onPress: () => void, primary = false, preferred = false) => (
    <Focusable key={aria} label={aria} onPress={onPress} hasTVPreferredFocus={preferred}
      style={{ backgroundColor: primary ? tokens.color.interactive : tokens.color.surface2, paddingHorizontal: px(28), paddingVertical: px(16) }}>
      <T variant="body" color={primary ? tokens.color.ground : tokens.color.text}>{label}</T>
    </Focusable>
  )
  const back = (preferred: boolean) => btn(strings.plus.back, strings.plus.backLabel, onBack, false, preferred)
  const title = <T variant="display">{strings.plus.title}</T>

  let body: React.ReactNode
  switch (s.phase) {
    case 'loading':
      body = <>
        <T variant="body" accessibilityLiveRegion="polite">{strings.plus.loading}</T>
        <Row>{back(true)}</Row>
      </>
      break
    case 'unavailable':
    case 'demo':
      body = <>
        {title}
        <T variant="body">{s.phase === 'demo' ? strings.plus.demo : strings.plus.unavailable}</T>
        <Row>{back(true)}</Row>
      </>
      break
    case 'offer': {
      const note = s.note === 'retry' ? strings.plus.retry : s.note === 'restoreEmpty' ? strings.plus.restoreEmpty : null
      body = <>
        {title}
        <T variant="body">{strings.plus.body(caps.rate)}</T>
        <T variant="title">{s.price !== null ? strings.plus.price(s.price) : strings.plus.priceUnavailable}</T>
        {note ? <T variant="body" color={tokens.color.textSecondary} accessibilityLiveRegion="polite">{note}</T> : null}
        <Row>
          {s.price !== null ? btn(strings.plus.buy, strings.plus.subscribeLabel(s.price), subscribe, true, true) : null}
          {btn(strings.plus.restore, strings.plus.restoreLabel, restore, false, s.price === null)}
          {back(false)}
        </Row>
      </>
      break
    }
    case 'busy':
      body = <>
        {title}
        <T variant="body" accessibilityLiveRegion="polite">{strings.plus.busy[s.step]}</T>
        {/* Focus parks here: nothing to press while the store or the server is answering. */}
        <View focusable={false} style={{ height: px(76) }} />
      </>
      break
    case 'active': {
      const when = s.cancelsAt ? strings.plus.cancels(date(s.cancelsAt)) : s.renewsAt ? strings.plus.renews(date(s.renewsAt)) : null
      body = <>
        {title}
        <T variant="body">{strings.plus.active}</T>
        {when ? <T variant="body">{when}</T> : null}
        <T variant="body" color={tokens.color.textSecondary}>{strings.plus.cancelHow}</T>
        <Row>
          {btn(strings.plus.restore, strings.plus.restoreLabel, restore)}
          {back(true)}
        </Row>
      </>
      break
    }
  }
  return <View style={{ flex: 1, justifyContent: 'center', alignSelf: 'center', width: '100%', maxWidth: px(1100), gap: px(28) }}>{body}</View>
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: px(16) }}>{children}</View>
}
