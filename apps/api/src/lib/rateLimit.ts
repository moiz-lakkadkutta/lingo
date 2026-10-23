import type { RequestHandler } from 'express'
import { rateLimited } from './http'
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
  /** Whole seconds until `key`'s oldest miss leaves the window (the Retry-After of its 429); at least 1. */
  retryAfterS(key: string): number
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
    retryAfterS: (key) => Math.max(1, Math.ceil(((recent(key)[0] ?? now()) + opts.windowMs - now()) / 1000)),
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

/**
 * In-memory fixed-window request counter per key (client IP), one API process like createMissLimiter. hit() counts a request and
 * answers 0 while the key is at or under `max` in the current window, else the whole seconds until the window ends (Retry-After).
 */
export interface RateLimiter {
  hit(key: string): number
  reset(): void
}
export interface RateLimit { max: number; windowMs: number }

export function createRateLimiter(opts: RateLimit & { now?: () => number }): RateLimiter {
  const now = opts.now ?? (() => Date.now())
  const windows = new Map<string, { start: number; count: number }>()
  return {
    hit(key) {
      const t = now()
      let w = windows.get(key)
      if (!w || t - w.start >= opts.windowMs) {
        w = { start: t, count: 0 }
        windows.set(key, w)
        // Bound memory: drop ended windows, then the oldest keys, if a scan floods the map.
        if (windows.size > 10_000) {
          for (const [k, v] of windows) if (t - v.start >= opts.windowMs) windows.delete(k)
          for (const k of windows.keys()) { if (windows.size <= 5_000) break; windows.delete(k) }
        }
      }
      w.count++
      return w.count <= opts.max ? 0 : Math.max(1, Math.ceil((w.start + opts.windowMs - t) / 1000))
    },
    reset: () => windows.clear(),
  }
}

/**
 * Per-IP HTTP limits (createApp). Sized from what the shipped clients send (no client polls faster than every 30 s; sockets are
 * WebSocket only, so they never count here): one busy TV is about 20 requests a minute and a phone grading cards about 30, so a
 * judging venue with ~15 devices behind one NAT address peaks near 400. Each limit leaves at least twice that, and still caps a script.
 */
export const HTTP_LIMITS = {
  /** Every route but /health. */
  global: { max: 900, windowMs: 60_000 },
  /** POST /sessions: once per TV start (one retry after 3 s); each call can create a learner and a session row. */
  sessions: { max: 60, windowMs: 60_000 },
  /** PUT /me: one per Settings or first-run change. */
  settings: { max: 240, windowMs: 60_000 },
  /** POST /iap/verify: one per purchase or restored receipt; each call reaches Amazon RVS. */
  iapVerify: { max: 60, windowMs: 60_000 },
} satisfies Record<string, RateLimit>
export type HttpLimits = typeof HTTP_LIMITS

/** 429 RATE_LIMITED with Retry-After once req.ip (after trust proxy, lib/clientIp.ts) is over the limiter's limit; `skip` paths are not counted. */
export function limitByIp(limiter: RateLimiter, skip: (path: string) => boolean = () => false): RequestHandler {
  return (req, _res, next) => {
    if (skip(req.path)) return next()
    const wait = limiter.hit(req.ip ?? 'unknown')
    next(wait ? rateLimited('Too many requests. Wait a minute and try again.', wait) : undefined)
  }
}
