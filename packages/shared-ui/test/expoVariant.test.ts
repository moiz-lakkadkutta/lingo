// apps/expo has no vitest setup, so app.config.js's pure helpers are tested here (as withAmazonIap.test.ts does for the config plugin).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import appConfig, { resolveConfig, variantOf, withScheme, type AppConfig } from '../../../apps/expo/app.config'

const base = (JSON.parse(readFileSync(resolve(__dirname, '../../../apps/expo/app.json'), 'utf8')) as { expo: AppConfig }).expo

describe('apps/expo app.config.js variants', () => {
  it('variantOf: unset or empty is iap, iap and demo pass, anything else throws', () => {
    expect(variantOf({})).toBe('iap')
    expect(variantOf({ LINGO_VARIANT: '' })).toBe('iap')
    expect(variantOf({ LINGO_VARIANT: 'iap' })).toBe('iap')
    expect(variantOf({ LINGO_VARIANT: 'demo' })).toBe('demo')
    for (const bad of ['Demo', 'plus', ' demo']) expect(() => variantOf({ LINGO_VARIANT: bad }), bad).toThrow(/LINGO_VARIANT must be one of iap, demo/)
  })

  it('iap keeps app.json as it is and only adds extra.lingoVariant', () => {
    const out = resolveConfig(base, 'iap')
    expect(out).toEqual({ ...base, extra: { lingoVariant: 'iap' } })
    expect(out.plugins).toContain('./plugins/withAmazonIap')
  })

  it('demo is its own app: name, package, lingodemo scheme, no IAP plugin', () => {
    const out = resolveConfig(base, 'demo')
    expect(out).toMatchObject({ name: 'Lingo Plus Demo', scheme: 'lingodemo', extra: { lingoVariant: 'demo' }, android: { package: 'dev.moizp.lingo.demo' } })
    expect(out.android?.intentFilters?.find((f) => f.action === 'VIEW')?.data).toEqual([{ scheme: 'lingodemo', host: 'clip' }])
    expect(out.android?.intentFilters?.find((f) => f.action === 'MAIN')).toEqual(base.android?.intentFilters?.find((f) => f.action === 'MAIN'))
    expect(out.plugins).not.toContain('./plugins/withAmazonIap')
    expect(out.plugins).toHaveLength(base.plugins!.length - 1)
    expect(out.android?.adaptiveIcon).toEqual(base.android?.adaptiveIcon)
  })

  it('the default export reads LINGO_VARIANT', () => {
    const saved = process.env.LINGO_VARIANT
    try {
      process.env.LINGO_VARIANT = 'demo'
      expect(appConfig({ config: base }).android?.package).toBe('dev.moizp.lingo.demo')
      delete process.env.LINGO_VARIANT
      expect(appConfig({ config: base }).android?.package).toBe('dev.moizp.lingo')
      process.env.LINGO_VARIANT = 'nope'
      expect(() => appConfig({ config: base })).toThrow()
    } finally {
      if (saved === undefined) delete process.env.LINGO_VARIANT
      else process.env.LINGO_VARIANT = saved
    }
  })

  it('withScheme rewrites only lingo data in VIEW filters and accepts data as one object or none', () => {
    const view = { action: 'VIEW', data: [{ scheme: 'lingo', host: 'clip' }, { scheme: 'https', host: 'example.com' }], category: ['DEFAULT'] }
    const main = { action: 'MAIN', category: ['LAUNCHER'] }
    expect(withScheme([main, view], 'lingodemo')).toEqual([main, { ...view, data: [{ scheme: 'lingodemo', host: 'clip' }, { scheme: 'https', host: 'example.com' }] }])
    expect(withScheme([{ action: 'VIEW', data: { scheme: 'lingo', host: 'clip' } }], 'x')).toEqual([{ action: 'VIEW', data: [{ scheme: 'x', host: 'clip' }] }])
    expect(withScheme([{ action: 'VIEW' }], 'x')).toEqual([{ action: 'VIEW', data: [] }])
    expect(withScheme(undefined, 'x')).toEqual([])
    expect(view.data[0]!.scheme).toBe('lingo') // input not mutated
  })
})
