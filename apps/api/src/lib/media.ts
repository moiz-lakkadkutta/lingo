/** Media URLs from an env-like object, with no env.ts import (scripts and tests use these directly). cdn.ts binds them to env. */
export interface MediaEnv { CLOUDFRONT_DOMAIN?: string; MEDIA_BASE_URL?: string }
/** Without CLOUDFRONT_DOMAIN or MEDIA_BASE_URL (tests), manifests still resolve to a URL so ClipDetail parses. */
export const DEFAULT_MEDIA_BASE = 'http://localhost'

/** Public URL for an S3 key behind CloudFront; null without a key or a domain (no `https://undefined/…`). */
export const cdnFor = (k: string | null, e: MediaEnv): string | null => (k && e.CLOUDFRONT_DOMAIN ? `https://${e.CLOUDFRONT_DOMAIN}/${k}` : null)

/** Local media (dev seed, `pnpm media:dev`): MEDIA_BASE_URL (any http origin and port, with or without a path) + key. */
export const mediaUrlFor = (k: string, e: MediaEnv): string => `${(e.MEDIA_BASE_URL || DEFAULT_MEDIA_BASE).replace(/\/+$/, '')}/${k.replace(/^\/+/, '')}`

/** Manifest URL: CloudFront when CLOUDFRONT_DOMAIN is set, else MEDIA_BASE_URL (local dev), else http://localhost/<key>. */
export const manifestUrlFor = (k: string | null, e: MediaEnv): string | null => (k ? cdnFor(k, e) ?? mediaUrlFor(k, e) : null)
