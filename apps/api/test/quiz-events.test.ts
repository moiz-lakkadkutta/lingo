import type http from 'node:http'
import { randomBytes } from 'node:crypto'
import request from 'supertest'
import { io as connect, type Socket } from 'socket.io-client'
import { SessionDto } from '@lingo/contracts'
import type { ClientToServerEvents, ServerToClientEvents } from '@lingo/contracts'
import { db } from '../src/lib/db'
import { createServer, type LingoIo } from '../src/server'

// Harness as in realtime.test.ts. quiz:start / quiz:result go to the room except the sender, and only from a socket that joined it.
type Client = Socket<ServerToClientEvents, ClientToServerEvents>
const rnd = () => randomBytes(4).toString('hex')

let server: http.Server
let io: LingoIo
let base = ''
const clients: Client[] = []

const listen = (s: http.Server) => new Promise<number>((resolve) => s.listen(0, '127.0.0.1', () => resolve((s.address() as { port: number }).port)))
const client = (): Client => { const c: Client = connect(base, { transports: ['websocket'], forceNew: true }); clients.push(c); return c }
const once = <E extends keyof ServerToClientEvents>(s: Client, event: E, ms = 1000) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((resolve, reject) => {
    const t = setTimeout(() => { s.off(event, h as never); reject(new Error(`timeout waiting for ${event}`)) }, ms)
    const h = (p: Parameters<ServerToClientEvents[E]>[0]) => { clearTimeout(t); resolve(p) }
    s.once(event, h as never)
  })
/** Resolves true if the event arrives within ms, false otherwise. */
const arrives = <E extends keyof ServerToClientEvents>(s: Client, event: E, ms = 300) => once(s, event, ms).then(() => true, () => false)
const connected = (s: Client) => new Promise<void>((resolve) => (s.connected ? resolve() : s.once('connect', () => resolve())))
const session = async () => SessionDto.parse((await request(server).post('/sessions').set('x-device-id', 'test-l6q-' + rnd())).body.data).code
/** A TV and a phone in the same room. */
const pair = async () => {
  const code = await session()
  const tv = client(); await connected(tv)
  const state = once(tv, 'session:state'); tv.emit('join', { code, role: 'tv' }); await state
  const phone = client(); await connected(phone)
  const joined = once(phone, 'phone:connected'); phone.emit('join', { code, role: 'phone', deviceName: 'Pixel 8' }); await joined
  return { code, tv, phone }
}

beforeAll(async () => {
  const s = createServer(); server = s.server; io = s.io
  base = `http://127.0.0.1:${await listen(server)}`
}, 30_000)

afterAll(async () => {
  for (const c of clients) c.disconnect()
  await db.learner.deleteMany({ where: { deviceId: { startsWith: 'test-l6q-' } } })
  await new Promise<void>((resolve) => io.close(() => resolve()))
  await db.$disconnect()
}, 30_000)

describe('quiz events', () => {
  it('quiz:start from the TV reaches the phone with the clip slug', async () => {
    const { code, tv, phone } = await pair()
    const got = once(phone, 'quiz:start')
    tv.emit('quiz:start', { code, clipSlug: 'am-bahnhof' })
    expect(await got).toEqual({ code, clipSlug: 'am-bahnhof' })
  })
  it('quiz:start is not echoed to the TV that sent it', async () => {
    const { code, tv, phone } = await pair()
    const echo = arrives(tv, 'quiz:start')
    const got = once(phone, 'quiz:start')
    tv.emit('quiz:start', { code })
    expect(await got).toEqual({ code, clipSlug: null })
    expect(await echo).toBe(false)
  })
  it('quiz:result from the phone reaches the TV', async () => {
    const { code, tv, phone } = await pair()
    const got = once(tv, 'quiz:result')
    phone.emit('quiz:result', { code, correct: 2, total: 3 })
    expect(await got).toEqual({ code, correct: 2, total: 3 })
  })
  it('quiz:result is not echoed to the phone that sent it', async () => {
    const { code, tv, phone } = await pair()
    const echo = arrives(phone, 'quiz:result')
    const got = once(tv, 'quiz:result')
    phone.emit('quiz:result', { code, correct: 1, total: 1 })
    await got
    expect(await echo).toBe(false)
  })
  it('quiz:start for a room the socket has not joined gets session:error VALIDATION and reaches nobody', async () => {
    const { code, tv, phone } = await pair()
    const stranger = client(); await connected(stranger)
    const err = once(stranger, 'session:error')
    const toPhone = arrives(phone, 'quiz:start'); const toTv = arrives(tv, 'quiz:start')
    stranger.emit('quiz:start', { code, clipSlug: 'x' })
    expect((await err).code).toBe('VALIDATION')
    expect([await toPhone, await toTv]).toEqual([false, false])
  })
  it('quiz:result with correct greater than total gets session:error VALIDATION', async () => {
    const { code, tv, phone } = await pair()
    const err = once(phone, 'session:error')
    const toTv = arrives(tv, 'quiz:result')
    phone.emit('quiz:result', { code, correct: 4, total: 3 })
    expect((await err).code).toBe('VALIDATION')
    expect(await toTv).toBe(false)
  })
})
