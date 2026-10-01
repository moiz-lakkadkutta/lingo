import { createPressTracker, normalise } from '../src/remote/normalise'
import { createRemoteBus, noRemote } from '../src/remote/types'

describe('normalise', () => {
  it('eventKeyAction 0 is down, 1 is up, absent is down then up', () => {
    expect(normalise({ eventType: 'left', eventKeyAction: 0 })).toEqual([{ phase: 'down', key: 'left' }])
    expect(normalise({ eventType: 'left', eventKeyAction: 1 })).toEqual([{ phase: 'up', key: 'left' }])
    expect(normalise({ eventType: 'left' })).toEqual([{ phase: 'down', key: 'left' }, { phase: 'up', key: 'left' }])
  })
  it('names starting with long are dropped', () => {
    expect(normalise({ eventType: 'longLeft', eventKeyAction: 0 })).toEqual([])
    expect(normalise({ eventType: 'longSelect' })).toEqual([])
    expect(normalise({ eventType: 'focus' })).toEqual([])
  })
  it('maps react-native-tvos and Vega names through the kit (playPause, playpause, skip_forward, menu)', () => {
    expect(normalise({ eventType: 'playPause', eventKeyAction: 0 })).toEqual([{ phase: 'down', key: 'playPause' }])
    expect(normalise({ eventType: 'playpause', eventKeyAction: 0 })).toEqual([{ phase: 'down', key: 'playPause' }])
    expect(normalise({ eventType: 'skip_forward', eventKeyAction: 1 })).toEqual([{ phase: 'up', key: 'fastForward' }])
    expect(normalise({ eventType: 'skip_backward', eventKeyAction: 1 })).toEqual([{ phase: 'up', key: 'rewind' }])
    expect(normalise({ eventType: 'menu', eventKeyAction: 0 })).toEqual([{ phase: 'down', key: 'menu' }])
  })
})

describe('createPressTracker', () => {
  it('a release under longPressMs is a short press', () => {
    const t = createPressTracker(500)
    expect(t.down('left', 1000)).toBeNull()
    expect(t.down('left', 1100)).toBeNull()
    expect(t.up('left', 1499)).toEqual({ key: 'left', longPress: false, repeat: false })
    expect(t.up('right', 2000)).toEqual({ key: 'right', longPress: false, repeat: false })
  })
  it('a repeat past longPressMs fires one long press and the release then fires nothing', () => {
    const t = createPressTracker(500)
    t.down('left', 0)
    expect(t.down('left', 250)).toBeNull()
    expect(t.down('left', 500)).toEqual({ key: 'left', longPress: true, repeat: false })
    expect(t.down('left', 600)).toEqual({ key: 'left', longPress: true, repeat: true })
    expect(t.up('left', 700)).toBeNull()
    // state resets after release
    t.down('left', 1000)
    expect(t.up('left', 1100)).toEqual({ key: 'left', longPress: false, repeat: false })
  })
  it('a release past longPressMs without repeats fires a long press', () => {
    const t = createPressTracker(500)
    t.down('left', 0)
    expect(t.up('left', 800)).toEqual({ key: 'left', longPress: true, repeat: false })
    t.down('left', 0)
    expect(t.up('left', 500)).toEqual({ key: 'left', longPress: true, repeat: false }) // boundary: exactly longPressMs is long
  })
  it('keys are tracked independently', () => {
    const t = createPressTracker(500)
    t.down('left', 0)
    t.down('right', 400)
    expect(t.down('left', 600)).toEqual({ key: 'left', longPress: true, repeat: false })
    expect(t.up('right', 600)).toEqual({ key: 'right', longPress: false, repeat: false })
    expect(t.up('left', 700)).toBeNull()
  })
})

describe('remote bus', () => {
  it('createRemoteBus delivers to every subscriber and stops after unsubscribe', () => {
    const bus = createRemoteBus()
    const a: string[] = []
    const b: string[] = []
    const offA = bus.subscribe((e) => a.push(e.eventType))
    bus.subscribe((e) => b.push(e.eventType))
    bus.emit({ eventType: 'left', eventKeyAction: 0 })
    offA()
    bus.emit({ eventType: 'right' })
    expect(a).toEqual(['left'])
    expect(b).toEqual(['left', 'right'])
    const off = noRemote.subscribe(() => { throw new Error('never called') })
    expect(typeof off).toBe('function')
    off()
  })
})
