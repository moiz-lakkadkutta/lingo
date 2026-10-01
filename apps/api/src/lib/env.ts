import { z } from 'zod'
const Env = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(4000),
  AWS_REGION: z.string().default('eu-central-1'),
  BEDROCK_REGION: z.string().default('us-east-1'),
  S3_BUCKET_MEDIA: z.string().optional(),
  CLOUDFRONT_DOMAIN: z.string().optional(),
  /** Lingo Plus feature flag (decision 0009): iap = verify with RVS; demo = everyone has Plus; off = nobody has Plus. */
  LINGO_PLUS_MODE: z.enum(['iap', 'demo', 'off']).default('iap'),
  RVS_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  /** The RVS Cloud Sandbox accepts any non-empty secret; production needs the Developer Console shared key. Never logged. */
  RVS_SHARED_SECRET: z.string().min(1).default('sandbox'),
  RVS_BASE: z.string().url().optional(),
})
export const env = Env.parse(process.env)
