/**
 * In-memory per-key miss counter (one API process; a shared store is a follow-up for more than one instance).
 * Session-code lookups count a miss per client IP for every malformed or unknown code; once `max` misses fall inside
 * `windowMs`, every code lookup from that IP answers 429 RATE_LIMITED until the window slides past them, so codes can't be enumerated.
 */
export interface MissLimiter {
  /** True while `key` has `max` or more misses inside the window. */
  blocked(key: string): boolean
  /** Records one miss for `key`. */
  miss(key: string): void
  reset(): void
}

export function createMissLimiter(opts: { max: number; windowMs: number; now?: () => number }): MissLimiter {
  const now = opts.now ?? (() => Date.now())
  const hits = new Map<string, number[]>()
  const recent = (key: string): number[] => {
    const since = now() - opts.windowMs
    const kept = (hits.get(key) ?? []).filter((t) => t > since)
    if (kept.length) hits.set(key, kept); else hits.delete(key)
    return kept
  }
  return {
    blocked: (key) => recent(key).length >= opts.max,
    miss(key) {
      const kept = recent(key)
      kept.push(now())
      hits.set(key, kept)
      // Bound memory: drop the oldest keys if a scan floods the map.
      if (hits.size > 10_000) for (const k of hits.keys()) { hits.delete(k); if (hits.size <= 5_000) break }
    },
    reset: () => hits.clear(),
  }
}

/** 20 unknown or malformed session codes per IP per minute, shared by /me/* and the socket join. */
export const codeMisses: MissLimiter = createMissLimiter({ max: 20, windowMs: 60_000 })
