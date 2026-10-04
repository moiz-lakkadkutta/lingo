import { createFocusMemory, pickPreferred } from '../src/nav/focusMemory'

describe('focus memory', () => {
  it('remembers the last id per route key and forgets on request', () => {
    const m = createFocusMemory()
    m.set('home', 'a'); m.set('home', 'b'); m.set('clip:x', 'watch')
    expect(m.get('home')).toBe('b')
    expect(m.get('clip:x')).toBe('watch')
    m.forget('home')
    expect(m.get('home')).toBeUndefined()
    expect(m.get('clip:x')).toBe('watch')
  })
  it('pickPreferred returns the remembered id when it is still on screen', () => {
    expect(pickPreferred('card:fresh:x', ['hero:watch', 'card:fresh:x'], 'hero:watch')).toBe('card:fresh:x')
  })
  it('pickPreferred falls back to the fallback, then the first id, then null', () => {
    expect(pickPreferred('gone', ['hero:watch', 'b'], 'hero:watch')).toBe('hero:watch')
    expect(pickPreferred(undefined, ['b', 'c'], 'hero:watch')).toBe('b')
    expect(pickPreferred('gone', [], 'hero:watch')).toBeNull()
  })
})
