// node --test scripts/check-vega.test.mjs — one valid copy of apps/vega's checked files and one mutation per rule.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkVega } from './check-vega.mjs'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const FILES = ['manifest.toml', 'package.json', 'app.json', 'index.js', 'src', 'types', 'assets/image']

/** A temp repo root with apps/vega (checked files only), pnpm-workspace.yaml and shared-ui's index.tsx; `mutate` edits it. */
function fixture(mutate = () => {}) {
  const root = mkdtempSync(join(tmpdir(), 'check-vega-'))
  const app = join(root, 'apps/vega')
  for (const f of FILES) { mkdirSync(dirname(join(app, f)), { recursive: true }); cpSync(join(repo, 'apps/vega', f), join(app, f), { recursive: true }) }
  cpSync(join(repo, 'pnpm-workspace.yaml'), join(root, 'pnpm-workspace.yaml'))
  mkdirSync(join(root, 'packages/shared-ui/src'), { recursive: true })
  cpSync(join(repo, 'packages/shared-ui/src/index.tsx'), join(root, 'packages/shared-ui/src/index.tsx'))
  const edit = (f, fn) => writeFileSync(join(app, f), fn(readFileSync(join(app, f), 'utf8')))
  const json = (f, fn) => edit(f, (s) => JSON.stringify(fn(JSON.parse(s)), null, 2))
  mutate({ root, app, edit, json })
  try { return checkVega(app, root) } finally { rmSync(root, { recursive: true, force: true }) }
}
const expectOne = (failures, re) => { assert.equal(failures.length, 1, failures.join('\n')); assert.match(failures[0], re) }

