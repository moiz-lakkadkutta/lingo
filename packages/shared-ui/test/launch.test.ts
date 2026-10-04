import type { Catalog } from '@lingo/contracts'
import type { LaunchIntent } from '@moizp/vega-media-kit'
import { catalogItems, createLaunchBus, launchUri, noLaunches, parseLaunchUri } from '../src/platform/launch'

const card = (slug: string, posterUrl: string | null = null) => ({ slug, title: `T ${slug}`, level: 'A2' as const, durationS: 60, posterUrl, resumeS: null, completed: false, attribution: '' })

describe('launch intents', () => {
  it('parseLaunchUri reads lingo://clip/<slug> and an optional t in seconds', () => {
    expect(parseLaunchUri('lingo://clip/der-zug')).toEqual({ itemId: 'der-zug', source: 'unknown' })
    expect(parseLaunchUri('lingo://clip/der-zug?t=30')).toEqual({ itemId: 'der-zug', positionS: 30, source: 'unknown' })
    expect(parseLaunchUri('lingo://clip/der-zug?t=12.5')).toEqual({ itemId: 'der-zug', positionS: 12.5, source: 'unknown' })
    expect(parseLaunchUri('lingo://clip/der-zug?x=1&t=7')).toEqual({ itemId: 'der-zug', positionS: 7, source: 'unknown' })
    expect(parseLaunchUri('lingo://clip/der-zug?t=soon')).toEqual({ itemId: 'der-zug', source: 'unknown' })
    expect(parseLaunchUri(launchUri('clip-01'))).toEqual({ itemId: 'clip-01', source: 'unknown' })
    expect(launchUri('clip-01')).toBe('lingo://clip/clip-01')
  })

  it('parseLaunchUri rejects other schemes, hosts and unsafe slugs', () => {
    for (const uri of [
      'https://clip/der-zug', 'lingo://video/der-zug', 'lingo://clip/', 'lingo://clip/Der-Zug', 'lingo://clip/../etc', 'lingo://clip/a/b',
      'lingo://clip/a%2Fb', 'lingo://clip/' + 'a'.repeat(81), 'lingo://clip/der zug', 'lingo:clip/der-zug', '', 'javascript:alert(1)',
    ]) expect(parseLaunchUri(uri), uri).toBeNull()
  })

  it('catalogItems dedupes slugs across rows in row order and builds lingo:// uris', () => {
    const c: Catalog = { continue: [card('b')], justRight: [card('a', 'https://cdn.example/a.jpg'), card('b')], harder: [card('c')], fresh: [card('a'), card('d')] }
    expect(catalogItems(c)).toEqual([
      { id: 'b', title: 'T b', durationS: 60, posterUrl: undefined, uri: 'lingo://clip/b' },
      { id: 'a', title: 'T a', durationS: 60, posterUrl: 'https://cdn.example/a.jpg', uri: 'lingo://clip/a' },
      { id: 'c', title: 'T c', durationS: 60, posterUrl: undefined, uri: 'lingo://clip/c' },
      { id: 'd', title: 'T d', durationS: 60, posterUrl: undefined, uri: 'lingo://clip/d' },
    ])
  })

  it('createLaunchBus delivers a launch emitted before the first subscriber exactly once', () => {
    const bus = createLaunchBus()
    const first: LaunchIntent = { itemId: 'old', source: 'unknown' }
    const cold: LaunchIntent = { itemId: 'cold', positionS: 30, source: 'voice' }
    bus.emit(first)
    bus.emit(cold) // newest wins
    const a = vi.fn()
    const unsub = bus.subscribe(a)
    expect(a.mock.calls).toEqual([[cold]])
    const b = vi.fn()
    bus.subscribe(b)
    expect(b).not.toHaveBeenCalled() // already delivered
    const warm: LaunchIntent = { itemId: 'warm', source: 'search' }
    bus.emit(warm)
    expect(a).toHaveBeenLastCalledWith(warm)
    expect(b).toHaveBeenLastCalledWith(warm)
    unsub()
    bus.emit(first)
    expect(a).toHaveBeenCalledTimes(2)
    expect(b).toHaveBeenCalledTimes(2)
    expect(typeof noLaunches.subscribe(() => {})).toBe('function')
  })
})
