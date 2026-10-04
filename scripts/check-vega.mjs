// Static checks of the Vega project (apps/vega) that need no Vega SDK — docs/plans/LING-008.md §3.5. Run by `pnpm check:vega` and CI.
// Usage: node scripts/check-vega.mjs [appDir] [repoRoot]   → exit 1 with a list of failures.
// Facts behind the track table (read 2026-10-01): npm `@amazon-devices/react-native-kepler` 4.0.1 (latest) peers react ^19.2.0 and is built
// on RN 0.83 (https://www.npmjs.com/package/@amazon-devices/react-native-kepler); 2.1.0 peers react 18.2.0 / react-native 0.72.0.
// runtime-module per track: AmazonAppDev/vega-video-sample manifest.toml (0.83) and react-native-multi-tv-app-sample apps/vega/manifest.toml (0.72).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseToml } from 'smol-toml'

export const TRACKS = {
  '0.83': { runtimeModule: '/com.amazon.kepler.runtime.react_native_kepler_4@IReactNativeKepler_0', react: /^19\.2\.\d+$/, kepler: /^[~^]?4\./, svg: /^[~^]?3\./ },
  '0.72': { runtimeModule: '/com.amazon.kepler.keplerscript.runtime.loader_2@IKeplerScript_2_0', react: /^18\.2\.0$/, kepler: /^[~^]?2\./, svg: /^[~^]?2\./ },
}
export const ALLOWED_IMPORTS = [
  'react', 'react-native', '@lingo/shared-ui', '@amazon-devices/react-native-kepler',
  // LING-007 platform bindings (versions as in AmazonAppDev/vega-video-sample, the RN for Vega 0.83 sample)
  '@amazon-devices/keplerscript-appstore-iap-lib', '@amazon-devices/kepler-media-content-launcher',
  // review-005 H1: per-install device id storage. react-native-mmkv is on Amazon's supported list
  // (https://developer.amazon.com/docs/vega-api/0.24/supported-libraries.html); Amazon's build is npm @amazon-devices/react-native-mmkv.
  '@amazon-devices/react-native-mmkv',
]
/** IAP lib versions where every call returns FAILED:
 *  https://community.amazondeveloper.com/t/using-amazon-devices-keplerscript-appstore-iap-lib-2-12-13-causes-in-app-purchases-to-fail/24746 */
export const BAD_IAP_VERSIONS = ['2.12.13']
/** What the manifest must declare when src imports a platform library (vega-video-sample manifest.toml; docs in apps/vega/README.md). */
export const PLATFORM_NEEDS = {
  '@amazon-devices/keplerscript-appstore-iap-lib': {
    needsModules: ['/com.amazon.kepler.appstore.iap.purchase.core@IAppstoreIAPPurchaseCoreService'],
    wantsServices: ['com.amazon.iap.core.service'],
  },
  '@amazon-devices/kepler-media-content-launcher': {
    needsModules: ['/com.amazon.kepler.media@IContentLauncher1'],
    wantsServices: [],
    providerInterface: 'com.amazon.kepler.media.IContentLauncherServer',
  },
}

const SKIP_DIRS = new Set(['node_modules', 'build', '.git'])
const walk = (dir) => (existsSync(dir) ? readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? (SKIP_DIRS.has(f) ? [] : walk(p)) : [p] }) : [])
const readJson = (p, fail) => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch (e) { fail(`${p}: ${e.message}`); return undefined } }

