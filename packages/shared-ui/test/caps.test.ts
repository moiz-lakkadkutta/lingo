import { capsFor } from '../src/platformCaps'

describe('platform caps', () => {
  it('kepler and vega have no rate; android, ios and web do', () => {
    expect(capsFor('kepler').rate).toBe(false)
    expect(capsFor('vega').rate).toBe(false)
    for (const os of ['android', 'ios', 'web']) expect(capsFor(os).rate).toBe(true)
  })
  it('wordFocusIn defaults to cue on every OS', () => {
    for (const os of ['kepler', 'vega', 'android', 'ios', 'web']) expect(capsFor(os).wordFocusIn).toBe('cue')
  })
  it('kepler and vega have playback false until KIT-010; android, ios and web have it', () => {
    expect(capsFor('kepler').playback).toBe(false)
    expect(capsFor('vega').playback).toBe(false)
    for (const os of ['android', 'ios', 'web']) expect(capsFor(os).playback).toBe(true)
  })
})
