import { createStatusFlasher, flashStatus, NOTICE_MS, SAVED_MS, savedStatus } from '../src/screens/settings/status'
import { strings } from '../src/strings'

const S = strings.settings
/** A useState stand-in: the setter takes a value or an updater, like React's. */
function box(initial: string | null = null) {
  const b = {
    v: initial,
    set: (x: string | null | ((cur: string | null) => string | null)) => { b.v = typeof x === 'function' ? x(b.v) : x },
  }
  return b
}

describe('Settings transient status (QA #5)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('"Saved." shows at once and clears itself after about 2 s', () => {
    const b = box()
    flashStatus(b.set, savedStatus(), SAVED_MS)
    expect(b.v).toBe(S.saved)
    vi.advanceTimersByTime(SAVED_MS - 1)
    expect(b.v).toBe(S.saved)
    vi.advanceTimersByTime(1)
    expect(b.v).toBeNull()
    expect(SAVED_MS).toBe(2000)
  })
  it('a save that swapped I speak says so and stays longer', () => {
    const b = box()
    flashStatus(b.set, savedStatus(S.nativeSwapped('Deutsch')), NOTICE_MS)
    expect(b.v).toBe('Saved. I speak is now Deutsch.')
    vi.advanceTimersByTime(SAVED_MS)
    expect(b.v).toBe('Saved. I speak is now Deutsch.')
    vi.advanceTimersByTime(NOTICE_MS - SAVED_MS)
    expect(b.v).toBeNull()
  })
  it('never clears a newer message (an error or a later save)', () => {
    const b = box()
    flashStatus(b.set, S.saved, SAVED_MS)
    b.set(strings.common.saveError)
    vi.advanceTimersByTime(SAVED_MS)
    expect(b.v).toBe(strings.common.saveError)
  })
  it('cancel stops the timer', () => {
    const b = box()
    const cancel = flashStatus(b.set, S.saved, SAVED_MS)
    cancel()
    vi.advanceTimersByTime(SAVED_MS)
    expect(b.v).toBe(S.saved)
  })
  it('two quick saves: the first timer never clears the second "Saved." early (review L3)', () => {
    const b = box()
    const f = createStatusFlasher(b.set)
    f.flash(S.saved, SAVED_MS)
    vi.advanceTimersByTime(SAVED_MS - 500)
    f.flash(S.saved, SAVED_MS)
    vi.advanceTimersByTime(500)
    expect(b.v).toBe(S.saved) // the first save's timer was cleared
    vi.advanceTimersByTime(SAVED_MS - 500)
    expect(b.v).toBeNull()
  })
  it('cancel (on unmount) stops the pending clear', () => {
    const b = box()
    const f = createStatusFlasher(b.set)
    f.flash(S.saved, SAVED_MS)
    f.cancel()
    vi.advanceTimersByTime(SAVED_MS)
    expect(b.v).toBe(S.saved)
  })
})
