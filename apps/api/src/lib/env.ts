import { z } from 'zod'
const Env = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(4000),
  AWS_REGION: z.string().default('eu-central-1'),
  BEDROCK_REGION: z.string().default('us-east-1'),
  S3_BUCKET_MEDIA: z.string().optional(),
  CLOUDFRONT_DOMAIN: z.string().optional(),
  /** Lingo Plus feature flag (decision 0012): iap = verify with RVS; demo = everyone has Plus; off = nobody has Plus. */
  LINGO_PLUS_MODE: z.enum(['iap', 'demo', 'off']).default('iap'),
  /** Must be set explicitly whenever LINGO_PLUS_MODE is not off (assertPlusSafe); the default only types the off case. */
  RVS_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  /** The RVS Cloud Sandbox accepts any non-empty secret; production needs the Developer Console shared key. Never logged. */
  RVS_SHARED_SECRET: z.string().min(1).default('sandbox'),
  RVS_BASE: z.string().url().optional(),
})
export type Env = z.infer<typeof Env>
type PlusEnv = Pick<Env, 'LINGO_PLUS_MODE' | 'RVS_ENV' | 'RVS_SHARED_SECRET'> & Partial<Pick<Env, 'RVS_BASE'>>

/** NODE_ENV values where an unsafe Plus setup is expected (local dev, the test suite). Anything else, unset included, is treated as a deploy. */
const LOCAL_NODE_ENVS = new Set(['development', 'test'])
/** The production RVS endpoint (rvs.ts rvsBase); any other RVS_BASE with RVS_ENV=production is a fake or a sandbox. */
export const RVS_PRODUCTION_BASE = 'https://appstore-sdk.amazon.com'

/**
 * What would make Lingo Plus free or broken on a deploy (review-007 M2, PR2-A-M1). Fails closed: empty only in mode off, or when
 * NODE_ENV is development or test. demo gives everyone Plus; a sandbox RVS accepts App Tester receipts from any Fire TV; the default
 * secret fails every real receipt; an RVS_BASE override in production points verification somewhere other than Amazon (PR2-A-L6).
 */
export function plusSafetyProblems(e: PlusEnv, raw: Record<string, string | undefined>): string[] {
  if (e.LINGO_PLUS_MODE === 'off' || LOCAL_NODE_ENVS.has(raw.NODE_ENV ?? '')) return []
  if (e.LINGO_PLUS_MODE === 'demo') return ['LINGO_PLUS_MODE=demo gives everyone Lingo Plus']
  const out: string[] = []
  if (e.RVS_ENV !== 'production') out.push(`RVS_ENV=${e.RVS_ENV} verifies against the RVS Cloud Sandbox, which accepts test receipts`)
  if (!raw.RVS_SHARED_SECRET || e.RVS_SHARED_SECRET === 'sandbox') out.push('RVS_SHARED_SECRET is the default; production RVS needs the Developer Console shared key')
  const base = raw.RVS_BASE?.replace(/\/+$/, '')
  if (e.RVS_ENV === 'production' && base !== undefined && base !== RVS_PRODUCTION_BASE) out.push(`RVS_BASE overrides the production RVS endpoint (${RVS_PRODUCTION_BASE})`)
  return out
}

/**
 * Refuses to start (throws) when Plus is on and RVS_ENV is not set explicitly (no override), or when plusSafetyProblems is not empty
 * unless LINGO_ALLOW_UNSAFE_PLUS=true. Returns the problems it allowed, for index.ts to log.
 */
export function assertPlusSafe(e: PlusEnv, raw: Record<string, string | undefined>): string[] {
  if (e.LINGO_PLUS_MODE !== 'off' && !raw.RVS_ENV) {
    throw new Error(`Refusing to start: LINGO_PLUS_MODE=${e.LINGO_PLUS_MODE} needs RVS_ENV set explicitly to sandbox or production (or set LINGO_PLUS_MODE=off).`)
  }
  const problems = plusSafetyProblems(e, raw)
  if (problems.length && raw.LINGO_ALLOW_UNSAFE_PLUS !== 'true') {
    throw new Error(`Refusing to start with an unsafe Lingo Plus setup (NODE_ENV=${raw.NODE_ENV ?? 'unset'}): ${problems.join('; ')}. Fix these, set LINGO_PLUS_MODE=off, run with NODE_ENV=development, or set LINGO_ALLOW_UNSAFE_PLUS=true on purpose.`)
  }
  return problems
}

export const env = Env.parse(process.env)
/** Problems that LINGO_ALLOW_UNSAFE_PLUS=true let through; index.ts logs them at startup. */
export const allowedPlusProblems = assertPlusSafe(env, process.env)
