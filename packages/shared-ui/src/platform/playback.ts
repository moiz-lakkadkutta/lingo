/** Throttled playback reports for Personalization (resume / continue watching) and Now Playing.
 *  https://developer.amazon.com/docs/vega/0.22/watch-activity.html · https://developer.amazon.com/docs/fire-tv/introduction-content-personalization.html */
export type PlaybackPhase = 'playing' | 'paused' | 'ended' | 'exit'
export interface PlaybackSample { slug: string; title: string; positionS: number; durationS: number; phase: PlaybackPhase }

/**
 * report(sample) is called on every phase change and every intervalMs (default 30 000) while 'playing', never twice for the same
 * (phase, floor(positionS)). The kit's reportPlayback has no phase argument (TODO(KIT-E3)), so 'ended' reports positionS = durationS.
 */
export function createPlaybackReporter(opts: { report(s: PlaybackSample): void; intervalMs?: number }): { update(s: PlaybackSample, now: number): void } {
  const intervalMs = opts.intervalMs ?? 30_000
  const sent = new Set<string>()
  let lastPhase: PlaybackPhase | null = null
  let lastAt = -Infinity
  return {
    update(raw, now) {
      const s = raw.phase === 'ended' ? { ...raw, positionS: raw.durationS } : raw
      const changed = s.phase !== lastPhase
      lastPhase = s.phase
      const due = changed || (s.phase === 'playing' && now - lastAt >= intervalMs)
      if (!due) return
      const key = `${s.phase}:${Math.floor(s.positionS)}`
      if (sent.has(key)) return
      sent.add(key)
      lastAt = now
      opts.report(s)
    },
  }
}
