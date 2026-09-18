import { JoinPayload, QuizResultPayload, QuizStartPayload, SESSION_CODE_RE, SaveWord, SessionErrorPayload, SocketEvents, WordSavedPayload, extractSessionCode } from '../src/index'
import type { ClientToServerEvents, ServerToClientEvents } from '../src/index'

describe('extractSessionCode', () => {
  it('accepts a typed code, lower-case', () => { expect(extractSessionCode(' abc234 ')).toBe('ABC234') })
  it('extracts from lingo://join/ABC234', () => { expect(extractSessionCode('lingo://join/ABC234')).toBe('ABC234') })
  it('extracts from https://host/join/ABC234?x=1', () => {
    expect(extractSessionCode('https://host/join/ABC234?x=1')).toBe('ABC234')
    expect(extractSessionCode('https://host/join/abc234#frag')).toBe('ABC234')
    expect(extractSessionCode('https://host/join/ABC234/')).toBe('ABC234')
  })
  it('rejects 0/O/1/I and wrong length', () => {
    expect(extractSessionCode('ABC230')).toBeNull()
    expect(extractSessionCode('ABCO34')).toBeNull()
    expect(extractSessionCode('ABC1234')).toBeNull()
    expect(extractSessionCode('ABCI34')).toBeNull()
    expect(extractSessionCode('ABC23')).toBeNull()
    expect(extractSessionCode('ABC2345')).toBeNull()
  })
  it('returns null for empty', () => { expect(extractSessionCode('')).toBeNull(); expect(extractSessionCode('   ')).toBeNull(); expect(extractSessionCode('lingo://join/')).toBeNull() })
})

describe('schemas', () => {
  it('JoinPayload requires a valid code and role', () => {
    expect(JoinPayload.safeParse({ code: 'ABC234', role: 'tv' }).success).toBe(true)
    expect(JoinPayload.safeParse({ code: 'ABC234', role: 'phone', deviceName: "Moiz's iPhone" }).success).toBe(true)
    expect(JoinPayload.safeParse({ code: 'abc', role: 'tv' }).success).toBe(false)
    expect(JoinPayload.safeParse({ code: 'ABC234', role: 'laptop' }).success).toBe(false)
    expect(JoinPayload.safeParse({ code: 'ABC234' }).success).toBe(false)
    expect('ABC234').toMatch(SESSION_CODE_RE)
  })
  it('clamps an over-long deviceName instead of rejecting the join', () => {
    const long = 'x'.repeat(41)
    const r = JoinPayload.safeParse({ code: 'ABC234', role: 'phone', deviceName: long })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.deviceName).toBe('x'.repeat(40))
    const padded = JoinPayload.parse({ code: 'ABC234', role: 'phone', deviceName: '  Pixel 8  ' })
    expect(padded.deviceName).toBe('Pixel 8')
  })
  it('treats an empty or blank deviceName as absent so the server can default it', () => {
    expect(JoinPayload.parse({ code: 'ABC234', role: 'phone', deviceName: '' }).deviceName).toBeUndefined()
    expect(JoinPayload.parse({ code: 'ABC234', role: 'phone', deviceName: '   ' }).deviceName).toBeUndefined()
    expect(JoinPayload.parse({ code: 'ABC234', role: 'phone' }).deviceName).toBeUndefined()
    expect(JoinPayload.safeParse({ code: 'ABC234', role: 'phone', deviceName: 42 }).success).toBe(false)
  })
  it('SaveWord.sessionCode must be a session code when present', () => {
    expect(SaveWord.safeParse({ highlightId: 'h1' }).success).toBe(true)
    expect(SaveWord.safeParse({ highlightId: 'h1', sessionCode: 'ABC234' }).success).toBe(true)
    expect(SaveWord.safeParse({ highlightId: 'h1', sessionCode: 'nope' }).success).toBe(false)
    expect(SaveWord.safeParse({ highlightId: 'h1', sessionCode: 'ABC230' }).success).toBe(false)
  })
  it('SessionErrorPayload distinguishes INTERNAL from VALIDATION', () => {
    expect(SessionErrorPayload.safeParse({ code: 'INTERNAL', message: 'Something went wrong' }).success).toBe(true)
    expect(SessionErrorPayload.safeParse({ code: 'CRASH', message: 'x' }).success).toBe(false)
  })
  it('QuizStartPayload accepts a client payload without clipSlug (C2S map uses the input type)', () => {
    const input: Parameters<ClientToServerEvents['quiz:start']>[0] = { code: 'ABC234' }
    expect(QuizStartPayload.parse(input)).toEqual({ code: 'ABC234', clipSlug: null })
  })
  it('WordSavedPayload round-trips a full payload', () => {
    const p = { code: 'ABC234', savedWordId: 'sw1', highlightId: 'h1', word: 'Bahnhof', lemma: 'Bahnhof', gloss: 'train station', example: 'Der Bahnhof ist groß.', level: 'A1', clipSlug: 'clip-1', clipTitle: 'Clip one', savedAt: new Date('2026-09-15T10:00:00.000Z').toISOString() }
    expect(WordSavedPayload.parse(p)).toEqual(p)
    expect(WordSavedPayload.parse({ ...p, clipSlug: null, clipTitle: null }).clipTitle).toBeNull()
    expect(WordSavedPayload.safeParse({ ...p, savedAt: 'yesterday' }).success).toBe(false)
  })
  it('QuizResultPayload rejects correct > total', () => {
    expect(QuizResultPayload.safeParse({ code: 'ABC234', correct: 3, total: 5 }).success).toBe(true)
    expect(QuizResultPayload.safeParse({ code: 'ABC234', correct: 6, total: 5 }).success).toBe(false)
  })
  it('SocketEvents names match the event-map keys', () => {
    const c2s: Record<keyof ClientToServerEvents, true> = { join: true, 'quiz:start': true, 'quiz:result': true }
    const s2c: Record<keyof ServerToClientEvents, true> = { 'session:state': true, 'session:error': true, 'phone:connected': true, 'phone:disconnected': true, 'word:saved': true, 'quiz:start': true, 'quiz:result': true }
    const names = new Set<string>(Object.values(SocketEvents))
    for (const k of [...Object.keys(c2s), ...Object.keys(s2c)]) expect(names.has(k)).toBe(true)
    expect(names.size).toBe(8)
  })
})
