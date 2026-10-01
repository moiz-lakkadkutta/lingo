import React from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import type { PlusStatus } from '@lingo/contracts'
import { Plus, type PlusProps } from '../src/screens/Plus'
import type { Api } from '../src/plus/flow'
import type { PlusStore, StoreProduct } from '../src/plus/types'
import { strings } from '../src/strings'

const is = (n: ReactTestInstance, host: string) => (n.type as unknown) === host
const textOf = (n: ReactTestInstance): string => [n.props.children].flat(Infinity).filter((c) => typeof c === 'string' || typeof c === 'number').join('')
const texts = (r: ReactTestRenderer) => r.root.findAll((n) => is(n, 'Text')).map(textOf)
const labels = (r: ReactTestRenderer) => r.root.findAll((n) => is(n, 'Pressable')).map((p) => p.props['aria-label'] as string)
const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }

const status = (over: Partial<PlusStatus> = {}): PlusStatus => ({ mode: 'iap', plus: false, sku: 'lingo.plus.monthly', renewsAt: null, cancelsAt: null, freeSavesPerDay: 20, savesToday: 0, ...over })
const store = (product: StoreProduct | null = { sku: 'lingo.plus.monthly', price: '2,99 €', title: 'Lingo Plus' }): PlusStore => ({
  kind: 'amazon-fireos', init: vi.fn(async () => {}), product: vi.fn(async () => product), purchase: vi.fn(async () => ({ kind: 'userCancelled' as const })),
  restore: vi.fn(async () => []), fulfil: vi.fn(async () => {}), dispose: vi.fn(),
})
const api = (s: PlusStatus): Api => (async (path: string) => { if (path === '/iap/status') return s; throw new Error(path) }) as Api
const show = async (over: Partial<PlusProps> = {}) => {
  const props: PlusProps = { store: store(), api: api(status()), caps: { rate: true, wordFocusIn: 'cue' }, onBack: vi.fn(), onChanged: vi.fn(), ...over }
  let r: ReactTestRenderer | undefined
  act(() => { r = create(<Plus {...props} />, { createNodeMock: () => ({}) }) })
  await flush()
  return r!
}

describe('Plus screen', () => {
  it('offer shows one sentence, the store price and three focusables with purpose labels', async () => {
    const r = await show()
    const t = texts(r)
    expect(t).toEqual([strings.plus.title, strings.plus.body(true), strings.plus.price('2,99 €'), strings.plus.buy, strings.plus.restore, strings.plus.back])
    expect(strings.plus.body(true).split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length).toBe(1)
    expect(labels(r)).toEqual([strings.plus.subscribeLabel('2,99 €'), strings.plus.restoreLabel, strings.plus.backLabel])
    const subscribe = r.root.find((n) => is(n, 'Pressable') && n.props['aria-label'] === strings.plus.subscribeLabel('2,99 €'))
    expect(subscribe.props.hasTVPreferredFocus).toBe(true)
  })

  it('the sentence omits slower playback where caps.rate is false', async () => {
    const r = await show({ caps: { rate: false, wordFocusIn: 'cue' } })
    expect(texts(r)).toContain(strings.plus.body(false))
    expect(strings.plus.body(false)).not.toMatch(/slower|0\.75/i)
    expect(strings.plus.body(true)).toMatch(/0\.75/)
  })

  it('hides Subscribe and says price unavailable when the store returns no product', async () => {
    const r = await show({ store: store(null) })
    expect(texts(r)).toContain(strings.plus.priceUnavailable)
    expect(labels(r)).toEqual([strings.plus.restoreLabel, strings.plus.backLabel])
    const failing = { ...store(), product: vi.fn(async () => { throw new Error('store') }) }
    const r2 = await show({ store: failing })
    expect(labels(r2)).toEqual([strings.plus.restoreLabel, strings.plus.backLabel])
  })

  it('active shows the cancel line and no Subscribe', async () => {
    const renewsAt = '2026-10-20T00:00:00.000Z'
    const r = await show({ api: api(status({ plus: true, renewsAt })) })
    const t = texts(r)
    expect(t).toContain(strings.plus.active)
    expect(t).toContain(strings.plus.cancelHow)
    expect(t).toContain(strings.plus.renews(new Date(renewsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })))
    expect(labels(r)).toEqual([strings.plus.restoreLabel, strings.plus.backLabel])
    const back = r.root.find((n) => is(n, 'Pressable') && n.props['aria-label'] === strings.plus.backLabel)
    expect(back.props.hasTVPreferredFocus).toBe(true)

    const demo = await show({ api: api(status({ mode: 'demo', plus: true })) })
    expect(texts(demo)).toContain(strings.plus.demo)
    expect(labels(demo)).toEqual([strings.plus.backLabel])
    const off = await show({ api: api(status({ mode: 'off' })) })
    expect(texts(off)).toContain(strings.plus.unavailable)
    const down = await show({ api: (async () => { throw new Error('offline') }) as Api })
    expect(texts(down)).toContain(strings.plus.unavailable)
    expect(labels(down)).toEqual([strings.plus.backLabel])
  })

  it('no Plus string contains "failed" or "wrong"', () => {
    const all: string[] = []
    const walk = (v: unknown): void => {
      if (typeof v === 'string') all.push(v)
      else if (typeof v === 'function') { all.push(String(v('2,99 €'))); all.push(String(v(true))); all.push(String(v(false))) }
      else if (v && typeof v === 'object') Object.values(v).forEach(walk)
    }
    walk(strings.plus)
    expect(all.length).toBeGreaterThan(15)
    for (const s of all) expect(s).not.toMatch(/failed|wrong/i)
  })
})
