import { ApiError, type PhoneApi } from '../src/lib/api'
import { bootCode, guardApi } from '../src/lib/session'

const failing = (code: string): PhoneApi => {
  const no = () => Promise.reject(new ApiError(404, code, 'No TV with that code'))
  return { me: no, dueWords: no, review: no, stats: no }
}

describe('phone session (device test 2026-10-23)', () => {
  it('a code in the opening URL wins over the remembered TV', () => {
    expect(bootCode('ABCDEF', 'https://lingo.example/join/XYZ789')).toBe('XYZ789')
  })
  it('without a code in the URL the remembered TV is used', () => {
    expect(bootCode('ABCDEF', 'https://lingo.example/')).toBe('ABCDEF')
    expect(bootCode('ABCDEF', null)).toBe('ABCDEF')
    expect(bootCode(null, null)).toBeNull()
  })
  it('UNKNOWN_CODE for the current code forgets the TV', async () => {
    const onUnknown = vi.fn()
    const api = guardApi(failing('UNKNOWN_CODE'), () => 'ABCDEF', () => 'ABCDEF', onUnknown)
    await expect(api.me()).rejects.toBeInstanceOf(ApiError)
    expect(onUnknown).toHaveBeenCalledTimes(1)
  })
  it('a late UNKNOWN_CODE for a code that is no longer current is ignored', async () => {
    const onUnknown = vi.fn()
    let current = 'ABCDEF'
    const raw = failing('UNKNOWN_CODE')
    const slow: PhoneApi = { ...raw, me: () => { current = 'XYZ789'; return raw.me() } } // the new code is joined while /me is in flight
    const api = guardApi(slow, () => 'ABCDEF', () => current, onUnknown)
    await expect(api.me()).rejects.toBeInstanceOf(ApiError)
    expect(onUnknown).not.toHaveBeenCalled()
  })
  it('other errors never forget the TV', async () => {
    const onUnknown = vi.fn()
    const api = guardApi(failing('NETWORK'), () => 'ABCDEF', () => 'ABCDEF', onUnknown)
    await expect(api.stats()).rejects.toBeInstanceOf(ApiError)
    expect(onUnknown).not.toHaveBeenCalled()
  })
})
