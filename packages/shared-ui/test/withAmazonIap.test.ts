// apps/expo has no vitest setup, so the config plugin's pure helpers are tested here (plan LING-007 §G3).
import { pemSource, pemTarget, setStoreProperty, type PropertiesItem } from '../../../apps/expo/plugins/withAmazonIap'

describe('withAmazonIap', () => {
  it('withAmazonIap sets openiapStore=amazon once and replaces fireOsEnabled', () => {
    const props: PropertiesItem[] = [
      { type: 'comment', value: 'Project-wide Gradle settings.' },
      { type: 'property', key: 'org.gradle.jvmargs', value: '-Xmx2048m' },
      { type: 'property', key: 'fireOsEnabled', value: 'true' },
      { type: 'empty' },
      { type: 'property', key: 'openiapStore', value: 'play' },
      { type: 'property', key: 'newArchEnabled', value: 'true' },
    ]
    const once = setStoreProperty(props)
    const twice = setStoreProperty(once)
    for (const out of [once, twice]) {
      const stores = out.filter((p) => p.type === 'property' && p.key === 'openiapStore')
      expect(stores).toEqual([{ type: 'property', key: 'openiapStore', value: 'amazon' }])
      expect(out.some((p) => p.type === 'property' && p.key === 'fireOsEnabled')).toBe(false)
      expect(out.filter((p) => p.type === 'property').map((p) => p.type === 'property' && p.key)).toEqual(['org.gradle.jvmargs', 'newArchEnabled', 'openiapStore'])
    }
    expect(twice).toEqual(once)
    expect(setStoreProperty([])).toEqual([{ type: 'property', key: 'openiapStore', value: 'amazon' }])
  })

  it('puts the Appstore PEM in app/src/main/assets and reads it from amazon/', () => {
    expect(pemTarget('/p').replace(/\\/g, '/')).toBe('/p/android/app/src/main/assets/AppstoreAuthenticationKey.pem')
    expect(pemSource('/p').replace(/\\/g, '/')).toBe('/p/amazon/AppstoreAuthenticationKey.pem')
  })
})
