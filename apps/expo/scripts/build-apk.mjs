#!/usr/bin/env node
// Builds a sideloadable Fire OS release APK for one variant (app.config.js):
//   node scripts/build-apk.mjs iap   → dist/lingo-iap.apk   "Lingo", dev.moizp.lingo, Lingo Plus through Amazon IAP (App Tester)
//   node scripts/build-apk.mjs demo  → dist/lingo-demo.apk  "Lingo Plus Demo", dev.moizp.lingo.demo, for the demo API
// EXPO_PUBLIC_API_URL is required: a release APK has no Metro, so the URL is inlined into the embedded JS bundle at build time.
// Steps: `expo prebuild --clean` (android/ is generated and the package id differs per variant, so it is wiped and regenerated),
// then `gradlew assembleRelease` (the template signs release with android/app/debug.keystore, fine for sideloading), then copy.
// https://docs.expo.dev/workflow/continuous-native-generation/ · https://docs.expo.dev/guides/environment-variables/
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const variant = process.argv[2]
const fail = (msg) => { console.error(`[build-apk] ${msg}`); process.exit(1) }

if (variant !== 'iap' && variant !== 'demo') fail('usage: node scripts/build-apk.mjs <iap|demo>')
const apiUrl = process.env.EXPO_PUBLIC_API_URL
if (!apiUrl) fail('EXPO_PUBLIC_API_URL is required, e.g. EXPO_PUBLIC_API_URL=https://api.example.com pnpm apk:' + variant)
try { new URL(apiUrl) } catch { fail(`EXPO_PUBLIC_API_URL is not a URL: "${apiUrl}"`) }

const env = {
  ...process.env,
  EXPO_TV: '1',
  // app.config.js reads LINGO_VARIANT (name, package, scheme); App.tsx reads EXPO_PUBLIC_LINGO_VARIANT (inlined into the bundle).
  LINGO_VARIANT: variant,
  EXPO_PUBLIC_LINGO_VARIANT: variant,
  EXPO_PUBLIC_API_URL: apiUrl,
  NODE_ENV: 'production',
  // prebuild --clean otherwise asks before wiping android/ when the git tree has changes; android/ is generated and ignored.
  EXPO_NO_GIT_STATUS: '1',
  CI: '1',
}
const run = (cmd, args, cwd = root) => {
  console.log(`[build-apk] $ ${cmd} ${args.join(' ')}  (in ${path.relative(root, cwd) || '.'})`)
  execFileSync(cmd, args, { cwd, env, stdio: 'inherit' })
}

const started = Date.now()
console.log(`[build-apk] variant=${variant} EXPO_PUBLIC_API_URL=${apiUrl}`)
// prebuild also rewrites package.json (adds an "ios" script and a "version"); keep the committed file as it is.
const pkg = path.join(root, 'package.json')
const pkgText = fs.readFileSync(pkg, 'utf8')
try { run('npx', ['expo', 'prebuild', '--platform', 'android', '--clean', '--no-install']) } finally { fs.writeFileSync(pkg, pkgText) }
const android = path.join(root, 'android')
// Metro caches transformed modules with EXPO_PUBLIC_* already inlined, so a second build with another API URL reuses the first URL.
fs.rmSync(path.join(os.tmpdir(), 'metro-cache'), { recursive: true, force: true })
// Fire TV Sticks are armeabi-v7a (older sticks) or arm64-v8a (4K / 4K Max); skipping x86 / x86_64 halves the native build.
run(path.join(android, 'gradlew'), ['assembleRelease', '--console=plain', '-PreactNativeArchitectures=armeabi-v7a,arm64-v8a'], android)

const built = path.join(android, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
if (!fs.existsSync(built)) fail(`gradle finished but ${path.relative(root, built)} is missing`)
const out = path.join(root, 'dist', `lingo-${variant}.apk`)
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.copyFileSync(built, out)

// A release APK must carry its JS bundle; without it the app looks for Metro on launch.
const listing = execFileSync('unzip', ['-l', out], { encoding: 'utf8' })
if (!listing.includes('assets/index.android.bundle')) fail(`${path.relative(root, out)} has no assets/index.android.bundle`)

const secs = Math.round((Date.now() - started) / 1000)
console.log(`[build-apk] ${path.relative(root, out)} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB, ${secs} s)`)
console.log(`[build-apk] install: adb install -r ${path.relative(process.cwd(), out)}`)
