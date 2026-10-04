import { nativeVisible, statusParts } from '../src/screens/player/visibility'

const base = { challenge: false, paused: false, revealedCue: null as number | null, cueIndex: 3 as number | null }

describe('visibility', () => {
  it('always shows the native line unless Challenge', () => {
    expect(nativeVisible({ ...base, setting: 'always' })).toBe(true)
    expect(nativeVisible({ ...base, setting: 'always', paused: true })).toBe(true)
    expect(nativeVisible({ ...base, setting: 'always', challenge: true })).toBe(false)
  })
  it('onPause shows when paused or when the current cue is revealed', () => {
    expect(nativeVisible({ ...base, setting: 'onPause' })).toBe(false)
    expect(nativeVisible({ ...base, setting: 'onPause', paused: true })).toBe(true)
    expect(nativeVisible({ ...base, setting: 'onPause', revealedCue: 3 })).toBe(true)
    expect(nativeVisible({ ...base, setting: 'onPause', revealedCue: 2 })).toBe(false)
  })
  it('never shows only when the current cue is revealed', () => {
    expect(nativeVisible({ ...base, setting: 'never' })).toBe(false)
    expect(nativeVisible({ ...base, setting: 'never', paused: true })).toBe(false)
    expect(nativeVisible({ ...base, setting: 'never', revealedCue: 3 })).toBe(true)
    expect(nativeVisible({ ...base, setting: 'never', revealedCue: null, cueIndex: null })).toBe(false)
  })
  it('Challenge shows only the revealed cue, even when paused', () => {
    expect(nativeVisible({ ...base, setting: 'always', challenge: true, paused: true })).toBe(false)
    expect(nativeVisible({ ...base, setting: 'onPause', challenge: true, paused: true })).toBe(false)
    expect(nativeVisible({ ...base, setting: 'never', challenge: true, revealedCue: 3 })).toBe(true)
    expect(nativeVisible({ ...base, setting: 'always', challenge: true, revealedCue: null, cueIndex: null })).toBe(false)
  })
  it('statusParts lists Challenge and 0.75× in that order and nothing at 1× outside Challenge', () => {
    expect(statusParts({ challenge: false, rate: 1 })).toEqual([])
    expect(statusParts({ challenge: true, rate: 1 })).toEqual(['Challenge'])
    expect(statusParts({ challenge: false, rate: 0.75 })).toEqual(['0.75×'])
    expect(statusParts({ challenge: true, rate: 0.75 })).toEqual(['Challenge', '0.75×'])
  })
})
