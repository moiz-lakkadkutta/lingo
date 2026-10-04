import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { EasJsonAccessor, EasJsonUtils, Platform } from '@expo/eas-json'
import { tokens } from '../../../packages/shared-ui/src/theme/tokens'

const dir = fileURLToPath(new URL('..', import.meta.url))
const json = (f: string) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))
const profile = <P extends Platform>(p: P, name: string) => EasJsonUtils.getBuildProfileAsync(EasJsonAccessor.fromProjectPath(dir), p, name)

describe('phone build config', () => {
  it('eas.json parses with @expo/eas-json: preview is an internal Android APK', async () => {
    const p = await profile(Platform.ANDROID, 'preview')
    expect(p.distribution).toBe('internal')
    expect(p.buildType).toBe('apk')
    expect(p.node).toBe('22.14.0')
    expect(p.pnpm).toBe('9.15.9')
  })
  it('preview iOS is an internal device build and preview-simulator extends it with simulator true', async () => {
    const dev = await profile(Platform.IOS, 'preview')
    expect(dev.distribution).toBe('internal')
    expect(dev.simulator).toBe(false)
    const sim = await profile(Platform.IOS, 'preview-simulator')
    expect(sim.simulator).toBe(true)
    expect(sim.distribution).toBe('internal')
  })
  it('every build profile sets EXPO_PUBLIC_API_URL', async () => {
    const names = await EasJsonUtils.getBuildProfileNamesAsync(EasJsonAccessor.fromProjectPath(dir))
    expect(names.sort()).toEqual(['preview', 'preview-simulator'])
    for (const n of names) for (const p of [Platform.ANDROID, Platform.IOS]) {
      expect((await profile(p, n)).env?.EXPO_PUBLIC_API_URL).toMatch(/^http:\/\//)
    }
  })
  it('app.json has the lingo scheme, both app ids, the camera text, cleartext for the LAN and ground as background colour', () => {
    const { expo } = json('app.json')
    expect(expo.scheme).toBe('lingo')
    expect(expo.ios.bundleIdentifier).toBe('dev.moizp.lingo.phone')
    expect(expo.android.package).toBe('dev.moizp.lingo.phone')
    expect(expo.ios.infoPlist.NSLocalNetworkUsageDescription).toMatch(/Wi-Fi/)
    const plugin = (name: string) => expo.plugins.find((p: unknown) => (Array.isArray(p) ? p[0] : p) === name)
    expect(plugin('expo-camera')[1].cameraPermission).toBe('Lingo uses the camera to scan the code on your TV.')
    expect(plugin('expo-build-properties')[1].android.usesCleartextTraffic).toBe(true)
    expect(plugin('expo-font')).toBe('expo-font')
    expect(expo.backgroundColor).toBe(tokens.color.ground)
  })
  it('package.json has no plain build script and wires eas-build-pre-install', () => {
    const pkg = json('package.json')
    expect(pkg.scripts.build).toBeUndefined()
    expect(pkg.scripts['eas-build-pre-install']).toBe('bash scripts/eas-pre-install.sh')
    expect(pkg.scripts['build:android']).toMatch(/-p android --profile preview$/)
    expect(readFileSync(new URL('../scripts/eas-pre-install.sh', import.meta.url), 'utf8')).toMatch(/EAS_BUILD/)
  })
})
