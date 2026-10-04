import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PreparedClip } from '@lingo/contracts'
import { prepare } from '../../src/prepare'
import { fixtureDeps } from '../../src/fixtureDeps'
import type { Lang, PrepareDeps } from '../../src/types'

/** Runs prepare() offline on a committed real fixture (test/fixtures/real/) in a temp work root; `--no-publish --no-ai`. */
export async function realClip(name: 'friedlaender' | 'voa01', lang: Lang, override: Partial<PrepareDeps> = {}): Promise<{ clip: PreparedClip; logs: string[] }> {
  const workRoot = await mkdtemp(join(tmpdir(), `lingo-real-${name}-`))
  const logs: string[] = []
  try {
    const deps = { ...fixtureDeps(lang, { transcript: `real/${name}` }), log: (m: string) => { logs.push(m) }, ...override }
    const { clip } = await prepare({ slug: name, source: 's3://unused', lang, natives: [lang === 'de' ? 'en' : 'de'], workRoot, publish: false, ai: false }, deps)
    return { clip, logs }
  } finally { await rm(workRoot, { recursive: true, force: true }) }
}