test('the committed apps/vega passes', () => assert.deepEqual(fixture(), []))
test('the real repo passes', () => assert.deepEqual(checkVega(join(repo, 'apps/vega'), repo), []))
test('a manifest that does not parse', () => expectOne(fixture(({ edit }) => edit('manifest.toml', (s) => s + '\n[package\n')), /does not parse/))
test('schema-version must be 1', () => expectOne(fixture(({ edit }) => edit('manifest.toml', (s) => s.replace('schema-version = 1', 'schema-version = 2'))), /schema-version/))
test('a missing [package] title', () => expectOne(fixture(({ edit }) => edit('manifest.toml', (s) => s.replace(/^title = .*$/m, ''))), /title is missing/))
test('an icon file that does not exist', () => expectOne(fixture(({ edit }) => edit('manifest.toml', (s) => s.replace('@image/lingo-icon.png', '@image/nope.png'))), /assets\/image\/nope\.png/))
test('app.json name must equal the component id', () => expectOne(fixture(({ json }) => json('app.json', (j) => ({ ...j, name: 'dev.moizp.lingo.other' }))), /app\.json: name/))
test('component id must be <package.id>.main and listed in the process group', () => {
  const f = fixture(({ edit }) => edit('manifest.toml', (s) => s.replace('id = "dev.moizp.lingo"', 'id = "dev.moizp.other"')))
  assert.equal(f.length, 1); assert.match(f[0], /dev\.moizp\.other\.main/)
  expectOne(fixture(({ edit }) => edit('manifest.toml', (s) => s.replace('component-ids = ["dev.moizp.lingo.main"]', 'component-ids = []'))), /processes\.group/)
})
test('two interactive components', () => expectOne(fixture(({ edit }) => edit('manifest.toml', (s) => s.replace('[processes]', '[[components.interactive]]\nid = "x"\n\n[processes]'))), /exactly one/))
test('runtime-module must match the RN track', () => expectOne(fixture(({ edit }) => edit('manifest.toml', (s) => s.replace('react_native_kepler_4@IReactNativeKepler_0', 'loader_2@IKeplerScript_2_0'))), /runtime-module for RN 0\.83/))
test('react must satisfy the kepler peer for the track', () => expectOne(fixture(({ json }) => json('package.json', (j) => ({ ...j, dependencies: { ...j.dependencies, react: '19.1.0' } }))), /react "19\.1\.0"/))
test('a consistent 0.72 track passes; a half-switched one fails', () => {
  const to072 = ({ edit, json }) => {
    edit('manifest.toml', (s) => s.replace('/com.amazon.kepler.runtime.react_native_kepler_4@IReactNativeKepler_0', '/com.amazon.kepler.keplerscript.runtime.loader_2@IKeplerScript_2_0'))
    json('package.json', (j) => ({ ...j, dependencies: { ...j.dependencies, react: '18.2.0', 'react-native': '0.72.0', '@amazon-devices/react-native-kepler': '~2.1.0', '@amazon-devices/react-native-svg': '~2.0.9000000001' } }))
  }
  assert.deepEqual(fixture(to072), [])
  expectOne(fixture((x) => { to072(x); x.json('package.json', (j) => ({ ...j, dependencies: { ...j.dependencies, '@amazon-devices/react-native-svg': '~3.0.9000000001' } })) }), /react-native-svg/)
  expectOne(fixture(({ json }) => json('package.json', (j) => ({ ...j, dependencies: { ...j.dependencies, 'react-native': '0.79.0' } }))), /not a known RN for Vega track/)
})
test('kepler.projectType and targets', () => {
  expectOne(fixture(({ json }) => json('package.json', (j) => ({ ...j, kepler: { ...j.kepler, projectType: 'library' } }))), /projectType/)
  expectOne(fixture(({ json }) => json('package.json', (j) => ({ ...j, kepler: { ...j.kepler, targets: ['phone'] } }))), /targets/)
})
test('index.js must import app.json and register appName', () => {
  const f = fixture(({ edit }) => edit('index.js', () => "import { AppRegistry } from 'react-native'\nAppRegistry.registerComponent('x', () => null)\n"))
  assert.equal(f.length, 2); assert.match(f.join('\n'), /app\.json/); assert.match(f.join('\n'), /registerComponent\(appName/)
})
test('src may import only the Vega-supported surface', () => {
  expectOne(fixture(({ edit }) => edit('src/App.tsx', (s) => "import Video from 'react-native-video'\n" + s)), /"react-native-video" is not allowed/)
  expectOne(fixture(({ edit }) => edit('src/config.ts', (s) => s + "\nconst x = require('fs')\n")), /"fs" is not allowed/)
})
test('the shared-ui declaration may only name exported symbols', () => expectOne(fixture(({ edit }) => edit('types/lingo-shared-ui.d.ts', (s) => s.replace('export function Root(', 'export function Missing(props: RootProps): JSX.Element\n  export function Root('))), /declares Missing/))
test('pnpm-workspace.yaml must exclude apps/vega', () => expectOne(fixture(({ root }) => writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n")), /pnpm-workspace\.yaml must exclude apps\/vega/))
test('an @amazon-devices import must be a dependency', () => {
  const drop = (name) => ({ json }) => json('package.json', (j) => { const d = { ...j.dependencies }; delete d[name]; return { ...j, dependencies: d } })
  expectOne(fixture(drop('@amazon-devices/keplerscript-appstore-iap-lib')), /src imports @amazon-devices\/keplerscript-appstore-iap-lib, which is not in dependencies/)
  expectOne(fixture(drop('@amazon-devices/kepler-media-content-launcher')), /src imports @amazon-devices\/kepler-media-content-launcher, which is not in dependencies/)
})
test('IAP lib 2.12.13 is refused', () => expectOne(fixture(({ json }) => json('package.json', (j) => ({ ...j, dependencies: { ...j.dependencies, '@amazon-devices/keplerscript-appstore-iap-lib': '2.12.13' } }))), /every IAP call fails/))
test('the IAP lib needs its manifest entries', () => {
  expectOne(fixture(({ edit }) => edit('manifest.toml', (s) => s.replace('id = "/com.amazon.kepler.appstore.iap.purchase.core@IAppstoreIAPPurchaseCoreService"', 'id = "/x@Y"'))), /\[\[needs\.module\]\] must list \/com\.amazon\.kepler\.appstore\.iap/)
  expectOne(fixture(({ edit }) => edit('manifest.toml', (s) => s.replace('id = "com.amazon.iap.core.service"', 'id = "x"'))), /\[\[wants\.service\]\] must list com\.amazon\.iap\.core\.service/)
})
test('the Content Launcher needs its module and provider interface', () => {
  expectOne(fixture(({ edit }) => edit('manifest.toml', (s) => s.replace('id = "/com.amazon.kepler.media@IContentLauncher1"', 'id = "/x@Y"'))), /must list \/com\.amazon\.kepler\.media@IContentLauncher1/)
  expectOne(fixture(({ edit }) => edit('manifest.toml', (s) => s.replace('interface_name = "com.amazon.kepler.media.IContentLauncherServer"', 'interface_name = "x"'))), /interface\.provider .* must list com\.amazon\.kepler\.media\.IContentLauncherServer/)
  expectOne(fixture(({ edit }) => edit('manifest.toml', (s) => s.replace('component-id = "dev.moizp.lingo.main"', 'component-id = "dev.moizp.other.main"'))), /IContentLauncherServer/)
})
test('the manifest entries are only required when src imports the library', () => assert.deepEqual(fixture(({ app, edit }) => {
  rmSync(join(app, 'src/platform'), { recursive: true }); rmSync(join(app, 'src/iap'), { recursive: true })
  edit('src/App.tsx', () => "import React from 'react'\nexport default function App() { return null }\n")
  edit('manifest.toml', (s) => s.replace(/^\[needs\][\s\S]*?(?=^\[\[message\]\])/m, '').replace(/^\[\[extras\]\][\s\S]*$/m, ''))
}), []))
test('a leftover template file fails', () => expectOne(fixture(({ app }) => { mkdirSync(join(app, 'iap')); writeFileSync(join(app, 'iap/vegaStore.template.ts'), '') }), /iap\/vegaStore\.template\.ts: template files are superseded/))
