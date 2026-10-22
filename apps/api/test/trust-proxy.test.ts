import type http from 'node:http'
import { Writable } from 'node:stream'
import pino from 'pino'
import type { Request } from 'express'
import request from 'supertest'
import { io as connect, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents, SessionErrorPayload } from '@lingo/contracts'
import { createApp } from '../src/app'
import { clientIp, isLoopback } from '../src/lib/clientIp'
import { db } from '../src/lib/db'
import { codeMisses } from '../src/lib/rateLimit'
import { createServer, type LingoIo } from '../src/server'

// Behind Caddy every peer is 127.0.0.1: without trust proxy, one client's bad codes locked out every phone (shared limiter key).
type Client = Socket<ServerToClientEvents, ClientToServerEvents>
const A = '203.0.113.7'
const B = '198.51.100.20'

beforeEach(() => codeMisses.reset())
afterAll(async () => { codeMisses.reset(); await db.$disconnect() })

describe('clientIp', () => {
  it('a peer that is not loopback is the client, whatever X-Forwarded-For says', () => {
    expect(clientIp('192.0.2.1', A)).toBe('192.0.2.1')
    expect(clientIp('::ffff:192.0.2.1', A)).toBe('::ffff:192.0.2.1')
  })
  it('a loopback peer hands over to the rightmost X-Forwarded-For hop that is not loopback', () => {
    expect(clientIp('127.0.0.1', A)).toBe(A)
    expect(clientIp('::1', A)).toBe(A)
    expect(clientIp('::ffff:127.0.0.1', `${B}, ${A}`)).toBe(A)
    expect(clientIp('127.0.0.1', `${B}, ${A}, 127.0.0.1`)).toBe(A)
    expect(clientIp('127.0.0.1', [B, A])).toBe(A)
  })
  it('falls back to the furthest hop when every hop is loopback, and to the peer without the header', () => {
    expect(clientIp('127.0.0.1', '127.0.0.2')).toBe('127.0.0.2')
    expect(clientIp('127.0.0.1', undefined)).toBe('127.0.0.1')
    expect(clientIp('127.0.0.1', ' , ')).toBe('127.0.0.1')
    expect(clientIp(undefined, undefined)).toBe('unknown')
  })
  it('isLoopback covers 127.0.0.0/8, ::1 and IPv4-mapped 127.x only', () => {
    expect(['127.0.0.1', '127.9.9.9', '::1', '::ffff:127.0.0.1', '0:0:0:0:0:0:0:1'].every(isLoopback)).toBe(true)
    expect(['10.0.0.1', '128.0.0.1', '::2', '::ffff:10.0.0.1', 'localhost', '', 'not-an-ip'].some(isLoopback)).toBe(false)
  })
})

describe('Express req.ip (trust proxy loopback)', () => {
  const app = createApp()
  // A request object on the app's prototype, so req.ip runs Express's own trust-proxy logic for a chosen peer address.
  const reqFrom = (peer: string, xff?: string): Request => {
    const req = Object.create(app.request) as Request & { connection: unknown; socket: unknown }
    const socket = { remoteAddress: peer }
    Object.assign(req, { headers: xff ? { 'x-forwarded-for': xff } : {}, connection: socket, socket })
    return req
  }
  it('reads X-Forwarded-For only when the peer is loopback', () => {
    expect(reqFrom('127.0.0.1', A).ip).toBe(A)
    expect(reqFrom('::1', `${B}, ${A}`).ip).toBe(A)
    expect(reqFrom('192.0.2.1', A).ip).toBe('192.0.2.1')
    expect(reqFrom('127.0.0.1').ip).toBe('127.0.0.1')
  })
  it('agrees with clientIp for the same hops', () => {
    for (const [peer, xff] of [['127.0.0.1', A], ['127.0.0.1', `${B}, ${A}, 127.0.0.1`], ['192.0.2.1', A], ['::1', '127.0.0.2']] as const) {
      expect(reqFrom(peer, xff).ip).toBe(clientIp(peer, xff))
    }
  })
  it('request logs carry clientIp (req.ip), not only the peer address', async () => {
    const lines: string[] = []
    const sink = new Writable({ write(chunk, _enc, cb) { lines.push(String(chunk)); cb() } })
    await request(createApp({ log: pino({ level: 'info' }, sink) })).get('/health').set('x-forwarded-for', A)
    expect(JSON.parse(lines.join('').trim().split('\n').pop() ?? '{}').clientIp).toBe(A)
  })
  it('the session-code miss limiter is keyed per client behind the proxy', async () => {
    const miss = (ip: string) => request(app).get('/me').set('x-forwarded-for', ip).set('x-session-code', 'ABC10O')
    for (let i = 0; i < 20; i++) expect((await miss(A)).status).toBe(404)
    expect((await miss(A)).status).toBe(429)
    const other = await miss(B)
    expect(other.status).toBe(404)
    expect(other.body.error.code).toBe('UNKNOWN_CODE')
  })
})

describe('Socket.IO join (clientIp from the handshake)', () => {
  let server: http.Server
  let io: LingoIo
  let base = ''
  const clients: Client[] = []
  beforeAll(async () => {
    const s = createServer(); server = s.server; io = s.io
    base = await new Promise<string>((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}`)))
  })
  afterAll(async () => {
    for (const c of clients) c.disconnect()
    io.close()
    await new Promise((resolve) => server.close(resolve))
  })
  const client = async (xff: string): Promise<Client> => {
    const c: Client = connect(base, { transports: ['websocket'], forceNew: true, extraHeaders: { 'x-forwarded-for': xff } })
    clients.push(c)
    await new Promise<void>((resolve) => c.once('connect', () => resolve()))
    return c
  }
  const badJoin = (c: Client) => new Promise<SessionErrorPayload>((resolve) => {
    c.once('session:error', resolve)
    c.emit('join', { code: 'nope', role: 'phone' })
  })

  it('misses from one client do not rate-limit another', async () => {
    const a = await client(A)
    for (let i = 0; i < 20; i++) expect((await badJoin(a)).code).toBe('UNKNOWN_CODE')
    expect((await badJoin(a)).code).toBe('RATE_LIMITED')
    const b = await client(B)
    expect((await badJoin(b)).code).toBe('UNKNOWN_CODE')
    expect(codeMisses.blocked(A)).toBe(true)
    expect(codeMisses.blocked('127.0.0.1')).toBe(false)
  })
})
