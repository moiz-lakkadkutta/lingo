import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { TranslateClient } from '@aws-sdk/client-translate'
import { alignNative, FORMALITY_TARGETS, isSpelling, translateSettings, translateWithAws } from '../src/steps/translate'
import { fixtureDeps } from '../src/fixtureDeps'
import { prepare } from '../src/prepare'
import { realClip } from './helpers/realClip'

describe('translateSettings (docs/decisions/0008 decision 11)', () => {
  it('requests brevity always and formality only for supported targets, INFORMAL by default', () => {
    expect(translateSettings('de')).toEqual({ Brevity: 'ON', Formality: 'INFORMAL' })
    expect(translateSettings('en')).toEqual({ Brevity: 'ON' })
    expect(translateSettings('de', 'FORMAL')).toEqual({ Brevity: 'ON', Formality: 'FORMAL' })
    expect(translateSettings('tr', 'FORMAL')).toEqual({ Brevity: 'ON' })
    for (const t of ['de', 'nl', 'fr', 'fr-CA', 'hi', 'it', 'ja', 'ko', 'pt-PT', 'es', 'es-MX']) expect(FORMALITY_TARGETS.has(t), t).toBe(true)
    for (const t of ['en', 'tr', 'ar', 'uk']) expect(FORMALITY_TARGETS.has(t), t).toBe(false)
  })
  it('translateWithAws sends the settings with TranslateText (client mocked, no AWS call)', async () => {
    const send = vi.spyOn(TranslateClient.prototype, 'send').mockImplementation(async () => ({ TranslatedText: 'ok' }) as never)
    try {
      expect(await translateWithAws('Hallo.', 'de', 'en')).toBe('ok')
      expect(await translateWithAws('Hello.', 'en', 'de')).toBe('ok')
      expect(await translateWithAws('Hello.', 'en', 'de', { formality: 'FORMAL' })).toBe('ok')
      const inputs = send.mock.calls.map((c) => (c[0] as unknown as { input: Record<string, unknown> }).input)
      expect(inputs).toEqual([
        { Text: 'Hallo.', SourceLanguageCode: 'de', TargetLanguageCode: 'en', Settings: { Brevity: 'ON' } },
        { Text: 'Hello.', SourceLanguageCode: 'en', TargetLanguageCode: 'de', Settings: { Brevity: 'ON', Formality: 'INFORMAL' } },
        { Text: 'Hello.', SourceLanguageCode: 'en', TargetLanguageCode: 'de', Settings: { Brevity: 'ON', Formality: 'FORMAL' } },
      ])
    } finally { send.mockRestore() }
  })
})

describe('spelled letters', () => {
  it('isSpelling: two or more one-letter tokens after stripping punctuation, nothing else', () => {
    expect(isSpelling('A N N A.')).toBe(true)
    expect(isSpelling('N A.')).toBe(true)
    expect(isSpelling('A N\nN A.')).toBe(true)
    expect(isSpelling('No, A N N A.')).toBe(false)
    expect(isSpelling('I am Pete.')).toBe(false)
    expect(isSpelling('A.')).toBe(false)
    expect(isSpelling('')).toBe(false)
  })
  it('alignNative copies a spelled-letters cue verbatim into every native and never calls translate for it', async () => {
    const translate = vi.fn(async (t: string) => `[${t}]`)
    const out = await alignNative([{ index: 0, startS: 0, endS: 2, text: 'A N N A.' }, { index: 1, startS: 2, endS: 4, text: 'No, A N N A.' }], 'en', ['de', 'tr'], translate)
    expect(out[0]).toEqual({ de: 'A N N A.', tr: 'A N N A.' })
    expect(out[1]).toEqual({ de: '[No, A N N A.]', tr: '[No, A N N A.]' })
    expect(translate.mock.calls.map((c) => c[0])).toEqual(['No, A N N A.', 'No, A N N A.'])
  })
})

describe('prepare binds the clip formality to every translate call', () => {
  const run = async (formality?: 'FORMAL' | 'INFORMAL') => {
    const workRoot = await mkdtemp(join(tmpdir(), 'lingo-p7-'))
    const deps = fixtureDeps('en')
    const translate = vi.fn(async (t: string, _f: string, _to: string, _o?: { formality?: string }) => t.toUpperCase())
    try {
      await prepare({ slug: 'demo-en', source: 's3://unused', lang: 'en', natives: ['de'], workRoot, publish: false, ai: false, ...(formality ? { formality } : {}) }, { ...deps, translate })
    } finally { await rm(workRoot, { recursive: true, force: true }) }
    return translate.mock.calls.map((c) => c[3]?.formality)
  }
  it('defaults to INFORMAL', async () => {
    const f = await run()
    expect(f.length > 0).toBe(true)
    expect(new Set(f)).toEqual(new Set(['INFORMAL']))
  })
  it('passes FORMAL when the clip asks for it', async () => {
    expect(new Set(await run('FORMAL'))).toEqual(new Set(['FORMAL']))
  })
})

describe('cli --formality', () => {
  it('rejects a value other than FORMAL or INFORMAL', async () => {
    const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '..')
    const r = await execa('pnpm', ['exec', 'tsx', 'src/cli.ts', 'prepare', '--clip', 'x', '--source', 's3://unused', '--lang', 'de', '--native', 'en', '--fixture', '--no-publish', '--no-ai', '--formality', 'polite', '--work', join(tmpdir(), 'lingo-p7-cli')], { cwd, reject: false })
    expect(r.exitCode).not.toBe(0)
    expect(r.stderr).toMatch(/--formality must be FORMAL or INFORMAL/)
  }, 30000)
})

// Equivalent of the plan's real.test.ts §10.1 spelled-cue check, numeric/boolean only.
describe('real fixtures: spelled letters (plan §10.1, numeric)', () => {
  it('voa01 en: every spelled-letters cue is copied verbatim and never sent to translate; every other cue is', async () => {
    const sent: string[] = []
    const { clip } = await realClip('voa01', 'en', { translate: async (t) => { sent.push(t); return t.toUpperCase() } })
    let spelled = 0
    for (const c of clip.cues) {
      const flat = c.text.replace(/\n/g, ' ')
      if (isSpelling(c.text)) { spelled++; expect(c.native.de === c.text).toBe(true); expect(sent.includes(flat)).toBe(false) }
    }
    expect(sent.length).toBe(clip.cues.length - spelled + clip.cues.filter((c) => c.text.startsWith('-')).length) // dual cues: one call per line
  })
})
