import React from 'react'
import { act } from 'react-test-renderer'
import type { LearnerDto } from '@lingo/contracts'
import { Root } from '../src/app/Root'
import { createRemoteBus } from '../src/remote/types'
import { createLaunchBus } from '../src/platform/launch'
import type { SessionTransport } from '../src/session/types'
import type { PlusStore } from '../src/plus/types'
import { strings } from '../src/strings'
import { guardStore } from '../src/plus/guard'
import { tokens } from '../src/theme/tokens'
import { card, catalog, clipReady, learner } from './fixtures'
import { byLabel, flat, focus, is, labels, preferred, press, pressBack, render, textOf, texts } from './helpers'

vi.mock('../src/screens/Player', () => ({ Player: (p: object) => React.createElement('Player', p) }))

type Call = { method: string; path: string; body: unknown }
const ok = (data: unknown) => ({ status: 200, json: async () => ({ success: true, data }) })
function fakeServer(o: { me?: Partial<LearnerDto>; down?: boolean } = {}) {
  const calls: Call[] = []
  const state = { down: !!o.down, me: learner(o.me), progress: new Map<string, { positionS: number; completed: boolean }>() }
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace('http://api', '')
    const method = init?.method ?? 'GET'
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (state.down) throw new TypeError('Network request failed')
    if (path === '/me' && method === 'GET') return ok(state.me)
    if (path === '/me' && method === 'PUT') { state.me = { ...state.me, ...(JSON.parse(String(init!.body)) as object) }; return ok(state.me) }
    if (path === '/sessions') return ok({ code: 'ABC234', joinUrl: 'lingo://join/ABC234' })
    if (path.startsWith('/catalog')) return ok(catalog({ justRight: [card('zug'), card('bus')] }))
    if (path === '/clips/zug') { const p = state.progress.get('zug'); return ok(clipReady({ resumeS: p && !p.completed ? p.positionS : null, completed: !!p?.completed })) }
    if (path === '/me/progress') { const b = JSON.parse(String(init!.body)); state.progress.set(b.clipSlug, b); return ok(b) }
    if (path === '/me/level') return ok({ level: state.me.level, changed: null })
    if (path === '/me/library') return ok([])
    return { status: 404, json: async () => ({ success: false, error: { code: 'NOT_FOUND', message: path } }) }
  })
  return { calls, state, fetchImpl }
}
const transport = (): SessionTransport => ({ connect: vi.fn(), onConnect: () => () => {}, join: vi.fn(), quizStart: vi.fn(), on: () => () => {}, disconnect: vi.fn() })
const settle = async () => { for (let i = 0; i < 8; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
async function boot(o: Parameters<typeof fakeServer>[0] = {}) {
  const srv = fakeServer(o)
  vi.stubGlobal('fetch', srv.fetchImpl)
  const remote = createRemoteBus()
  const r = render(<Root apiBaseUrl="http://api" scale={1} deviceId="tv-1" transport={transport()} remote={remote} />)
  await settle()
  return { r, srv, remote }
}
afterEach(() => { vi.unstubAllGlobals() })
const zugCard = strings.home.cardLabel('Title zug', 'A2', '3 min')

describe('Root', () => {
  it('QA #3: while /me loads, a visible centred Loading label shows on the ground colour', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    const r = render(<Root apiBaseUrl="http://api" scale={1} deviceId="tv-1" transport={transport()} remote={createRemoteBus()} />)
    const label = r.root.find((n) => is(n, 'Text') && textOf(n) === strings.common.loading)
    expect(flat(label.props.style).opacity).toBeUndefined()
    expect(flat(label.props.style).color).toBe(tokens.color.textSecondary)
  })
  it('H1: every request carries the per-install deviceId the entry passed', async () => {
    const { srv } = await boot()
    const sent = srv.fetchImpl.mock.calls.map((c) => ((c[1] as RequestInit | undefined)?.headers as Record<string, string>)['x-device-id'])
    expect(sent.length).toBeGreaterThan(0)
    expect(new Set(sent)).toEqual(new Set(['tv-1']))
  })
  it('boots into first run when firstRunDone is false and into Home otherwise', async () => {
    const fr = await boot({ me: { firstRunDone: false } })
    expect(texts(fr.r)).toContain(strings.firstRun.learning)
    const home = await boot()
    expect(labels(home.r)).toContain(zugCard)
    expect(preferred(home.r).map((p) => p.props['aria-label'])).toEqual([strings.home.watchLabel('Title zug')])
    expect(home.srv.calls.find((c) => c.path.startsWith('/catalog'))!.path).toBe('/catalog?learning=de&level=A2')
  })
  it('shows the offline message with Retry when /me cannot be reached, and Retry boots again', async () => {
    const { r, srv } = await boot({ down: true })
    expect(texts(r)).toContain(strings.offline)
    expect(preferred(r).map((p) => p.props['aria-label'])).toEqual([strings.common.retry])
    srv.state.down = false
    await press(byLabel(r, strings.common.retry))
    await settle()
    expect(labels(r)).toContain(zugCard)
  })
  it('Back pops the stack and is unhandled on Home', async () => {
    const { r } = await boot()
    await press(byLabel(r, zugCard))
    await settle()
    expect(texts(r)).toContain(strings.clip.wordsYoullMeet.toUpperCase())
    expect(pressBack()).toBe(true)
    await settle()
    expect(labels(r)).toContain(zugCard)
    // nothing on Home was focused before, so hero Watch is preferred again
    expect(preferred(r).map((p) => p.props['aria-label'])).toEqual([strings.home.watchLabel('Title zug')])
    expect(pressBack()).toBe(false)
  })
  it('leaving the player saves progress and returns to the clip', async () => {
    const { r, srv } = await boot()
    focus(byLabel(r, zugCard))
    await press(byLabel(r, zugCard))
    await settle()
    await press(byLabel(r, strings.home.watchLabel('Title zug')))
    const player = r.root.find((n) => (n.type as unknown) === 'Player')
    expect(player.props.clip.slug).toBe('zug')
    expect(player.props.challenge).toBe(false)
    await act(async () => { player.props.onBack(30) })
    await settle()
    expect(srv.calls.filter((c) => c.path === '/me/progress').map((c) => c.body)).toEqual([{ clipSlug: 'zug', positionS: 30, completed: false }])
    expect(texts(r)).toContain(strings.home.resume('0:30'))
    expect(pressBack()).toBe(true)
    await settle()
    expect(preferred(r).map((p) => p.props['aria-label'])).toEqual([zugCard])
  })
  it('PR2-B-M1: leaving the Player for Plus at 90 s saves the position, and Back from Plus resumes the clip there', async () => {
    const { r, srv } = await boot()
    await press(byLabel(r, strings.home.watchLabel('Title zug')))
    await settle()
    const first = r.root.find((n) => (n.type as unknown) === 'Player')
    expect(first.props.clip.resumeS).toBeNull()
    await act(async () => { first.props.onPlus(90) })
    await settle()
    expect(texts(r)).toContain(strings.plus.title)
    expect(srv.calls.filter((c) => c.path === '/me/progress').map((c) => c.body)).toEqual([{ clipSlug: 'zug', positionS: 90, completed: false }])
    expect(pressBack()).toBe(true)
    await settle()
    const again = r.root.find((n) => (n.type as unknown) === 'Player')
    expect(again.props.clip.slug).toBe('zug')
    expect(again.props.clip.resumeS).toBe(90)
  })
  it('the end of a clip saves completed progress and replaces the player with the summary', async () => {
    const { r, srv } = await boot()
    await press(byLabel(r, strings.home.watchLabel('Title zug')))
    await settle()
    const player = r.root.find((n) => (n.type as unknown) === 'Player')
    await act(async () => { expect(await player.props.onSave('h1')).toBe('error') }) // the fake server has no POST /me/words
    await act(async () => { player.props.onEnd() })
    await settle()
    expect(srv.calls.filter((c) => c.path === '/me/progress').map((c) => c.body)).toEqual([{ clipSlug: 'zug', positionS: 150, completed: true }])
    expect(texts(r)).toContain(strings.summary.none)
    expect(preferred(r).map((p) => p.props['aria-label'])).toEqual([strings.summary.quizTv])
    expect(pressBack()).toBe(true) // Summary replaced the player: Back returns to Home
    await settle()
    expect(labels(r)).toContain(zugCard)
  })
  it('PUT /me is sent with only the changed setting', async () => {
    const { r, srv, remote } = await boot()
    await press(byLabel(r, strings.rail.label(strings.rail.settingsLabel)))
    await settle()
    expect(texts(r)).toContain(strings.settings.title)
    focus(byLabel(r, strings.settings.rowLabel(strings.settings.cueSize, '100 %')))
    act(() => remote.emit({ eventType: 'right' }))
    await settle()
    expect(srv.calls.filter((c) => c.path === '/me' && c.method === 'PUT').map((c) => c.body)).toEqual([{ cueScale: 1.25 }])
    expect(labels(r)).toContain(strings.settings.rowLabel(strings.settings.cueSize, '125 %'))
    focus(byLabel(r, strings.settings.rowLabel(strings.settings.level, 'about A2')))
    act(() => remote.emit({ eventType: 'right' }))
    await settle()
    expect(srv.calls.filter((c) => c.path === '/me/level').map((c) => c.body)).toEqual([{ source: 'settings', level: 'B1' }])
    expect(srv.calls.filter((c) => c.path === '/me' && c.method === 'PUT')).toHaveLength(1)
    expect(r.root.findAll((n) => is(n, 'Text') && n.props.children === strings.common.saveError)).toHaveLength(0)
  })
})

describe('Root · launch position (LING-005 L6, review-007 L8)', () => {
  async function bootLaunch(progress?: number) {
    const srv = fakeServer()
    if (progress !== undefined) srv.state.progress.set('zug', { positionS: progress, completed: false })
    vi.stubGlobal('fetch', srv.fetchImpl)
    const launches = createLaunchBus()
    const r = render(<Root apiBaseUrl="http://api" scale={1} deviceId="tv-1" transport={transport()} remote={createRemoteBus()} launches={launches} />)
    await settle()
    return { r, srv, launches }
  }
  const player = (r: ReturnType<typeof render>) => r.root.find((n) => (n.type as unknown) === 'Player')

  it('a deep link with a position starts the Player there, even over server progress', async () => {
    const { r, launches } = await bootLaunch(30)
    act(() => launches.emit({ itemId: 'zug', positionS: 60, source: 'unknown' }))
    await settle()
    expect(player(r).props.clip.slug).toBe('zug')
    expect(player(r).props.startS).toBe(60)
  })
  it('a position past the end falls back to server progress; none at all starts at 0', async () => {
    const a = await bootLaunch(30)
    act(() => a.launches.emit({ itemId: 'zug', positionS: 999999999, source: 'unknown' }))
    await settle()
    expect(player(a.r).props.startS).toBe(30)
    const b = await bootLaunch()
    act(() => b.launches.emit({ itemId: 'zug', source: 'unknown' }))
    await settle()
    expect(player(b.r).props.startS).toBe(0)
  })
  it('the launch position applies once: after Plus and Back the Player resumes where the learner left it', async () => {
    const { r, launches } = await bootLaunch()
    act(() => launches.emit({ itemId: 'zug', positionS: 60, source: 'unknown' }))
    await settle()
    await act(async () => { player(r).props.onPlus(90) })
    await settle()
    expect(texts(r)).toContain(strings.plus.title)
    expect(pressBack()).toBe(true)
    await settle()
    expect(player(r).props.startS).toBe(90)
  })
  it('Watch from Home starts at the server resume position (the clip\'s resumeS)', async () => {
    const { r } = await bootLaunch(30)
    await press(byLabel(r, strings.home.watchLabel('Title zug')))
    await settle()
    expect(player(r).props.startS).toBe(30)
  })
})

describe('Root · clip cache (review-005 M3)', () => {
  const clipFetches = (srv: ReturnType<typeof fakeServer>) => srv.fetchImpl.mock.calls
    .filter((c) => String(c[0]).endsWith('/clips/zug'))
    .map((c) => ((c[1] as RequestInit | undefined)?.headers as Record<string, string>)['x-native'])
  const settingsRow = (r: ReturnType<typeof render>, name: string) => r.root.find((n) => is(n, 'Pressable') && String(n.props['aria-label']).startsWith(`${name}: `))
  async function openClipThenSettings(o: Parameters<typeof boot>[0] = {}) {
    const b = await boot(o)
    await press(byLabel(b.r, zugCard)) // Clip fetches and caches zug for (de, en, A2)
    await settle()
    expect(pressBack()).toBe(true)
    await settle()
    await press(byLabel(b.r, strings.rail.label(strings.rail.settingsLabel)))
    await settle()
    return b
  }
  it('M3: after "I speak" changes, Watch refetches the clip with the new native language instead of playing the cached lines', async () => {
    // Learning de, the only supported "I speak" is en (QA #15); a stored tr moves onto it.
    const { r, srv, remote } = await openClipThenSettings({ me: { native: 'tr' } })
    expect(clipFetches(srv)).toEqual(['tr'])
    focus(settingsRow(r, strings.settings.native))
    act(() => remote.emit({ eventType: 'right' }))
    await settle()
    const native = (srv.calls.find((c) => c.path === '/me' && c.method === 'PUT')!.body as { native: string }).native
    expect(native).toBe('en')
    expect(r.root.findAll((n) => is(n, 'Text') && n.props.children === strings.settings.saved)).toHaveLength(1) // QA #5
    expect(pressBack()).toBe(true)
    await settle()
    await press(byLabel(r, strings.home.watchLabel('Title zug')))
    await settle()
    expect(clipFetches(srv)).toEqual(['tr', native])
    expect(r.root.find((n) => (n.type as unknown) === 'Player').props.clip.slug).toBe('zug')
  })
  it('M3: after a level change, Watch refetches the clip (highlights follow the level); without a change the cache is used', async () => {
    const { r, srv, remote } = await openClipThenSettings()
    expect(pressBack()).toBe(true)
    await settle()
    await press(byLabel(r, strings.home.watchLabel('Title zug')))
    await settle()
    expect(clipFetches(srv)).toHaveLength(1) // same context: cached
    expect(pressBack()).toBe(true) // the mocked Player has no Back handler; Root pops
    await settle()
    await press(byLabel(r, strings.rail.label(strings.rail.settingsLabel)))
    await settle()
    focus(settingsRow(r, strings.settings.level))
    act(() => remote.emit({ eventType: 'right' }))
    await settle()
    expect(pressBack()).toBe(true)
    await settle()
    await press(byLabel(r, strings.home.watchLabel('Title zug')))
    await settle()
    expect(clipFetches(srv)).toHaveLength(2)
  })
})

describe('Root · Lingo Plus (LING-007 wiring)', () => {
  const status = (plus: boolean) => ({ mode: 'iap', plus, sku: 'lingo.plus.monthly', renewsAt: null, cancelsAt: null, freeSavesPerDay: 20, savesToday: 0 })
  function fakeStore(log: string[]): PlusStore {
    return {
      kind: 'amazon-fireos',
      init: async () => { log.push('init') },
      product: async (sku) => ({ sku, price: '2,99 €', title: 'Lingo Plus' }),
      purchase: async () => ({ kind: 'userCancelled' }),
      restore: async () => { log.push('restore'); return [{ receiptId: 'r1', userId: 'u1', sku: 'lingo.plus.monthly', termSku: null, cancelled: false }] },
      fulfil: async (id) => { log.push(`fulfil:${id}`) },
      dispose: () => {},
    }
  }
  async function bootPlus(makeStore: (log: string[]) => PlusStore = fakeStore) {
    const srv = fakeServer()
    let entitled = false
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.replace('http://api', '')
      if (path === '/iap/status') { srv.calls.push({ method: 'GET', path, body: undefined }); return ok(status(entitled)) }
      if (path === '/iap/verify') { srv.calls.push({ method: 'POST', path, body: JSON.parse(String(init!.body)) }); entitled = true; srv.state.me = { ...srv.state.me, plus: true }; return ok({ plus: true, outcome: 'verified', fulfil: true }) }
      return srv.fetchImpl(url, init)
    })
    vi.stubGlobal('fetch', fetchImpl)
    const log: string[] = []
    const store = makeStore(log)
    const r = render(<Root apiBaseUrl="http://api" scale={1} deviceId="tv-1" transport={transport()} remote={createRemoteBus()} plusStore={store} />)
    await settle()
    return { r, srv, log, store }
  }

  it('restores once on startup in iap mode, fulfils after verify and re-reads /me', async () => {
    const { r, srv, log } = await bootPlus()
    expect(log).toEqual(['init', 'restore', 'fulfil:r1'])
    expect(srv.calls.filter((c) => c.path === '/iap/verify').map((c) => c.body)).toEqual([{ store: 'amazon-fireos', receiptId: 'r1', userId: 'u1', sku: 'lingo.plus.monthly' }])
    expect(srv.calls.filter((c) => c.path === '/me' && c.method === 'GET')).toHaveLength(2) // boot + refresh after the restore
    // Re-renders (navigation) never run the restore again.
    await press(byLabel(r, zugCard))
    await settle()
    expect(pressBack()).toBe(true)
    await settle()
    expect(log.filter((x) => x === 'restore')).toHaveLength(1)
    expect(srv.calls.filter((c) => c.path === '/iap/status')).toHaveLength(1)
  })

  it('the rail Plus entry opens the Plus screen, and Back returns Home', async () => {
    const { r } = await bootPlus()
    await press(byLabel(r, strings.rail.label(strings.rail.plusLabel)))
    await settle()
    expect(texts(r)).toContain(strings.plus.title)
    expect(texts(r)).toContain(strings.plus.active) // the startup restore made this learner entitled
    expect(labels(r)).toContain(strings.plus.backLabel)
    await press(byLabel(r, strings.plus.backLabel))
    await settle()
    expect(labels(r)).toContain(zugCard)
  })

  it('QA #14: a store that cannot connect is tried once, stays quiet, leaves Home usable and Plus gated', async () => {
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    const failing = (log: string[]) => guardStore({ ...fakeStore(log), init: async () => { log.push('init'); throw new Error('Failed to initialize billing connection') } })
    const { r, srv, log } = await bootPlus(failing)
    expect(log).toEqual(['init'])
    expect(srv.calls.some((c) => c.path === '/iap/verify')).toBe(false)
    expect(labels(r)).toContain(zugCard)
    await press(byLabel(r, strings.rail.label(strings.rail.plusLabel)))
    await settle()
    expect(texts(r)).toContain(strings.plus.title)
    expect(texts(r)).not.toContain(strings.plus.active)
    expect(log).toEqual(['init']) // the Plus screen does not retry the connection
    vi.restoreAllMocks()
  })

  it('without a store (noStore) there is no startup restore and no /iap/status call', async () => {
    const { srv } = await boot()
    expect(srv.calls.some((c) => c.path.startsWith('/iap'))).toBe(false)
  })
})
