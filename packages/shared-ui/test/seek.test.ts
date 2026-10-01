import { cueAt, lastStartedCue, seekTarget } from '../src/screens/player/seek'
import { cues } from './fixtures'

// cues: [1,3) gap [4,6) [6.5,9)
describe('seek', () => {
  it('cueAt returns the cue whose startS ≤ s < endS and null in a gap', () => {
    expect(cueAt(cues, 1)).toBe(0)
    expect(cueAt(cues, 2.99)).toBe(0)
    expect(cueAt(cues, 3)).toBeNull()
    expect(cueAt(cues, 0.5)).toBeNull()
    expect(cueAt(cues, 6.4)).toBeNull()
    expect(cueAt(cues, 7)).toBe(2)
    expect(cueAt(cues, 9)).toBeNull()
    expect(lastStartedCue(cues, 0.5)).toBeNull()
    expect(lastStartedCue(cues, 3.5)).toBe(0)
  })
  it('prev within the grace second goes to the previous cue start', () => {
    expect(seekTarget(cues, 4.5, 'prev', 1)).toBe(1)
    expect(seekTarget(cues, 7.5, 'prev', 1)).toBe(4)
  })
  it('prev after the grace second goes to the current cue start', () => {
    expect(seekTarget(cues, 5.5, 'prev', 1)).toBe(4)
    expect(seekTarget(cues, 8, 'prev')).toBe(6.5)
  })
  it('prev on the first cue goes to 0', () => {
    expect(seekTarget(cues, 1.5, 'prev', 1)).toBe(0)
    expect(seekTarget(cues, 0.5, 'prev', 1)).toBe(0)
  })
  it('next goes to the next cue start and is null after the last cue', () => {
    expect(seekTarget(cues, 0, 'next')).toBe(1)
    expect(seekTarget(cues, 2, 'next')).toBe(4)
    expect(seekTarget(cues, 7, 'next')).toBeNull()
    expect(seekTarget(cues, 10, 'next')).toBeNull()
  })
  it('next ignores a cue that starts within 50 ms of the position', () => {
    expect(seekTarget(cues, 3.97, 'next')).toBe(6.5)
    expect(seekTarget(cues, 3.9, 'next')).toBe(4)
  })
  it('replay returns the start of the last cue that began at or before the position', () => {
    expect(seekTarget(cues, 5, 'replay')).toBe(4)
    expect(seekTarget(cues, 4, 'replay')).toBe(4)
    expect(seekTarget(cues, 3.5, 'replay')).toBe(1)
    expect(seekTarget(cues, 0.2, 'replay')).toBe(0)
  })
  it('seeks resolve inside a gap between cues to the neighbouring cue starts', () => {
    expect(seekTarget(cues, 3.5, 'prev', 1)).toBe(1)
    expect(seekTarget(cues, 3.5, 'next', 1)).toBe(4)
    expect(seekTarget(cues, 6.2, 'prev', 1)).toBe(4)
    expect(seekTarget(cues, 6.2, 'next', 1)).toBe(6.5)
  })
})