/** @returns {string[]} failures (empty = pass) */
export function checkVega(app, root) {
  const out = []
  const fail = (m) => out.push(m)
  const rel = (p) => relative(root, p) || p
  const manifestPath = join(app, 'manifest.toml')
  let m
  try { m = parseToml(readFileSync(manifestPath, 'utf8')) } catch (e) { fail(`${rel(manifestPath)} does not parse: ${e.message}`); return out }
  const pkg = readJson(join(app, 'package.json'), fail) ?? {}
  const appJson = readJson(join(app, 'app.json'), fail) ?? {}

  // manifest basics
  if (m['schema-version'] !== 1) fail(`manifest.toml: schema-version must be 1, got ${JSON.stringify(m['schema-version'])}`)
  const p = m.package ?? {}
  for (const k of ['id', 'title', 'version', 'icon']) if (typeof p[k] !== 'string' || !p[k]) fail(`manifest.toml: [package] ${k} is missing`)
  if (typeof p.icon === 'string') {
    const mm = /^@image\/(.+)$/.exec(p.icon)
    if (!mm) fail(`manifest.toml: icon must be "@image/<file>", got ${p.icon}`)
    else if (!existsSync(join(app, 'assets/image', mm[1]))) fail(`manifest.toml: icon ${p.icon} → assets/image/${mm[1]} does not exist`)
  }
  // component ↔ app.json ↔ processes
  const interactive = m.components?.interactive ?? []
  if (interactive.length !== 1) fail(`manifest.toml: expected exactly one [[components.interactive]], found ${interactive.length}`)
  const comp = interactive[0] ?? {}
  const expectedId = `${p.id}.main`
  if (comp.id !== expectedId) fail(`manifest.toml: interactive component id ${JSON.stringify(comp.id)} must be ${JSON.stringify(expectedId)}`)
  if (appJson.name !== comp.id) fail(`app.json: name ${JSON.stringify(appJson.name)} must equal the component id ${JSON.stringify(comp.id)}`)
  const group = m.processes?.group?.[0]?.['component-ids'] ?? []
  if (!group.includes(comp.id)) fail(`manifest.toml: [[processes.group]] component-ids must contain ${JSON.stringify(comp.id)}`)
  // RN track: runtime-module, react, kepler and svg move together
  const rn = pkg.dependencies?.['react-native'] ?? ''
  const trackKey = Object.keys(TRACKS).find((t) => rn.replace(/^[~^]/, '').startsWith(`${t}.`))
  if (!trackKey) fail(`package.json: react-native ${JSON.stringify(rn)} is not a known RN for Vega track (${Object.keys(TRACKS).join(', ')})`)
  else {
    const t = TRACKS[trackKey]
    if (comp['runtime-module'] !== t.runtimeModule) fail(`manifest.toml: runtime-module for RN ${trackKey} must be ${t.runtimeModule}, got ${comp['runtime-module']}`)
    const react = pkg.dependencies?.react ?? ''
    if (!t.react.test(react)) fail(`package.json: react ${JSON.stringify(react)} does not satisfy the react-native-kepler peer for RN ${trackKey} (${t.react})`)
    const kepler = pkg.dependencies?.['@amazon-devices/react-native-kepler'] ?? ''
    if (!t.kepler.test(kepler)) fail(`package.json: @amazon-devices/react-native-kepler ${JSON.stringify(kepler)} is not the RN ${trackKey} line (${t.kepler})`)
    const svg = pkg.dependencies?.['@amazon-devices/react-native-svg'] ?? ''
    if (!t.svg.test(svg)) fail(`package.json: @amazon-devices/react-native-svg ${JSON.stringify(svg)} is not the RN ${trackKey} line (${t.svg})`)
  }
  if (pkg.kepler?.projectType !== 'application') fail('package.json: kepler.projectType must be "application"')
  if (!pkg.kepler?.targets?.includes('tv')) fail('package.json: kepler.targets must include "tv"')
  // entry
  const indexJs = existsSync(join(app, 'index.js')) ? readFileSync(join(app, 'index.js'), 'utf8') : ''
  if (!/import\s*\{\s*name\s+as\s+appName\s*\}\s*from\s*['"]\.\/app\.json['"]/.test(indexJs)) fail('index.js must import { name as appName } from \'./app.json\'')
  if (!/AppRegistry\.registerComponent\(\s*appName\s*,/.test(indexJs)) fail('index.js must call AppRegistry.registerComponent(appName, …)')
  // imports in src: only the Vega-supported surface (CLAUDE.md: no native imports outside the Vega-supported list)
  const imported = new Set()
  for (const f of walk(join(app, 'src')).filter((f) => /\.(t|j)sx?$/.test(f))) {
    const src = readFileSync(f, 'utf8')
    for (const [, spec] of src.matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g).map((x) => [x[0], x[1] ?? x[2] ?? x[3]])) {
      if (spec.startsWith('./') || spec.startsWith('../')) continue
      imported.add(spec)
      if (!ALLOWED_IMPORTS.includes(spec)) fail(`${rel(f)}: import ${JSON.stringify(spec)} is not allowed (allowed: ${ALLOWED_IMPORTS.join(', ')}, relative)`)
    }
  }
  // every @amazon-devices import is an npm dependency of this app (Metro and tsc resolve them from apps/vega/node_modules)
  for (const spec of imported) {
    if (spec.startsWith('@amazon-devices/') && !pkg.dependencies?.[spec]) fail(`package.json: src imports ${spec}, which is not in dependencies`)
  }
  const iap = pkg.dependencies?.['@amazon-devices/keplerscript-appstore-iap-lib']
  if (iap && BAD_IAP_VERSIONS.some((v) => iap.replace(/^[~^=]/, '') === v)) fail(`package.json: @amazon-devices/keplerscript-appstore-iap-lib ${iap} is a version where every IAP call fails; use ~2.13.0`)
  // platform libraries used in src are declared in the manifest
  const ids = (xs) => (xs ?? []).map((x) => x.id)
  const needsModules = ids(m.needs?.module), wantsServices = ids(m.wants?.service)
  const providers = (m.extras ?? []).filter((e) => e.key === 'interface.provider' && e['component-id'] === comp.id)
    .flatMap((e) => e.value?.application?.interface ?? []).map((i) => i.interface_name)
  for (const [lib, need] of Object.entries(PLATFORM_NEEDS)) {
    if (!imported.has(lib)) continue
    for (const id of need.needsModules) if (!needsModules.includes(id)) fail(`manifest.toml: src imports ${lib}, so [[needs.module]] must list ${id}`)
    for (const id of need.wantsServices) if (!wantsServices.includes(id)) fail(`manifest.toml: src imports ${lib}, so [[wants.service]] must list ${id}`)
    if (need.providerInterface && !providers.includes(need.providerInterface)) fail(`manifest.toml: src imports ${lib}, so an [[extras]] interface.provider for ${JSON.stringify(comp.id)} must list ${need.providerInterface}`)
  }
  // the LING-007 templates were moved into src; a leftover copy would drift from the real module
  for (const f of walk(app).filter((f) => /\.template\.[a-z]+$/.test(f))) {
    fail(`${rel(f)}: template files are superseded by the real project (src/, manifest.toml); remove it`)
  }
  // the shared-ui declaration only names what shared-ui exports
  const dts = join(app, 'types/lingo-shared-ui.d.ts'), index = join(root, 'packages/shared-ui/src/index.tsx')
  if (existsSync(dts) && existsSync(index)) {
    const exported = readFileSync(index, 'utf8').split('\n').filter((l) => l.startsWith('export')).join('\n')
    for (const [, name] of readFileSync(dts, 'utf8').matchAll(/export\s+(?:declare\s+)?(?:function|interface|type|const)\s+(\w+)/g)) {
      if (!new RegExp(`\\b${name}\\b`).test(exported)) fail(`types/lingo-shared-ui.d.ts declares ${name}, which packages/shared-ui/src/index.tsx does not export`)
    }
  }
  // the workspace must not pick apps/vega up (its React would be overridden to 19.1)
  const ws = existsSync(join(root, 'pnpm-workspace.yaml')) ? readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8') : ''
  const appRel = relative(root, app)
  if (!new RegExp(`^\\s*-\\s*['"]!${appRel.replace(/[/.]/g, '\\$&')}['"]\\s*(#.*)?$`, 'm').test(ws)) fail(`pnpm-workspace.yaml must exclude ${appRel} ('!${appRel}')`)
  return out
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[3] ?? join(dirname(fileURLToPath(import.meta.url)), '..'))
  const app = resolve(process.argv[2] ?? join(root, 'apps/vega'))
  const failures = checkVega(app, root)
  if (failures.length) { console.error(`check:vega — ${failures.length} failure(s) in ${relative(root, app) || app}:\n${failures.map((f) => `  - ${f}`).join('\n')}`); process.exit(1) }
  console.log(`check:vega — ${relative(root, app)} passes (manifest, app.json, RN track, entry, imports, platform libraries, shared-ui declaration, workspace exclusion)`)
}
