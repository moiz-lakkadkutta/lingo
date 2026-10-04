import { createStore, KEYS, normaliseApiUrl, type KV } from '../src/lib/storage'

const memory = (): KV & { m: Map<string, string> } => {
  const m = new Map<string, string>()
  return { m, getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => { m.set(k, v) }, removeItem: async (k) => { m.delete(k) } }
}

describe('storage', () => {
  it('deviceId is created once and then stable', async () => {
    const kv = memory(); let n = 0
    const newId = () => `id${++n}`
    const a = createStore(kv, newId)
    const [x, y] = await Promise.all([a.deviceId(), a.deviceId()])
    expect(x).toBe('phone-id1'); expect(y).toBe('phone-id1')
    expect(await createStore(kv, newId).deviceId()).toBe('phone-id1') // a later launch reads the stored id
    expect(kv.m.get(KEYS.deviceId)).toBe('phone-id1')
  })
  it('setTv then tv returns the code; forgetTv clears it', async () => {
    const s = createStore(memory(), () => 'x')
    expect(await s.tv()).toBeNull()
    await s.setTv('ABC234')
    expect(await s.tv()).toBe('ABC234')
    await s.forgetTv()
    expect(await s.tv()).toBeNull()
  })
  it('a stored value that is not a session code reads as no TV', async () => {
    const kv = memory(); kv.m.set(KEYS.tv, 'not-a-code')
    expect(await createStore(kv, () => 'x').tv()).toBeNull()
  })
  it('normaliseApiUrl adds http, drops the trailing slash, and rejects junk', () => {
    expect(normaliseApiUrl(' 192.168.1.20:4000/ ')).toBe('http://192.168.1.20:4000')
    expect(normaliseApiUrl('https://lingo.example.dev//')).toBe('https://lingo.example.dev')
    expect(normaliseApiUrl('http://laptop.local:4000')).toBe('http://laptop.local:4000')
    for (const junk of ['', '   ', 'ftp://host', 'http://', 'not a url', 'http://a b']) expect(normaliseApiUrl(junk)).toBeNull()
  })
})
