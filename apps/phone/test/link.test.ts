import { EventEmitter } from 'node:events'
import { createPhoneLink, type Connect, type LinkHandlers } from '../src/lib/link'
import { saved } from './fixtures'

/** A Socket.IO client stand-in: `emit` is a spy (client → server); `fire` plays a server event or a transport event. */
class FakeSocket extends EventEmitter {
  connected = false
  sent = vi.fn()
  disconnect = vi.fn(() => { this.connected = false; this.fire('disconnect') })
  constructor() { super(); (this as unknown as { emit: unknown }).emit = this.sent }
  fire(event: string, ...args: unknown[]) { if (event === 'connect') this.connected = true; return EventEmitter.prototype.emit.call(this, event, ...args) }
  drop() { this.connected = false; this.fire('disconnect') }
}
const setup = () => {
  const sockets: FakeSocket[] = []
  const connect = vi.fn(() => { const s = new FakeSocket(); sockets.push(s); return s }) as unknown as Connect
  const h: { [K in keyof LinkHandlers]: ReturnType<typeof vi.fn> } = {
    onJoined: vi.fn(), onRefused: vi.fn(), onTransport: vi.fn(), onUnreachable: vi.fn(), onWordSaved: vi.fn(), onQuizStart: vi.fn(),
  }
  const link = createPhoneLink(() => 'http://lan:4000', h as unknown as LinkHandlers, connect)
  return { sockets, connect, h, link }
}

describe('phone link', () => {
  it('emits join with code, role phone and the device name on connect and again on every reconnect', () => {
    const { sockets, link, connect } = setup()
    link.join('ABC234', '  Pixel 8  ')
    expect(connect).toHaveBeenCalledWith('http://lan:4000')
    const s = sockets[0]!
    s.fire('connect')
    expect(s.sent).toHaveBeenLastCalledWith('join', { code: 'ABC234', role: 'phone', deviceName: 'Pixel 8' })
    s.drop(); s.fire('connect')
    expect(s.sent.mock.calls.filter((c) => c[0] === 'join')).toHaveLength(2)
  })
  it('a second join closes the first socket', () => {
    const { sockets, link, h } = setup()
    link.join('ABC234'); link.join('XYZ789')
    expect(sockets).toHaveLength(2)
    expect(sockets[0]!.disconnect).toHaveBeenCalled()
    expect(sockets[1]!.disconnect).not.toHaveBeenCalled()
    expect(h.onTransport).not.toHaveBeenCalledWith(false) // the old socket's events are detached
  })
  it('phone:connected for our code calls onJoined', () => {
    const { sockets, link, h } = setup()
    link.join('ABC234'); const s = sockets[0]!; s.fire('connect')
    s.fire('phone:connected', { code: 'ZZZZZZ', phoneName: 'x' })
    expect(h.onJoined).not.toHaveBeenCalled()
    s.fire('phone:connected', { code: 'ABC234', phoneName: 'Test phone' })
    expect(h.onJoined).toHaveBeenCalledTimes(1)
  })
  it('session:error closes the socket and calls onRefused', () => {
    const { sockets, link, h } = setup()
    link.join('ABC234'); const s = sockets[0]!; s.fire('connect')
    const e = { code: 'UNKNOWN_CODE', message: 'No TV with that code' }
    s.fire('session:error', e)
    expect(s.disconnect).toHaveBeenCalled()
    expect(h.onRefused).toHaveBeenCalledWith(e)
    expect(s.disconnect.mock.invocationCallOrder[0]!).toBeLessThan(h.onRefused.mock.invocationCallOrder[0]!)
  })
  it('connect_error before the first connect calls onUnreachable once', () => {
    const { sockets, link, h } = setup()
    link.join('ABC234'); const s = sockets[0]!
    s.fire('connect_error', new Error('xhr poll error')); s.fire('connect_error', new Error('again'))
    expect(h.onUnreachable).toHaveBeenCalledTimes(1)
    s.fire('connect'); s.drop(); s.fire('connect_error', new Error('later'))
    expect(h.onUnreachable).toHaveBeenCalledTimes(1)
    expect(h.onTransport.mock.calls).toEqual([[true], [false]])
  })
  it('word:saved and quiz:start reach their handlers', () => {
    const { sockets, link, h } = setup()
    link.join('ABC234'); const s = sockets[0]!; s.fire('connect')
    const w = saved()
    s.fire('word:saved', w); s.fire('quiz:start', { code: 'ABC234', clipSlug: 'am-bahnhof' })
    expect(h.onWordSaved).toHaveBeenCalledWith(w)
    expect(h.onQuizStart).toHaveBeenCalledWith({ code: 'ABC234', clipSlug: 'am-bahnhof' })
  })
  it('sendQuizResult emits quiz:result only when connected and joined', () => {
    const { sockets, link } = setup()
    expect(link.sendQuizResult(1, 2)).toBe(false) // no socket
    link.join('ABC234'); const s = sockets[0]!
    expect(link.sendQuizResult(1, 2)).toBe(false) // not connected
    s.fire('connect')
    expect(link.sendQuizResult(1, 2)).toBe(false) // connected, not joined
    s.fire('phone:connected', { code: 'ABC234', phoneName: 'Test phone' })
    expect(link.sendQuizResult(2, 3)).toBe(true)
    expect(s.sent).toHaveBeenLastCalledWith('quiz:result', { code: 'ABC234', correct: 2, total: 3 })
    s.drop()
    expect(link.sendQuizResult(2, 3)).toBe(false)
    link.leave()
    expect(link.sendQuizResult(2, 3)).toBe(false)
  })
})
