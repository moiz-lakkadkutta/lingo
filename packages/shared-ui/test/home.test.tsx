import React from 'react'
import type { Catalog } from '@lingo/contracts'
import type { Resource } from '../src/data/resource'
import { Home, type HomeProps } from '../src/screens/Home'
import { strings } from '../src/strings'
import { card, catalog, learner } from './fixtures'
import { byLabel, focus, is, labels, preferred, pressables, render, texts } from './helpers'

const full = catalog({ continue: [card('c1', { resumeS: 30 })], justRight: [card('a'), card('b')], harder: [card('h', { level: 'B1' })], fresh: [card('f')] })
const props = (catalogR: Resource<Catalog>, over: Partial<HomeProps> = {}): HomeProps => ({
  catalog: catalogR, learner: learner(), onReload: vi.fn(), onWatch: vi.fn(), onOpen: vi.fn(), onRail: vi.fn(), onSettings: vi.fn(), onFocusId: vi.fn(), ...over,
})
const heroWatch = (title: string) => strings.home.watchLabel(title)

describe('Home', () => {
  it('shows skeletons and nothing focusable while the catalog loads', () => {
    const r = render(<Home {...props({ state: 'loading' }, { })} />)
    expect(pressables(r)).toHaveLength(0) // not even the rail: the hero Watch must be the first focusable to mount
    expect(preferred(r)).toHaveLength(0)
    expect(r.root.findAll((n) => n.props.accessibilityElementsHidden === true && is(n, 'View')).length).toBeGreaterThan(2)
    const live = r.root.find((n) => is(n, 'Text') && n.props.accessibilityLiveRegion === 'polite')
    expect(texts(live)).toEqual([strings.home.loading])
  })
  it('gives preferred focus to hero Watch by default and to the remembered card when it is on screen', () => {
    const r = render(<Home {...props({ state: 'ready', data: full })} />)
    expect(preferred(r).map((p) => p.props['aria-label'])).toEqual([heroWatch('Title a')])
    const m = render(<Home {...props({ state: 'ready', data: full }, { initialFocus: 'card:fresh:f' })} />)
    expect(preferred(m).map((p) => p.props['aria-label'])).toEqual([strings.home.cardLabel('Title f', 'A2', '3 min')])
    const gone = render(<Home {...props({ state: 'ready', data: full }, { initialFocus: 'card:fresh:zzz' })} />)
    expect(preferred(gone).map((p) => p.props['aria-label'])).toEqual([heroWatch('Title a')])
  })
  it('hides empty rows and shows the empty message with a Settings action when there are no clips', () => {
    const r = render(<Home {...props({ state: 'ready', data: catalog({ justRight: [card('a')] }) })} />)
    const t = texts(r)
    expect(t).toContain(strings.home.justRight('A2').toUpperCase())
    expect(t).not.toContain(strings.home.continue.toUpperCase())
    expect(t).not.toContain(strings.home.fresh.toUpperCase())
    const onSettings = vi.fn()
    const e = render(<Home {...props({ state: 'ready', data: catalog() }, { onSettings })} />)
    expect(texts(e)).toContain(strings.home.empty)
    expect(preferred(e).map((p) => p.props['aria-label'])).toEqual([strings.home.emptyAction])
    byLabel(e, strings.home.emptyAction).props.onPress()
    expect(onSettings).toHaveBeenCalled()
  })
  it('shows the offline message with Retry when loading fails with no data', () => {
    const onReload = vi.fn()
    const r = render(<Home {...props({ state: 'error', error: 'offline' }, { onReload })} />)
    expect(texts(r)).toContain(strings.offline)
    expect(preferred(r).map((p) => p.props['aria-label'])).toEqual([strings.common.retry])
    byLabel(r, strings.common.retry).props.onPress()
    expect(onReload).toHaveBeenCalled()
    expect(texts(render(<Home {...props({ state: 'error', error: 'server' })} />))).toContain(strings.common.error)
  })
  it('keeps showing stale rows when a reload fails', () => {
    const r = render(<Home {...props({ state: 'error', error: 'offline', data: full })} />)
    expect(texts(r)).not.toContain(strings.offline)
    expect(labels(r)).toContain(strings.home.cardLabel('Title b', 'A2', '3 min'))
  })
  it('reports the focused id for focus memory', () => {
    const onFocusId = vi.fn()
    const onOpen = vi.fn()
    const r = render(<Home {...props({ state: 'ready', data: full }, { onFocusId, onOpen })} />)
    focus(byLabel(r, strings.home.cardLabel('Title h', 'B1', '3 min')))
    expect(onFocusId).toHaveBeenLastCalledWith('card:harder:h')
    focus(byLabel(r, heroWatch('Title a')))
    expect(onFocusId).toHaveBeenLastCalledWith('hero:watch')
    focus(byLabel(r, strings.rail.label(strings.rail.settingsLabel)))
    expect(onFocusId).toHaveBeenLastCalledWith('rail:settings')
    byLabel(r, strings.home.cardLabel('Title h', 'B1', '3 min')).props.onPress()
    expect(onOpen).toHaveBeenCalledWith('h')
    // first cards and hero Watch point ◄ at the rail; rail items point ► at hero Watch
    expect(byLabel(r, heroWatch('Title a')).props.nextFocusLeft).toBe(1)
    expect(byLabel(r, strings.home.cardLabel('Title c1', 'A2', '3 min')).props.nextFocusLeft).toBe(1)
    expect(byLabel(r, strings.home.cardLabel('Title b', 'A2', '3 min')).props.nextFocusLeft).toBeUndefined()
    expect(byLabel(r, strings.rail.label(strings.rail.reviewLabel)).props.nextFocusRight).toBe(1)
  })
  it('Watch shows Resume from m:ss for a started hero', () => {
    const onWatch = vi.fn()
    const started = catalog({ justRight: [card('s', { resumeS: 65 })] })
    const r = render(<Home {...props({ state: 'ready', data: started }, { onWatch })} />)
    expect(texts(r)).toContain(strings.home.resume('1:05'))
    const w = byLabel(r, strings.home.resumeLabel('Title s', '1:05'))
    w.props.onPress()
    expect(onWatch).toHaveBeenCalledWith(started.justRight[0])
  })
})
