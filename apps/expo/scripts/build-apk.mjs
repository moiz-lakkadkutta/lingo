#!/usr/bin/env node
// Builds a sideloadable Fire OS release APK for one variant (app.config.js):
//   node scripts/build-apk.mjs iap   → dist/lingo-iap.apk   "Lingo", dev.moizp.lingo, Lingo Plus through Amazon IAP (App Tester)
//   node scripts/build-apk.mjs demo  → dist/lingo-demo.apk  "Lingo Plus Demo", dev.moizp.lingo.demo, for the demo API
//   --skip-check  skip the GET <api>/iap/status check (offline builds)
// EXPO_PUBLIC_API_URL is required: a release APK has no Metro, so the URL is inlined into the embedded JS bundle at build time.
// Steps: check the API's Plus mode matches the variant, `expo prebuild --clean` (android/ is generated and the package id differs
// per variant, so it is wiped and regenerated), `gradlew assembleRelease` (the template signs release with android/app/debug.keystore,
// fine for sideloading), copy. After a demo build android/ is regenerated as the default (iap) app, so `pnpm android` builds
// dev.moizp.lingo again.
// https://docs.expo.dev/workflow/continuous-native-generation/ · https://docs.expo.dev/guides/environment-variables/
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const variant = args.find((a) => !a.startsWith('--'))
const skipCheck = args.includes('--skip-check')
const fail = (msg) => { console.error(`[build-apk] ${msg}`); process.exit(1) }

if (variant !== 'iap' && variant !== 'demo') fail('usage: node scripts/build-apk.mjs <iap|demo> [--skip-check]')
const apiUrl = process.env.EXPO_PUBLIC_API_URL
if (!apiUrl) fail('EXPO_PUBLIC_API_URL is required, e.g. EXPO_PUBLIC_API_URL=https://api.example.com pnpm apk:' + variant)
try { new URL(apiUrl) } catch { fail(`EXPO_PUBLIC_API_URL is not a URL: "${apiUrl}"`) }

// CI is deliberately not set (and removed if the caller's shell has it): with CI set, Expo 54's `export:embed` ignores the
// --reset-cache that React Native's gradle plugin passes ("CI environment detected, disabling automatic cache reset",
// @expo/cli build/src/export/embed/exportEmbedAsync.js), so the bundle could reuse another build's API URL. prebuild does not
// need CI either: with --no-install it never asks to install, --clean wipes android/ before the malformed-project check, and
// EXPO_NO_GIT_STATUS=1 skips the "uncommitted changes" prompt (android/ is generated and git-ignored).
const { CI: _ci, ...inherited } = process.env
const baseEnv = { ...inherited, EXPO_TV: '1', EXPO_PUBLIC_API_URL: apiUrl, NODE_ENV: 'production', EXPO_NO_GIT_STATUS: '1' }
// app.config.js reads LINGO_VARIANT (name, package, scheme, plugins) and writes extra.lingoVariant, which App.tsx reads.
const env = { ...baseEnv, LINGO_VARIANT: variant }
const run = (cmd, cmdArgs, { cwd = root, runEnv = env } = {}) => {
  console.log(`[build-apk] $ ${cmd} ${cmdArgs.join(' ')}  (in ${path.relative(root, cwd) || '.'})`)
  execFileSync(cmd, cmdArgs, { cwd, env: runEnv, stdio: 'inherit' })
}

// The demo app has no billing connection and relies on the API giving everyone Plus; an IAP API would leave it gated for good.
async function checkPlusMode() {
  const url = new URL('iap/status', apiUrl.endsWith('/') ? apiUrl : apiUrl + '/')
  let mode
  try {
    const res = await fetch(url, { headers: { 'x-device-id': 'build-apk-check' }, signal: AbortSignal.timeout(10_000) })
    const body = await res.json()
    mode = body?.data?.mode
    if (!res.ok || !mode) throw new Error(`HTTP ${res.status} ${JSON.stringify(body).slice(0, 200)}`)
  } catch (e) {
    fail(`GET ${url} failed (${e instanceof Error ? e.message : e}). Is the API up? Pass --skip-check to build offline.`)
  }
  console.log(`[build-apk] ${url} → LINGO_PLUS_MODE=${mode}`)
  if (variant === 'demo' && mode !== 'demo') fail(`the demo app needs an API with LINGO_PLUS_MODE=demo, ${apiUrl} answers mode=${mode}`)
  if (variant === 'iap' && mode !== 'iap') console.warn(`[build-apk] warning: ${apiUrl} answers mode=${mode}, not iap; Lingo Plus purchases will not verify`)
}

// prebuild also rewrites package.json (adds an "ios" script and a "version"); keep the committed file as it is.
const pkg = path.join(root, 'package.json')
const prebuild = (runEnv) => {
  const pkgText = fs.readFileSync(pkg, 'utf8')
  try { run('npx', ['expo', 'prebuild', '--platform', 'android', '--clean', '--no-install'], { runEnv }) } finally { fs.writeFileSync(pkg, pkgText) }
}

const started = Date.now()
console.log(`[build-apk] variant=${variant} EXPO_PUBLIC_API_URL=${apiUrl}`)
if (skipCheck) console.log('[build-apk] --skip-check: not asking the API for its Plus mode')
else await checkPlusMode()
prebuild(env)
const android = path.join(root, 'android')
// Backstop for the cache: Metro caches transformed modules with EXPO_PUBLIC_* already inlined, so a build with another API URL
// could reuse the previous URL. The gradle plugin's --reset-cache handles that as long as CI is unset (see above); this wipe still
// covers the case where the reset is skipped anyway (a Gradle daemon started with CI in its environment, a later CLI change).
fs.rmSync(path.join(os.tmpdir(), 'metro-cache'), { recursive: true, force: true })
// Fire TV Sticks are armeabi-v7a (older sticks) or arm64-v8a (4K / 4K Max); skipping x86 / x86_64 halves the native build.
run(path.join(android, 'gradlew'), ['assembleRelease', '--console=plain', '-PreactNativeArchitectures=armeabi-v7a,arm64-v8a'], { cwd: android })

const built = path.join(android, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
if (!fs.existsSync(built)) fail(`gradle finished but ${path.relative(root, built)} is missing`)
const out = path.join(root, 'dist', `lingo-${variant}.apk`)
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.copyFileSync(built, out)

// A release APK must carry its JS bundle; without it the app looks for Metro on launch.
const listing = execFileSync('unzip', ['-l', out], { encoding: 'utf8' })
if (!listing.includes('assets/index.android.bundle')) fail(`${path.relative(root, out)} has no assets/index.android.bundle`)

// Leave android/ as the default app, so a later `pnpm android` / `expo run:android` does not build dev.moizp.lingo.demo.
if (variant === 'demo') {
  console.log('[build-apk] restoring android/ to the default (iap) app')
  const { LINGO_VARIANT: _v, ...restoreEnv } = baseEnv
  prebuild(restoreEnv)
}

const secs = Math.round((Date.now() - started) / 1000)
console.log(`[build-apk] ${path.relative(root, out)} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB, ${secs} s)`)
console.log(`[build-apk] install: adb install -r ${path.relative(process.cwd(), out)}`)
