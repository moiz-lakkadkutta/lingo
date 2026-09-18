import { initialSession, sessionReducer } from '../src/session/types'
import { postSessionWithRetry } from '../src/session/useSession'

describe('sessionReducer', () => {
  it('created sets code and joinUrl', () => {
    const s = sessionReducer(initialSession, { type: 'created', code: 'ABC234', joinUrl: 'lingo://join/ABC234' })
    expect(s).toEqual({ code: 'ABC234', joinUrl: 'lingo://join/ABC234', phone: null, live: false })
  })
  it('phone:connected sets phone to the device name', () => {
    const s = sessionReducer({ ...initialSession, code: 'ABC234' }, { type: 'phone:connected', phoneName: "Moiz's iPhone" })
    expect(s.phone).toBe("Moiz's iPhone")
    expect(s.code).toBe('ABC234')
  })
  it('phone:disconnected clears phone', () => {
    const s = sessionReducer({ ...initialSession, phone: 'Pixel 8' }, { type: 'phone:disconnected' })
    expect(s.phone).toBeNull()
  })
  it('state replaces phone from the server', () => {
    expect(sessionReducer({ ...initialSession, phone: null }, { type: 'state', phone: 'Pixel 8' }).phone).toBe('Pixel 8')
    expect(sessionReducer({ ...initialSession, phone: 'Pixel 8' }, { type: 'state', phone: null }).phone).toBeNull()
  })
  it('transport toggles live', () => {
    const on = sessionReducer(initialSession, { type: 'transport', live: true })
    expect(on.live).toBe(true)
    expect(sessionReducer(on, { type: 'transport', live: false }).live).toBe(false)
  })
  it('initial state has nothing yet', () => { expect(initialSession).toEqual({ code: null, joinUrl: null, phone: null, live: false }) })
})

describe('postSessionWithRetry', () => {
  const dto = { code: 'ABC234', joinUrl: 'lingo://join/ABC234' }
  it('returns the session on the first success without waiting', async () => {
    const waits: number[] = []
    const r = await postSessionWithRetry(async () => dto, (ms) => { waits.push(ms); return Promise.resolve() })
    expect(r).toEqual(dto)
    expect(waits).toEqual([])
  })
  it('retries once after the delay and returns the second result', async () => {
    let calls = 0
    const waits: number[] = []
    const r = await postSessionWithRetry(async () => { if (calls++ === 0) throw new Error('net') ; return dto }, (ms) => { waits.push(ms); return Promise.resolve() })
    expect(r).toEqual(dto)
    expect(calls).toBe(2)
    expect(waits).toEqual([3000])
  })
  it('gives up (null) after two failures so the caller can go offline', async () => {
    let calls = 0
    const r = await postSessionWithRetry(async () => { calls++; throw new Error('net') }, () => Promise.resolve())
    expect(r).toBeNull()
    expect(calls).toBe(2)
  })
  it('treats a malformed body as a failure', async () => {
    const r = await postSessionWithRetry(async () => ({ code: 'nope' }), () => Promise.resolve())
    expect(r).toBeNull()
  })
})
