import { env } from './env'
/** Public URL for an S3 key behind CloudFront; null without a key or a domain (no `https://undefined/…`). */
export const cdn = (k: string | null): string | null => (k && env.CLOUDFRONT_DOMAIN ? `https://${env.CLOUDFRONT_DOMAIN}/${k}` : null)
/** Manifest URL: must stay a URL for ClipDetail, so without CLOUDFRONT_DOMAIN (local dev, tests) it falls back to http://localhost/<key>. */
export const manifestUrl = (k: string | null): string | null => (k ? cdn(k) ?? `http://localhost/${k}` : null)
