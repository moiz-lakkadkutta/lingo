import { env } from './env'
import { cdnFor, manifestUrlFor } from './media'

/** Public URL for an S3 key behind CloudFront; null without a key or a domain. */
export const cdn = (k: string | null): string | null => cdnFor(k, env)
/** Manifest URL: CloudFront, else MEDIA_BASE_URL (local media, `pnpm media:dev`), else http://localhost/<key> (media.ts). */
export const manifestUrl = (k: string | null): string | null => manifestUrlFor(k, env)
