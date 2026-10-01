import { createTransportDeduper, transportToKey } from '../src/platform/transport'

describe('media transport', () => {
  it('transportToKey maps play, pause, toggle, seek and stop and ignores next and previous', () => {
    expect(transportToKey('play')).toBe('play')
    expect(transportToKey('pause')).toBe('pause')
    expect(transportToKey('togglePlayPause')).toBe('playPause')
    expect(transportToKey('seekForward')).toBe('fastForward')
    expect(transportToKey('seekBackward')).toBe('rewind')
    expect(transportToKey('stop')).toBe('back')
    expect(transportToKey('next')).toBeNull()
    expect(transportToKey('previous')).toBeNull()
  })

  it('the deduper drops a transport that follows the same remote key within the window and accepts it after', () => {
    const d = createTransportDeduper()
    d.sawKey('playPause', 1000)
    expect(d.accept('playPause', 1100)).toBe(false)
    expect(d.accept('playPause', 1300)).toBe(false)
    expect(d.accept('playPause', 1301)).toBe(true)
    expect(d.accept('fastForward', 1100)).toBe(true) // a different key is not a duplicate
    const short = createTransportDeduper(50)
    short.sawKey('rewind', 0)
    expect(short.accept('rewind', 40)).toBe(false)
    expect(short.accept('rewind', 60)).toBe(true)
    expect(createTransportDeduper().accept('play', 0)).toBe(true) // never seen as a key
  })
})
