import React from 'react'
import { act } from 'react-test-renderer'
import type { LearnerDto } from '@lingo/contracts'
import { Root } from '../src/app/Root'
import { createRemoteBus } from '../src/remote/types'
import type { SessionTransport } from '../src/session/types'
import { strings } from '../src/strings'
import { card, catalog, clipReady, learner } from './fixtures'
import { byLabel, focus, is, labels, preferred, press, pressBack, render, texts } from './helpers'

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
