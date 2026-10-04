import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { z } from 'zod'
import { DATA_DIR } from '../freq'

/** File cache for Nova responses (LING-002 §4). Gitignored under packages/pipeline/data/.cache/. */
export type AiKind = 'gloss' | 'quiz'
export interface CacheEntry<T> { v: 1; kind: AiKind; identity: Record<string, unknown>; model: string; output: T; usage: { inputTokens: number; outputTokens: number }; at: string; /** gloss: the attempt that was accepted (1 = first) */ attempts?: number }

/** '\n' → ' ', collapse whitespace, trim (case preserved). */
export function normalizeCue(cue: string): string {
  return cue.replace(/\s+/g, ' ').trim()
}

const sortKeys = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]))
  return v
}

/** sha256 of JSON.stringify(identity with keys sorted recursively), first 32 hex chars. */
export function cacheKey(identity: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(sortKeys(identity))).digest('hex').slice(0, 32)
}

export const DEFAULT_AI_CACHE_DIR = resolve(DATA_DIR, '.cache', 'ai')

export class AiCache {
  constructor(private readonly dir: string = DEFAULT_AI_CACHE_DIR) {}

  path(kind: AiKind, key: string): string {
    return join(this.dir, kind, `${key}.json`)
  }

  /** Missing / unparsable / schema-failing → null (and the bad file is deleted). Context checks (glossIssues, quizPlanIssues) are the caller's. */
  async get<T>(kind: AiKind, key: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<CacheEntry<T> | null> {
    const file = this.path(kind, key)
    let raw: string
    try { raw = await readFile(file, 'utf8') } catch { return null }
    try {
      const e = JSON.parse(raw) as Partial<CacheEntry<unknown>>
      const output = schema.safeParse(e.output)
      const usage = e.usage
      const ok = e.v === 1 && e.kind === kind && typeof e.model === 'string' && typeof e.at === 'string' && !!e.identity && typeof e.identity === 'object'
        && !!usage && typeof usage.inputTokens === 'number' && typeof usage.outputTokens === 'number' && output.success
      if (ok) return { ...(e as CacheEntry<unknown>), output: output.data } as CacheEntry<T>
    } catch { /* unparsable: fall through and delete */ }
    await this.delete(kind, key)
    return null
  }

  /** mkdir -p; write `${key}.json.tmp` then rename (atomic on one filesystem). */
  async set<T>(kind: AiKind, key: string, entry: CacheEntry<T>): Promise<void> {
    const file = this.path(kind, key)
    await mkdir(dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    await writeFile(tmp, JSON.stringify(entry, null, 2) + '\n')
    await rename(tmp, file)
  }

  async delete(kind: AiKind, key: string): Promise<void> {
    await rm(this.path(kind, key), { force: true })
  }
}
