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
export type Env = z.infer<typeof Env>

/**
 * What would make Lingo Plus free or broken in production (review-007 M2). Empty outside NODE_ENV=production and in mode off.
 * demo gives everyone Plus; a sandbox RVS accepts App Tester receipts from any Fire TV; the default secret fails every real receipt.
 */
export function plusSafetyProblems(e: Pick<Env, 'LINGO_PLUS_MODE' | 'RVS_ENV' | 'RVS_SHARED_SECRET'>, raw: Record<string, string | undefined>): string[] {
  if (raw.NODE_ENV !== 'production' || e.LINGO_PLUS_MODE === 'off') return []
  if (e.LINGO_PLUS_MODE === 'demo') return ['LINGO_PLUS_MODE=demo gives everyone Lingo Plus']
  const out: string[] = []
  if (e.RVS_ENV !== 'production') out.push(`RVS_ENV=${e.RVS_ENV}${raw.RVS_ENV ? '' : ' (default)'} verifies against the RVS Cloud Sandbox, which accepts test receipts`)
  if (!raw.RVS_SHARED_SECRET || e.RVS_SHARED_SECRET === 'sandbox') out.push('RVS_SHARED_SECRET is the default; production RVS needs the Developer Console shared key')
  return out
}

/** Refuses to start (throws) when plusSafetyProblems is not empty, unless LINGO_ALLOW_UNSAFE_PLUS=true; returns the problems it allowed. */
export function assertPlusSafe(e: Pick<Env, 'LINGO_PLUS_MODE' | 'RVS_ENV' | 'RVS_SHARED_SECRET'>, raw: Record<string, string | undefined>): string[] {
  const problems = plusSafetyProblems(e, raw)
  if (problems.length && raw.LINGO_ALLOW_UNSAFE_PLUS !== 'true') {
    throw new Error(`Refusing to start in production: ${problems.join('; ')}. Fix these, set LINGO_PLUS_MODE=off, or set LINGO_ALLOW_UNSAFE_PLUS=true on purpose.`)
  }
  return problems
}

export const env = Env.parse(process.env)
/** Problems that LINGO_ALLOW_UNSAFE_PLUS=true let through; index.ts logs them at startup. */
export const allowedPlusProblems = assertPlusSafe(env, process.env)
