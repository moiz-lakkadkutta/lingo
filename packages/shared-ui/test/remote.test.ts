import type { RemoteEvent } from '@moizp/vega-media-kit'
import { createPressTracker, normalise } from '../src/remote/normalise'
import type { RawRemoteEvent } from '../src/remote/types'
import { createRemoteBus, noRemote } from '../src/remote/types'

describe('normalise', () => {
  it('eventKeyAction 0 is down, 1 is up, absent is down then up', () => {
    expect(normalise({ eventType: 'left', eventKeyAction: 0 })).toEqual([{ phase: 'down', key: 'left' }])
    expect(normalise({ eventType: 'left', eventKeyAction: 1 })).toEqual([{ phase: 'up', key: 'left' }])
    expect(normalise({ eventType: 'left' })).toEqual([{ phase: 'down', key: 'left' }, { phase: 'up', key: 'left' }])
  })
  it('react-native-tvos long<Key> names map to the base key, keep the action, and mark the down as held', () => {
    expect(normalise({ eventType: 'longLeft', eventKeyAction: 0 })).toEqual([{ phase: 'down', key: 'left', held: true }])
    expect(normalise({ eventType: 'longLeft', eventKeyAction: 1 })).toEqual([{ phase: 'up', key: 'left' }])
    expect(normalise({ eventType: 'longRight', eventKeyAction: 0 })).toEqual([{ phase: 'down', key: 'right', held: true }])
    expect(normalise({ eventType: 'longUp', eventKeyAction: 1 })).toEqual([{ phase: 'up', key: 'up' }])
    expect(normalise({ eventType: 'longDown', eventKeyAction: 0 })).toEqual([{ phase: 'down', key: 'down', held: true }])
    expect(normalise({ eventType: 'longSelect', eventKeyAction: 0 })).toEqual([{ phase: 'down', key: 'select', held: true }])
    expect(normalise({ eventType: 'longPlayPause', eventKeyAction: 1 })).toEqual([{ phase: 'up', key: 'playPause' }])
    expect(normalise({ eventType: 'longFastForward', eventKeyAction: 0 })).toEqual([{ phase: 'down', key: 'fastForward', held: true }])
  })
  it('only an absent eventKeyAction means down then up; -1 and other values are ignored', () => {
    expect(normalise({ eventType: 'left', eventKeyAction: -1 })).toEqual([])
    expect(normalise({ eventType: 'left', eventKeyAction: 2 })).toEqual([])
    expect(normalise({ eventType: 'focus', eventKeyAction: -1 })).toEqual([])
    expect(normalise({ eventType: 'blur' })).toEqual([])
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

/** Raw events → normalise → tracker, as useRemoteKeys wires them. */
function run(events: Array<[number, RawRemoteEvent]>, longPressMs = 500): RemoteEvent[] {
  const t = createPressTracker(longPressMs)
  const out: RemoteEvent[] = []
  for (const [now, raw] of events) {
    for (const n of normalise(raw)) {
      const ev = n.phase === 'down' ? t.down(n.key, now, n.held) : t.up(n.key, now)
      if (ev) out.push(ev)
    }
  }
  return out
}

describe('react-native-tvos on Android (ReactAndroidHWInputDeviceHelper)', () => {
  it('default build sends key-up only: a short press is a short press', () => {
    expect(run([[1000, { eventType: 'left', eventKeyAction: 1 }]])).toEqual([{ key: 'left', longPress: false, repeat: false }])
    expect(run([[1000, { eventType: 'playPause', eventKeyAction: 1 }]])).toEqual([{ key: 'playPause', longPress: false, repeat: false }])
  })
  it('default build: a held left (longLeft 0, then longLeft 1 at 500 ms or later) is one long press', () => {
    expect(run([
      [500, { eventType: 'longLeft', eventKeyAction: 0 }],
      [1100, { eventType: 'longLeft', eventKeyAction: 1 }],
    ])).toEqual([{ key: 'left', longPress: true, repeat: false }])
  })
  it('key-down on: left 0, longLeft 0, longLeft 1 is one long press; a short left after the hold is still short', () => {
    expect(run([
      [0, { eventType: 'left', eventKeyAction: 0 }],
      [500, { eventType: 'longLeft', eventKeyAction: 0 }],
      [900, { eventType: 'longLeft', eventKeyAction: 1 }],
      [2000, { eventType: 'left', eventKeyAction: 0 }],
      [2120, { eventType: 'left', eventKeyAction: 1 }],
    ])).toEqual([
      { key: 'left', longPress: true, repeat: false },
      { key: 'left', longPress: false, repeat: false },
    ])
  })
  it('key-down on: a short press (down then up) is a short press', () => {
    expect(run([
      [0, { eventType: 'right', eventKeyAction: 0 }],
      [90, { eventType: 'right', eventKeyAction: 1 }],
    ])).toEqual([{ key: 'right', longPress: false, repeat: false }])
  })
})

describe('createPressTracker with held downs', () => {
  it('a held down fires the long press at once, even before longPressMs from the first down', () => {
    const t = createPressTracker(500)
    expect(t.down('left', 0)).toBeNull()
    expect(t.down('left', 320, true)).toEqual({ key: 'left', longPress: true, repeat: false })
    expect(t.down('left', 400, true)).toEqual({ key: 'left', longPress: true, repeat: true })
    expect(t.up('left', 450)).toBeNull()
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
