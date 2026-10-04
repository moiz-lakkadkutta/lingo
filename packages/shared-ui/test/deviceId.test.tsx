import React from 'react'
import { act } from 'react-test-renderer'
import { DEVICE_ID_KEY, loadDeviceId, randomUuid, useDeviceId, type IdStore } from '../src/platform/deviceId'
import { render } from './helpers'

const memStore = (async = false) => {
  const m = new Map<string, string>()
  const store: IdStore = async
    ? { get: async (k) => m.get(k) ?? null, set: async (k, v) => { m.set(k, v) } }
    : { get: (k) => m.get(k), set: (k, v) => { m.set(k, v) } }
  return { m, store }
}

describe('H1: per-install device id', () => {
  it('H1: creates a tv-<uuid> once and reuses it on the next launch (sync store, as MMKV)', async () => {
    const { m, store } = memStore()
    const newUuid = vi.fn(() => 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE')
    const first = await loadDeviceId(store, newUuid)
    expect(first).toBe('tv-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')
    expect(m.get(DEVICE_ID_KEY)).toBe(first)
    expect(await loadDeviceId(store, newUuid)).toBe(first)
    expect(newUuid).toHaveBeenCalledTimes(1)
  })
  it('H1: works with an async store (AsyncStorage) and gives two installs different ids', async () => {
    const a = memStore(true), b = memStore(true)
    const ia = await loadDeviceId(a.store), ib = await loadDeviceId(b.store)
    expect(ia).toMatch(/^tv-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(ia).not.toBe(ib)
    expect(await loadDeviceId(a.store)).toBe(ia)
  })
  it('H1: never answers the old shared dev-device; a junk stored value is replaced', async () => {
    const { m, store } = memStore()
    m.set(DEVICE_ID_KEY, 'dev-device')
    const id = await loadDeviceId(store)
    expect(id).not.toBe('dev-device')
    expect(m.get(DEVICE_ID_KEY)).toBe(id)
  })
  it('H1: a store that throws still yields a unique id for this run', async () => {
    const store: IdStore = { get: () => { throw new Error('nope') }, set: async () => { throw new Error('nope') } }
    const id = await loadDeviceId(store)
    expect(id).toMatch(/^tv-/)
  })
  it('H1: randomUuid gives distinct v4 ids', () => {
    const ids = new Set(Array.from({ length: 50 }, randomUuid))
    expect(ids.size).toBe(50)
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
  it('H1: useDeviceId is null until loaded, then the persisted id', async () => {
    const { m, store } = memStore(true)
    const seen: (string | null)[] = []
    function Probe() { const id = useDeviceId(store); seen.push(id); return null }
    render(<Probe />)
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    expect(seen[0]).toBeNull()
    expect(seen.at(-1)).toBe(m.get(DEVICE_ID_KEY))
  })
})
