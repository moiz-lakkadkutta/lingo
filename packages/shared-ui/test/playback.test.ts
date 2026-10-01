import { createPlaybackReporter, type PlaybackSample } from '../src/platform/playback'

const s = (positionS: number, phase: PlaybackSample['phase']): PlaybackSample => ({ slug: 'der-zug', title: 'Der Zug', positionS, durationS: 120, phase })

describe('playback reporter', () => {
  it('reports on every phase change and every 30 s while playing, never twice for the same second and phase', () => {
    const report = vi.fn()
    const r = createPlaybackReporter({ report })
    r.update(s(0, 'playing'), 0) // first sample: a phase change from nothing
    r.update(s(0.25, 'playing'), 250)
    r.update(s(10, 'playing'), 10_000)
    expect(report).toHaveBeenCalledTimes(1)
    r.update(s(30, 'playing'), 30_000) // 30 s since the last report
    expect(report).toHaveBeenCalledTimes(2)
    r.update(s(31, 'playing'), 31_000)
    expect(report).toHaveBeenCalledTimes(2)
    r.update(s(31.5, 'paused'), 31_500) // phase change
    expect(report).toHaveBeenCalledTimes(3)
    r.update(s(31.5, 'paused'), 90_000) // paused: no interval reports
    r.update(s(31.6, 'playing'), 90_100)
    expect(report).toHaveBeenCalledTimes(4)
    r.update(s(31.9, 'paused'), 90_200) // same floor second as the last paused report
    expect(report).toHaveBeenCalledTimes(4)
    r.update(s(31.9, 'exit'), 90_300)
    expect(report.mock.calls.map(([x]) => [x.phase, x.positionS])).toEqual([['playing', 0], ['playing', 30], ['paused', 31.5], ['playing', 31.6], ['exit', 31.9]])

    const fast = vi.fn()
    const f = createPlaybackReporter({ report: fast, intervalMs: 1000 })
    f.update(s(0, 'playing'), 0); f.update(s(1, 'playing'), 1000); f.update(s(1.5, 'playing'), 2500)
    expect(fast).toHaveBeenCalledTimes(2) // 1.5 floors to the already reported second 1
  })

  it('reports ended with the position at the duration', () => {
    const report = vi.fn()
    const r = createPlaybackReporter({ report })
    r.update(s(118.7, 'playing'), 0)
    r.update(s(119.2, 'ended'), 500)
    expect(report).toHaveBeenLastCalledWith({ ...s(120, 'ended') })
    r.update(s(119.4, 'ended'), 600)
    expect(report).toHaveBeenCalledTimes(2)
  })
})
