# LING-007 — Lingo Plus (IAP sandbox on Fire OS and Vega), Content Launcher, Personalization, Media Controls

Plan for an Opus implementer. Behaviour source: full plan §10 (BRIEF excerpt: one SKU, Challenge mode + unlimited saves + 0.75×, an honest screen, RVS sandbox, a feature flag, platform bindings via the kit). Format follows `docs/plans/LING-003.md`.

Invariants (apply everywhere): sizes are px at 1920×1080 through `px()`. Colours come only from `tokens`. Focus is outline + 1.04 scale in 150 ms through the existing `Focusable`. Every focusable has an `aria-label` that states its purpose. Learner-facing text uses Noto Sans. `shared-ui` imports nothing outside Vega's supported list: `react-native-iap`, `@amazon-devices/*` and `react-native-tvos` are already on the deny-list in `packages/shared-ui/eslint.config.js`. Native IAP and Amazon libraries live only in `apps/expo` and `apps/vega` and are injected through interfaces. All copy goes through `strings.ts` and must pass `pnpm lint:words`, so the words "failed" and "wrong answer" never appear. The kit (`../vega-media-kit`) is **not edited**. Kit gaps are listed under §Escalations. Every Amazon doc URL relied on is in §Sources, and the PR/commit body must cite them.

**Research caveat.** `developer.amazon.com` is blocked by this environment's egress proxy, so no Amazon page could be opened directly. The Amazon facts below come from three sources: search-result excerpts of the cited pages; Amazon's own sample `AmazonAppDev/vega-video-sample` (cloned and read: `manifest.toml`, `src/iap/**`, `src/screens/HomeScreen.tsx`, `src/screens/PlayerScreen.tsx`, `src/utils/AppOverrideMediaControlHandler.ts`); and the published `react-native-iap@16.7.2` and `expo-iap@5.8.2` packages (downloaded and read). The implementer opens each cited page once before coding the matching file and records any difference as a friction log (`pnpm friction "<title>"`).

Done when: `pnpm typecheck && pnpm test && pnpm lint:words` pass (with the known `apps/expo/RemoteBridge.tsx` TS2305 baseline unchanged); every `it(...)` in §Acceptance exists verbatim and passes; the App Tester and VVD checklists in §Manual have been run, or their failures are filed as friction logs and reported to the orchestrator.

---

## 0. Decisions this plan makes (the orchestrator records them as `docs/decisions/0009-lingo-plus.md`)

1. **SKUs.** Amazon subscriptions are a non-buyable *parent* SKU plus buyable *term* SKUs, and the receipt carries both (`sku` = parent, `termSku` = term) ([create IAP items](https://developer.amazon.com/docs/in-app-purchasing/iap-create-and-submit-iap-items.html); the vega-video-sample `IAPManager.grantPurchase` checks `receipt.sku` *or* `receipt.termSku`). Parent is `lingo.plus`; the term SKU, the one the user buys, is **`lingo.plus.monthly`** with a Monthly term. The client always calls `purchase('lingo.plus.monthly')`. The server accepts an RVS result whose `termSku === 'lingo.plus.monthly'` or whose `productId ∈ {'lingo.plus', 'lingo.plus.monthly'}`.
2. **One entitlement, computed on the server.** `plus` = `mode === 'demo'` OR (`mode === 'iap'` AND some `Purchase` row of the learner is *active*). A row is active when `cancelDate === null || cancelDate > now`. Every gate reads the server value: the save limit runs on the server, and Challenge mode and 0.75× read `learner.plus` from `GET /me`. The client never sets `plus`.
3. **Feature flag `LINGO_PLUS_MODE` = `iap` (default) | `demo` | `off`** (server env, exposed by `GET /iap/status`):
   - `iap`: purchases are verified with RVS.
   - `demo`: everyone has Plus. The Plus screen says so plainly. This is for the video and for a flaky sandbox.
   - `off`: nobody has Plus. The Plus screen says it isn't available, and no store call is made.
   Upsell lines that already exist (Explain limit, "Slower · Plus") are unchanged; they lead to the Plus screen, which tells the truth for the current mode.
4. **Verify, then fulfil.** The client sends the receipt to `POST /iap/verify` and calls `notifyFulfillment(FULFILLED)` (Fire OS: `finishTransaction`) **only after** the server answers `plus: true`. Unfulfilled receipts come back on the next `getPurchaseUpdates`, so a network failure retries itself on the next start or Restore.
5. **Cancel.** An app cannot cancel an Amazon subscription. The subscribed state shows one line: "To cancel, open amazon.com/appstoresubscriptions." (URL to confirm, Q3). Cancellation reaches Lingo in three ways: RVS returns `cancelDate` on re-verify; a restore returns the receipt with `isCancelled`; or the server re-verifies lazily (a row whose `verifiedAt` is older than 24 h is re-checked on `GET /iap/status`).
6. **Fire OS library: `react-native-iap@~16.7.2`** (OpenIAP). It needs the peer `react-native-nitro-modules@>=0.36.5`. Its Android build picks the Amazon Appstore SDK when Gradle property `openiapStore=amazon` is set (`android/openiap-store.gradle`, `implementation "io.github.hyochan.openiap:openiap-google-amazon:…"`). The Amazon purchase exposes `purchaseToken` (= receiptId) and `userIdAmazon` (`PurchaseAndroid` type), and these are exactly what RVS needs. Amazon sponsors OpenIAP's Fire OS/Vega support ([blog](https://developer.amazon.com/apps-and-games/blogs/2026/08/amazon-sponsors-openiap-fire-os-vega-os)). A local Expo config plugin sets the property and copies the PEM (§G3).
7. **Vega library: `@amazon-devices/keplerscript-appstore-iap-lib@~2.13.0`, used directly** (as the brief says, and as in Amazon's sample). Do not use `2.12.13`: it makes every IAP call return FAILED ([community bug](https://community.amazondeveloper.com/t/using-amazon-devices-keplerscript-appstore-iap-lib-2-12-13-causes-in-app-purchases-to-fail/24746)). react-native-iap 16 also ships a `.kepler` entry over the same lib; that is Q1, not the default.
8. **Platform bindings go through the kit's public API from shared-ui.** These are `contentLauncher.registerCatalog / onLaunchIntent`, `personalization.reportPlayback` and `mediaControls.setNowPlaying / onControl`. On Vega those are logged no-ops until KIT-007, and the kit has no public way to feed a launch intent in from the app. So shared-ui also takes a **`LaunchSource`** prop (same pattern as `RemoteSource`), and `apps/vega` / `apps/expo` produce it: Vega from its own Content Launcher handler, Fire OS from Android deep links. This is the only Amazon platform code outside the kit, and it is offered upstream (E1).

---

## Files

Four groups. **G1 and G3/G4 are independent. G2 needs only G1's contract types, which are given verbatim below, so G2 can start in parallel.** Use one implementer per group. G3 and G4 have no automated tests beyond typecheck (G3) and none at all (G4: templates). Their logic lives in G2's pure mappers, which are tested.

### G1 — contracts + API

| File | Change |
|---|---|
| `packages/contracts/src/iap.ts` | **new**: everything in §Interfaces/contracts. |
| `packages/contracts/src/index.ts` | **add exactly** `export * from './iap'`. Nothing else changes. |
| `apps/api/prisma/schema.prisma` | add model `Purchase`, add `purchases Purchase[]` to `Learner` (§Interfaces/schema). `Learner.plus` stays as a cache of the last computed entitlement, written on every verify. |
| `apps/api/prisma/migrations/<ts>_purchase/` | `pnpm --filter @lingo/api exec prisma migrate dev --name purchase` (local Postgres per BRIEF), then `pnpm db:generate`. |
| `apps/api/src/lib/env.ts` | add `LINGO_PLUS_MODE: z.enum(['iap','demo','off']).default('iap')`, `RVS_ENV: z.enum(['sandbox','production']).default('sandbox')`, `RVS_SHARED_SECRET: z.string().min(1).default('sandbox')`, `RVS_BASE: z.string().url().optional()`. |
| `apps/api/src/lib/rvs.ts` | **new**: `RvsClient`, `createRvsClient`, `rvsBase`, `parseRvs` (§Interfaces/api). |
| `apps/api/src/lib/entitlement.ts` | **new**: `isActive`, `acceptsSku`, `entitled`, `plusStatus` (§Interfaces/api). |
| `apps/api/src/routes/iap.ts` | **rewrite** as `iapRouter(deps)`: `POST /verify` and `GET /status`. Remove the localhost `RVSSandbox` default: the RVS Cloud Sandbox replaces it. Path segments are `encodeURIComponent`-escaped (the current code interpolates raw client strings into the RVS URL). |
| `apps/api/src/app.ts` | `export interface AppDeps { rvs?: RvsClient; now?: () => Date }`; `createApp(deps: AppDeps = {})`; `app.use('/iap', iapRouter({ rvs: deps.rvs ?? createRvsClient(), now: deps.now ?? (() => new Date()) }))`. `createServer()` is unchanged (it calls `createApp()`). |
| `apps/api/src/routes/me.ts` | **two edits only** (LING-005/006 also edit this file; apply these as a small, separate commit): (a) in `POST /words` replace `if (!l.plus) {` with `if (!(await entitled(l.id)))`, and replace the literal `20` with `FREE_SAVES_PER_DAY` from `@lingo/contracts`; (b) in `GET /` return `{ ...l, plus: await entitled(l.id) }`. Import `entitled` from `../lib/entitlement`. |
| `apps/api/test/rvs.test.ts`, `apps/api/test/entitlement.test.ts` | pure tests (no DB). |
| `apps/api/test/iap.test.ts` | supertest + Postgres + a fake `RvsClient` (DB pattern as in `realtime.test.ts`; random `x-device-id` per test). |
| `apps/api/test/fixtures/rvs.ts` | **new**: `rvsActive`, `rvsCancelled`, `rvsOtherSku` JSON bodies (fields as below; dates are epoch ms). |

### G2 — shared-ui (pure logic + Plus screen + platform hooks)

| File | Change |
|---|---|
| `packages/shared-ui/src/plus/types.ts` | **new**: `PlusStore`, `StoreProduct`, `StoreReceipt`, `PurchaseOutcome`, `noStore` (§Interfaces/shared-ui). |
| `packages/shared-ui/src/plus/amazon.ts` | **new**, pure, no imports beyond types: `mapVegaPurchase`, `mapVegaUpdates`, `mapFireOsPurchase`, `mapFireOsError`, `isPlusReceipt`. These are the tested half of the platform stores. |
| `packages/shared-ui/src/plus/machine.ts` | **new**: Plus screen state machine `PlusState`, `PlusEvent`, `reducePlus`, `initialPlus`. |
| `packages/shared-ui/src/plus/flow.ts` | **new**: `purchaseFlow(store, api)`, `restoreFlow(store, api)`, the async glue (verify, then fulfil) used by the screen and at startup. Takes `api` as a parameter so it is testable. |
| `packages/shared-ui/src/screens/Plus.tsx` | **new**: the honest screen (§Plus screen). |
| `packages/shared-ui/src/platform/launch.ts` | **new**: `LaunchSource`, `createLaunchBus`, `noLaunches`, `parseLaunchUri`, `launchUri`, `catalogItems`. |
| `packages/shared-ui/src/platform/transport.ts` | **new**: `transportToKey`, `createTransportDeduper`. |
| `packages/shared-ui/src/platform/playback.ts` | **new**: `createPlaybackReporter` (throttled Personalization + NowPlaying). |
| `packages/shared-ui/src/platform/usePlatformMedia.ts` | **new** hook used once in `Player.tsx`: kit `mediaControls.onControl` → machine key events (deduped against remote keys); `personalization.reportPlayback` and `mediaControls.setNowPlaying` through the reporter. |
| `packages/shared-ui/src/platform/useLaunchIntents.ts` | **new** hook used once in `Root`: `contentLauncher.registerCatalog(catalogItems(catalog))` once per catalog load; subscribe to kit `contentLauncher.onLaunchIntent` **and** the `LaunchSource` prop; known slug → `onOpen(slug, positionS)`, unknown → ignored with `console.debug`. |
| `packages/shared-ui/src/strings.ts` | **replace the `plus` key** with the block in §Strings. No other key changes. |
| `packages/shared-ui/src/screens/Player.tsx` | **one edit**: `useRemoteKeys(remote, onKey, true)` becomes `const onKeySeen = usePlatformMedia({ clip, state, onKey }); useRemoteKeys(remote, onKeySeen, true)` (§Interfaces). The machine is not changed. |
| `packages/shared-ui/src/index.tsx` | Exports: add `export type { PlusStore, StoreProduct, StoreReceipt, PurchaseOutcome } from './plus/types'`, `export { noStore } from './plus/types'`, `export { createLaunchBus, noLaunches, parseLaunchUri, launchUri } from './platform/launch'`, `export type { LaunchSource } from './platform/launch'`. `RootProps`: add `plusStore?: PlusStore` (default `noStore`) and `launches?: LaunchSource` (default `noLaunches`). `Route`: add `{ name: 'plus' }`. `onPlus = () => setRoute({ name: 'plus' })`. Add `case 'plus'`, which renders `<Screen rail={rail}><Plus …/></Screen>`. On startup, after `/me` loads, run `restoreFlow` once when the status mode is `iap` and the store kind is not `'none'`, then re-fetch `/me`. Call `useLaunchIntents({ catalog, launches, onOpen: (slug, at) => setRoute({ name: 'player', slug, challenge: false }) })`. The rail entry `{ key: 'plus', label: strings.rail.plus }` is added **only if LING-005 has not already rebuilt the rail**. If it has, LING-005's rail/Settings "Lingo Plus" row calls `onPlus`. |
| `packages/shared-ui/test/plus.test.ts`, `amazon.test.ts`, `launch.test.ts`, `transport.test.ts`, `playback.test.ts`, `plusScreen.test.tsx` | the `it(...)` names in §Acceptance, verbatim. `plusScreen.test.tsx` uses the existing react-test-renderer helpers pattern from `render.test.tsx`. |

### G3 — Fire OS (apps/expo)

| File | Change |
|---|---|
| `apps/expo/package.json` | add `"react-native-iap": "~16.7.2"`, `"react-native-nitro-modules": "^0.36.5"` (run `pnpm view react-native-nitro-modules version` and take the newest `0.x` that satisfies the iap peer). |
| `apps/expo/plugins/withAmazonIap.js` | **new** config plugin (same style as `withKeyDownEvents.js`): `withGradleProperties` sets `openiapStore=amazon` (replacing any existing `openiapStore`/`fireOsEnabled` lines). `withDangerousMod('android')` copies `apps/expo/amazon/AppstoreAuthenticationKey.pem` to `android/app/src/main/assets/` **if present**, and otherwise warns once ("Fire OS IAP needs AppstoreAuthenticationKey.pem from the Developer Console → App → Public Key"). Export the pure helpers `setStoreProperty(props)` and `pemTarget(projectRoot)` for a node test. ([integrate Appstore SDK](https://developer.amazon.com/docs/appstore-sdk/integrate-appstore-sdk.html): the PEM goes in `app/src/main/assets`; [troubleshooting](https://developer.amazon.com/docs/appstore-sdk/appstore-sdk-troubleshooting.html).) |
| `apps/expo/app.json` | add `"./plugins/withAmazonIap"` to `plugins`; add `"scheme": "lingo"` and an Android intent filter `{ "action": "VIEW", "data": [{ "scheme": "lingo", "host": "clip" }], "category": ["BROWSABLE", "DEFAULT"] }` (deep link target for Fire TV catalog/launcher integration). |
| `apps/expo/.gitignore` | add `amazon/AppstoreAuthenticationKey.pem` (it is a key; never commit it). |
| `apps/expo/amazon.sdktester.json` | **new**: App Tester fallback catalog (§Manual A). The Developer Console export ("Export Multiple IAPs / JSON") replaces it once the items exist. |
| `apps/expo/src/fireosStore.ts` | **new**: `createFireOsStore(): PlusStore` over react-native-iap (§Interfaces/G3). All response shaping goes through `mapFireOsPurchase` / `mapFireOsError` from shared-ui. |
| `apps/expo/src/LaunchBridge.tsx` | **new**: `Linking.getInitialURL()` + `Linking.addEventListener('url')` → `parseLaunchUri` → `launchBus.emit`. |
| `apps/expo/App.tsx` | module-level `const plusStore = createFireOsStore()` and `const launchBus = createLaunchBus()`; render `<LaunchBridge emit={launchBus.emit} />`; pass `plusStore` and `launches={launchBus}` to `Root`. |
| `apps/expo/README.md` | an "IAP sandbox" section: the four App Tester commands (§Manual A) and the PEM note, plus a link to the cited docs. |
| `apps/expo/test/withAmazonIap.test.ts` | **only if** apps/expo has a vitest setup. If it does not, put the test in `packages/shared-ui/test/` and import the plugin by relative path. |

### G4 — Vega (apps/vega; templates, created on a machine with the Vega SDK)

| File | Change |
|---|---|
| `apps/vega/iap/vegaStore.template.ts` | **new**: `createVegaStore(): PlusStore` over `PurchasingService` from `@amazon-devices/keplerscript-appstore-iap-lib` (§Interfaces/G4). Enum → string through an explicit switch; never `Enum[code]`. |
| `apps/vega/platform/contentLauncher.template.ts` | **new**: `registerLingoContentLauncher(emit, knownSlugs)` with `ContentLauncherServerComponent` from `@amazon-devices/kepler-media-content-launcher`, following vega-video-sample `HomeScreen.tsx`: `factory.getOrMakeServer().setHandler({ handleLaunchContent(contentSearch, autoPlay) })`. Takes the first external id whose name is `lingo_slug` (fallback: first value that `knownSlugs()` contains). Known → `emit({ itemId: slug, source: autoPlay ? 'voice' : 'search' })` and `SUCCESS`; otherwise it answers with the failure status the doc names (Q5). |
| `apps/vega/manifest.additions.template.toml` | **new**: the entries to merge into the Vega CLI's `manifest.toml` (§Vega manifest). |
| `apps/vega/App.template.tsx` | add `plusStore={createVegaStore()}` and `launches={launchBus}`; call `registerLingoContentLauncher(launchBus.emit, () => knownSlugs)` once at module level. |
| `apps/vega/README.md` | add: `pnpm add @amazon-devices/keplerscript-appstore-iap-lib@~2.13.0 @amazon-devices/kepler-media-content-launcher@~2.0.22` (versions from vega-video-sample `package.json`); merge the manifest additions; package id = **`dev.moizp.lingo`**, the Fire OS package. The sample manifest says an existing Fire TV app must reuse its application id for IAP to keep working. Add the VVD checklist link (§Manual B). |

No change to `packages/pipeline`, `infra`, the phone app, or `../vega-media-kit`.

---

## Interfaces (typed; implement exactly)

### contracts — `packages/contracts/src/iap.ts`

```ts
import { z } from 'zod'
export const PLUS_PARENT_SKU = 'lingo.plus' as const
export const PLUS_SKU = 'lingo.plus.monthly' as const
export const FREE_SAVES_PER_DAY = 20
export const PlusMode = z.enum(['iap', 'demo', 'off'])
export const IapStore = z.enum(['amazon-fireos', 'amazon-vega'])
/** POST /iap/verify body. receiptId/userId are opaque Amazon strings; length-capped because they become URL path segments. */
export const VerifyReceipt = z.object({
  store: IapStore,
  receiptId: z.string().min(1).max(512),
  userId: z.string().min(1).max(256),
  sku: z.enum([PLUS_PARENT_SKU, PLUS_SKU]),
})
export const VerifyResult = z.object({
  plus: z.boolean(),
  /** 'active' | 'cancelled' (valid receipt, cancelDate passed) | 'invalid' (RVS 400/497 or wrong SKU) | 'unavailable' (RVS 5xx/network/496, or mode !== 'iap') */
  outcome: z.enum(['active', 'cancelled', 'invalid', 'unavailable']),
  /** true → the client must notifyFulfillment(FULFILLED); false → do not fulfil (retry later) */
  fulfil: z.boolean(),
})
export const PlusStatus = z.object({
  mode: PlusMode, plus: z.boolean(), sku: z.literal(PLUS_SKU),
  /** null unless an RVS row exists */
  renewsAt: z.string().datetime().nullable(), cancelsAt: z.string().datetime().nullable(),
  freeSavesPerDay: z.number().int(), savesToday: z.number().int().min(0),
})
export type PlusMode = z.infer<typeof PlusMode>; export type IapStore = z.infer<typeof IapStore>
export type VerifyReceipt = z.infer<typeof VerifyReceipt>; export type VerifyResult = z.infer<typeof VerifyResult>; export type PlusStatus = z.infer<typeof PlusStatus>
```

### schema — `apps/api/prisma/schema.prisma`

```prisma
model Purchase {
  id             String    @id @default(cuid())
  learnerId      String
  learner        Learner   @relation(fields: [learnerId], references: [id], onDelete: Cascade)
  store          String    // 'amazon-fireos' | 'amazon-vega'
  receiptId      String    @unique
  amazonUserId   String
  productId      String
  termSku        String?
  purchaseDate   DateTime
  cancelDate     DateTime?
  renewalDate    DateTime?
  testTransaction Boolean
  verifiedAt     DateTime
  raw            Json
  @@index([learnerId])
}
// Learner: add   purchases Purchase[]
```

The same receipt posted from a second learner moves `learnerId` to the newest poster (upsert on `receiptId`). One Amazon account maps to one Lingo learner at a time; record this in the decision.

### api — `apps/api/src/lib/rvs.ts`, `entitlement.ts`, `routes/iap.ts`

```ts
// rvs.ts — RVS Cloud Sandbox: https://appstore-sdk.amazon.com/sandbox/version/1.0/verifyReceiptId/developer/{secret}/user/{userId}/receiptId/{receiptId}
// Production: https://appstore-sdk.amazon.com/version/1.0/verifyReceiptId/developer/{secret}/user/{userId}/receiptId/{receiptId}
// Sandbox secret may be any non-empty string. Vega uses the same RVS (vega-rvs-overview).
export interface RvsReceipt {
  receiptId: string; productId: string; parentProductId?: string | null; termSku?: string | null; productType: string
  purchaseDate: number; cancelDate: number | null; renewalDate?: number | null; testTransaction: boolean; autoRenewing?: boolean
}
export type RvsResult =
  | { ok: true; receipt: RvsReceipt }
  | { ok: false; status: number; reason: 'invalid_receipt' | 'invalid_secret' | 'invalid_user' | 'rvs_error' | 'network' | 'bad_body' }
export interface RvsClient { verify(userId: string, receiptId: string): Promise<RvsResult> }
/** env.RVS_BASE ?? (env.RVS_ENV === 'production' ? 'https://appstore-sdk.amazon.com' : 'https://appstore-sdk.amazon.com/sandbox') */
export function rvsBase(e: { RVS_ENV: 'sandbox' | 'production'; RVS_BASE?: string }): string
/** 200 → parseRvs(body); 400 → invalid_receipt; 496 → invalid_secret; 497 → invalid_user; 5xx/other → rvs_error; fetch throws/timeout (5 s AbortController) → network.
 *  Segments are encodeURIComponent'd. Never logs the secret. */
export function createRvsClient(opts?: { base?: string; secret?: string; fetch?: typeof fetch; timeoutMs?: number }): RvsClient
/** Zod-parses the RVS JSON (fields above; extra fields kept in raw). Missing productId/receiptId/purchaseDate → null. */
export function parseRvs(body: unknown): RvsReceipt | null

// entitlement.ts
export function isActive(r: { cancelDate: number | Date | null }, now: Date): boolean   // null or > now
export function acceptsSku(r: Pick<RvsReceipt, 'productId' | 'termSku'>): boolean         // termSku === PLUS_SKU || productId ∈ {PLUS_PARENT_SKU, PLUS_SKU}
/** mode demo → true; off → false; iap → any Purchase of learnerId with cancelDate null or > now. Reads env.LINGO_PLUS_MODE unless `mode` given. */
export function entitled(learnerId: string, opts?: { mode?: PlusMode; now?: Date }): Promise<boolean>
/** Builds PlusStatus; when mode is iap and the newest Purchase has verifiedAt older than 24 h, re-verifies it through rvs first (a failure keeps the stored row). */
export function plusStatus(learnerId: string, deps: { rvs: RvsClient; now: () => Date; mode?: PlusMode }): Promise<PlusStatus>

// routes/iap.ts
export function iapRouter(deps: { rvs: RvsClient; now: () => Date }): Router
// POST /iap/verify  (x-device-id → learner upsert as in me.ts), body VerifyReceipt → VerifyResult
//   mode !== 'iap'                          → { plus: entitled, outcome: 'unavailable', fulfil: false }
//   rvs not ok, reason invalid_receipt|invalid_user → { plus: entitled, outcome: 'invalid', fulfil: false }   (HTTP 200; the store keeps the receipt)
//   rvs not ok, other                       → { plus: entitled, outcome: 'unavailable', fulfil: false }
//   ok but !acceptsSku                      → { outcome: 'invalid', fulfil: false }  (log productId)
//   ok, RVS_ENV production and testTransaction → { outcome: 'invalid', fulfil: false }
//   ok → upsert Purchase by receiptId, set learner.plus = await entitled(); outcome = isActive ? 'active' : 'cancelled'; fulfil: true
//        (a cancelled receipt is still "fulfilled" so Amazon stops re-delivering it; plus becomes false)
// GET /iap/status → PlusStatus  (savesToday = SavedWord count since local midnight, same rule as POST /me/words)
```

### shared-ui — `src/plus/types.ts`

```ts
import type { IapStore } from '@lingo/contracts'
export interface StoreProduct { sku: string; /** localized, from the store, e.g. "2,99 €"; never hard-coded */ price: string; title: string }
export interface StoreReceipt { receiptId: string; userId: string; sku: string; termSku: string | null; cancelled: boolean }
export type PurchaseOutcome =
  | { kind: 'purchased'; receipt: StoreReceipt }
  | { kind: 'alreadyOwned' }          // → run restore
  | { kind: 'userCancelled' }         // back to the offer, no message
  | { kind: 'notSupported' }          // store absent / sandbox not set up
  | { kind: 'error'; detail: string } // detail is for logs only, never shown
export interface PlusStore {
  readonly kind: IapStore | 'none'
  /** Fire OS: initConnection + listeners. Vega: no-op. Idempotent. */
  init(): Promise<void>
  product(sku: string): Promise<StoreProduct | null>
  purchase(sku: string): Promise<PurchaseOutcome>
  /** Fire OS: getAvailablePurchases(). Vega: getPurchaseUpdates({ reset: true }) until !hasMore. Only receipts for which isPlusReceipt() holds. */
  restore(): Promise<StoreReceipt[]>
  /** Fire OS: finishTransaction({ purchase, isConsumable: false }). Vega: notifyFulfillment({ receiptId, fulfillmentResult: FULFILLED }). */
  fulfil(receiptId: string): Promise<void>
  dispose(): void
}
/** kind 'none'; product → null; purchase → notSupported; restore → []; fulfil/init/dispose no-ops. */
export const noStore: PlusStore
```

### shared-ui — `src/plus/amazon.ts` (pure; the code paths that cannot run without a device are thin wrappers over these)

```ts
export type VegaCode = 'SUCCESSFUL' | 'ALREADY_PURCHASED' | 'INVALID_SKU' | 'FAILED' | 'NOT_SUPPORTED' | 'UNKNOWN'
export interface VegaReceiptLike { receiptId: string; sku: string; termSku?: string | null; isCancelled?: boolean; cancelDate?: unknown }
export interface VegaPurchaseLike { code: VegaCode; userId?: string | null; receipt?: VegaReceiptLike | null }
export interface VegaUpdatesLike { code: VegaCode; userId?: string | null; receipts: VegaReceiptLike[]; hasMore: boolean }
/** SUCCESSFUL+receipt+userId → purchased; ALREADY_PURCHASED → alreadyOwned; NOT_SUPPORTED → notSupported;
 *  INVALID_SKU/FAILED/UNKNOWN → error. (The Vega lib has no separate user-cancel code: a dismissed dialog reports FAILED, so the screen
 *  treats error after purchase as "nothing happened" — see machine: error from purchase returns to offer with a neutral line.) */
export function mapVegaPurchase(r: VegaPurchaseLike): PurchaseOutcome
/** SUCCESSFUL → receipts mapped (cancelled = isCancelled === true || cancelDate != null), filtered by isPlusReceipt; other codes → []. */
export function mapVegaUpdates(r: VegaUpdatesLike): StoreReceipt[]

export interface FireOsPurchaseLike { productId: string; purchaseToken?: string | null; userIdAmazon?: string | null; store?: string; purchaseState?: string; ids?: string[] | null }
/** purchaseToken (=Amazon receiptId) and userIdAmazon required → receipt (sku = productId, termSku = PLUS_SKU when ids/productId contain it); else null. */
export function mapFireOsPurchase(p: FireOsPurchaseLike): StoreReceipt | null
/** react-native-iap ErrorCode strings: 'user-cancelled' → userCancelled; 'already-owned' → alreadyOwned; 'feature-not-supported'|'iap-not-available'|'service-unavailable' → notSupported; else error. */
export function mapFireOsError(e: { code?: string; message?: string }): PurchaseOutcome
/** sku or termSku ∈ { PLUS_PARENT_SKU, PLUS_SKU } */
export function isPlusReceipt(r: { sku: string; termSku?: string | null }): boolean
```

### shared-ui — `src/plus/machine.ts` + `flow.ts`

```ts
export type PlusState =
  | { phase: 'loading' }
  | { phase: 'unavailable' }                       // mode off, or store.kind === 'none'
  | { phase: 'demo' }                              // mode demo
  | { phase: 'offer'; price: string | null; note: 'none' | 'retry' | 'restoreEmpty' }  // price null → "Price unavailable right now." and Subscribe hidden
  | { phase: 'busy'; step: 'purchasing' | 'verifying' | 'restoring'; price: string | null }
  | { phase: 'active'; renewsAt: string | null; cancelsAt: string | null }
export type PlusEvent =
  | { type: 'loaded'; status: PlusStatus; storeKind: PlusStore['kind']; product: StoreProduct | null }
  | { type: 'subscribe' } | { type: 'restore' }
  | { type: 'purchaseOutcome'; outcome: PurchaseOutcome }
  | { type: 'verified'; result: VerifyResult } | { type: 'verifyError' }
  | { type: 'restored'; results: VerifyResult[] }
export const initialPlus: PlusState
/** Pure. Rules:
 * loaded: mode off || storeKind none → unavailable; mode demo → demo; status.plus → active; else offer{price: product?.price ?? null, note:'none'}.
 * subscribe (offer with price) → busy purchasing. restore (offer|active) → busy restoring.
 * purchaseOutcome: purchased → busy verifying; alreadyOwned → busy restoring; userCancelled → offer note none; notSupported → unavailable; error → offer note 'retry'.
 * verified: plus → active; else offer note 'retry'. verifyError → offer note 'retry'.
 * restored: any plus → active; none → offer note 'restoreEmpty'.
 * Any event not listed for the current phase → same state (reference-equal). */
export function reducePlus(s: PlusState, e: PlusEvent): PlusState

// flow.ts — api is Root's api<T>(path, init)
export type Api = <T>(path: string, init?: RequestInit) => Promise<T>
/** store.purchase(PLUS_SKU) → if purchased: POST /iap/verify → if result.fulfil: store.fulfil(receiptId). Returns the events to feed reducePlus, in order. Never throws. */
export function purchaseFlow(store: PlusStore, api: Api): Promise<PlusEvent[]>
/** store.restore() → verify each receipt (sequentially) → fulfil where result.fulfil → [{ type: 'restored', results }]. Never throws; a verify error counts as { plus:false, outcome:'unavailable', fulfil:false }. */
export function restoreFlow(store: PlusStore, api: Api): Promise<PlusEvent[]>
```

### shared-ui — `src/platform/*`

```ts
// launch.ts
import type { CatalogItem, LaunchIntent } from '@moizp/vega-media-kit'
export interface LaunchSource { subscribe(cb: (i: LaunchIntent) => void): () => void }
export function createLaunchBus(): LaunchSource & { emit(i: LaunchIntent): void }  // emits before any subscriber are queued (max 1, newest wins) so a cold-start deep link is not lost
export const noLaunches: LaunchSource
/** 'lingo://clip/<slug>' or 'lingo://clip/<slug>?t=<seconds>' → { itemId: slug, positionS?, source: 'unknown' }; slug must match /^[a-z0-9-]{1,80}$/; anything else → null. */
export function parseLaunchUri(uri: string): LaunchIntent | null
export function launchUri(slug: string): string  // 'lingo://clip/' + slug
/** Unique by slug across continue/justRight/harder/fresh, in that order: { id: slug, title, durationS, posterUrl ?? undefined, uri: launchUri(slug) }. */
export function catalogItems(c: Catalog): CatalogItem[]

// transport.ts
import type { RemoteKey, TransportControl } from '@moizp/vega-media-kit'
/** play→'play', pause→'pause', togglePlayPause→'playPause', seekForward→'fastForward', seekBackward→'rewind', stop→'back', next|previous→null (no clip-to-clip in the Player). */
export function transportToKey(c: TransportControl): RemoteKey | null
/** Drops a transport whose mapped key arrived as a remote key within windowMs (default 300) — Vega can deliver the same press as a TVEventHandler key and a VMC command. */
export function createTransportDeduper(windowMs?: number): { sawKey(k: RemoteKey, now: number): void; accept(k: RemoteKey, now: number): boolean }

// playback.ts
export type PlaybackPhase = 'playing' | 'paused' | 'ended' | 'exit'
export interface PlaybackSample { slug: string; title: string; positionS: number; durationS: number; phase: PlaybackPhase }
/** report(sample) is called: on every phase change; every intervalMs (default 30 000) while 'playing'; never twice for the same (phase, floor(positionS)).
 *  The kit's reportPlayback has no phase argument (E3), so 'ended' reports positionS = durationS. */
export function createPlaybackReporter(opts: { report(s: PlaybackSample): void; intervalMs?: number }): { update(s: PlaybackSample, now: number): void }

// usePlatformMedia.ts
/** Returns the wrapped key handler; Player passes it to useRemoteKeys. */
export function usePlatformMedia(a: { clip: ClipDetail; state: PlayerState; onKey(ev: RemoteEvent): void }): (ev: RemoteEvent) => void
//  - mediaControls.onControl(c => { const k = transportToKey(c); if (k && deduper.accept(k, Date.now())) a.onKey({ key: k, longPress: false, repeat: false }) })
//  - returns onKey wrapped so each remote key first calls deduper.sawKey(key, now)
//  - reporter.update from state.phase/positionS: 'playing'|'holding' → playing; 'explain'|'sheet'|paused → paused; state.ended → ended; unmount → exit
//  - reporter.report → personalization.reportPlayback(clip.slug, positionS, durationS) and mediaControls.setNowPlaying({ title: clip.title, durationS, positionS, playing })
//  Exact Player edit: replace `useRemoteKeys(remote, onKey, true)` with
//    `const onKeySeen = usePlatformMedia({ clip, state, onKey }); useRemoteKeys(remote, onKeySeen, true)`
```

### G3 — `apps/expo/src/fireosStore.ts`

```ts
import * as Iap from 'react-native-iap'
export function createFireOsStore(): PlusStore
// kind 'amazon-fireos'
// init: await Iap.initConnection(); register Iap.purchaseUpdatedListener / purchaseErrorListener once; resolve the pending purchase() promise from them
//       (map with mapFireOsPurchase / mapFireOsError). Keep the last Purchase object per receiptId for fulfil().
// product: (await Iap.fetchProducts({ skus: [PLUS_SKU], type: 'subs' }))?.[0] → { sku, price: displayPrice, title }
// purchase: await Iap.requestPurchase({ request: { google: { skus: [PLUS_SKU] } }, type: 'subs' }) then await the listener (60 s timeout → error)
// restore: (await Iap.getAvailablePurchases()).map(mapFireOsPurchase).filter(nonNull).filter(isPlusReceipt)
// fulfil: Iap.finishTransaction({ purchase: kept[receiptId], isConsumable: false }) (on Amazon this is notifyFulfillment FULFILLED)
// dispose: remove listeners; Iap.endConnection()
```

Check each name against the 16.7.x README before coding (`fetchProducts`, `requestPurchase` with `type: 'subs'`, `getAvailablePurchases`, `finishTransaction`, `ErrorCode.UserCancelled = 'user-cancelled'`, `PurchaseAndroid.userIdAmazon`, `displayPrice` were read from `src/types.ts` / `src/index.ts` of the published 16.7.2 tarball).

### G4 — `apps/vega/iap/vegaStore.template.ts`

```ts
import { PurchasingService, PurchaseResponseCode, PurchaseUpdatesResponseCode, FulfillmentResult } from '@amazon-devices/keplerscript-appstore-iap-lib'
export function createVegaStore(): PlusStore
// kind 'amazon-vega'
// product: PurchasingService.getProductData({ skus: [PLUS_SKU] }) → productDataMap[PLUS_SKU] → { price, title }   (field names per the Vega IAP API reference; record in friction log if different)
// purchase: const r = await PurchasingService.purchase({ sku: PLUS_SKU }); return mapVegaPurchase({ code: purchaseCode(r.responseCode), userId: r.userData?.userId, receipt: r.receipt })
// restore: loop PurchasingService.getPurchaseUpdates({ reset: true }) then { reset: false } while hasMore; mapVegaUpdates({ code: updatesCode(r.responseCode), userId: r.userData?.userId, receipts: r.receiptList, hasMore: r.hasMore })
// fulfil: PurchasingService.notifyFulfillment({ receiptId, fulfillmentResult: FulfillmentResult.FULFILLED })
// purchaseCode / updatesCode: explicit `switch (code) { case PurchaseResponseCode.SUCCESSFUL: return 'SUCCESSFUL' … default: return 'UNKNOWN' }`
```

(API shape from vega-video-sample `src/iap/utils/IAPManager.tsx` and `IAPSDKResponseHandler.tsx`: `purchase({ sku })`, `getPurchaseUpdates({ reset })`, `notifyFulfillment({ receiptId, fulfillmentResult })`, `response.userData.userId`, `response.receipt`, `response.receiptList`, `response.hasMore`, codes `SUCCESSFUL | ALREADY_PURCHASED | INVALID_SKU | FAILED | NOT_SUPPORTED`.)

### Vega manifest — `apps/vega/manifest.additions.template.toml`

Copied from vega-video-sample `manifest.toml` and reduced to what Lingo uses. The Vega CLI's generated `[package]`/`[components]` stay as they are. Set `[package] id = "dev.moizp.lingo"`. Add `"com.amazon.category.kepler.media"` to the main interactive component's `categories`.

```toml
# IAP
[[wants.service]]
id = "com.amazon.iap.core.service"
[[wants.module]]
id = "/com.amazon.iap.core@IIAPCoreUI"
[[wants.service]]
id = "com.amazon.iap.tester.service"            # App Tester (sandbox)
[[wants.module]]
id = "/com.amazonappstore.iap.tester@IIAPTesterUI"
[[needs.module]]
id = "/com.amazon.kepler.appstore.iap.purchase.core@IAppstoreIAPPurchaseCoreService"
# Content Launcher
[[needs.module]]
id = "/com.amazon.kepler.media@IContentLauncher1"
# Content Personalization (only effective once KIT-007 calls the API; harmless before)
[[wants.service]]
id = "com.amazon.tv.developer.dataservice"
[[wants.privilege]]
id = "com.amazon.tv.content-personalization.privilege.provide-data"
# Media Controls
[[wants.service]]
id = "com.amazon.media.playersession.service"

[[message]]
uri = "pkg://dev.moizp.lingo.main"
sender-privileges = ["*"]
receiver-privileges = ["self"]

[[extras]]
key = "interface.provider"
component-id = "dev.moizp.lingo.main"
[extras.value.application]
[[extras.value.application.interface]]
interface_name = "com.amazon.kepler.media.IContentLauncherServer"
attribute_options = ["partner-id"]
static-values = { partner-id = "LINGO" }      # Q5: real partner id comes from Amazon catalog onboarding
[[extras.value.application.interface]]
interface_name = "com.amazon.kepler.media.IMediaPlaybackServer"
command_options = ["SkipForward", "SkipBackward"]
features = ["AdvancedSeek"]                     # no VariableSpeed: Vega caps.rate is false (decision 0006)
```

The Content Personalization `extras` interface block (`IContentPersonalizationServer` with `SupportedCustomerLists`/`DataRefreshComponentId`) is **not** added. It requires a headless data-refresh service component that Lingo does not have. It belongs to E3.

---

## Plus screen (`packages/shared-ui/src/screens/Plus.tsx`)

Props: `{ store: PlusStore; api: Api; caps: Caps; onBack(): void; onChanged(): void }`. `onChanged` makes Root re-fetch `/me`, so `learner.plus` updates Challenge mode, 0.75× and the save limit.

On mount: `store.init()`, then `Promise.all([api<PlusStatus>('/iap/status'), store.kind === 'none' ? null : store.product(PLUS_SKU)])` → `loaded`. A rejected status call → `unavailable`. A rejected product call → `product: null`.

Layout: centered column, max width `px(1100)`, safe zone from tokens. The title uses `T variant="display"` (Manrope 800 is allowed for display only) and the rest uses `body`/`title`. At most three focusables, in this order:

| Phase | Text | Focusables (aria-label) |
|---|---|---|
| loading | `strings.plus.loading` (polite live region) | Back (`strings.plus.backLabel`) |
| offer | title · `body(caps.rate)` · `price(p)` or `priceUnavailable` · optional note line (`retry` / `restoreEmpty`) | Subscribe (`subscribeLabel(p)`, `hasTVPreferredFocus`, **absent when price is null**) · Restore (`restoreLabel`) · Back |
| busy | title · `busy[step]` (polite live region) | none: focus parks on an invisible non-focusable view; Back still works through `BackHandler` and only leaves the screen (the flow keeps running and Root's startup restore covers it) |
| active | title · `active` · `renews(date)` or `cancels(date)` when known · `cancelHow` | Restore · Back (`hasTVPreferredFocus`) |
| demo | title · `demo` | Back |
| unavailable | title · `unavailable` | Back |

There is no countdown, no strike-through price, no "most popular" label, and no auto-focus on Subscribe after a user cancel (focus returns to Subscribe only because it is the first item). Dates are formatted with `toLocaleDateString(undefined, { day: 'numeric', month: 'long' })`.

## Strings (replace the `plus` key in `strings.ts`)

```ts
plus: {
  title: 'Lingo Plus',
  body: (rate: boolean) => (rate ? 'Lingo Plus adds Challenge mode, unlimited saved words and slower playback at 0.75×.' : 'Lingo Plus adds Challenge mode and unlimited saved words.'),
  price: (p: string) => `${p} per month`,
  priceUnavailable: 'Price unavailable right now.',
  buy: 'Subscribe', restore: 'Restore purchase', back: 'Back',
  subscribeLabel: (p: string) => `Subscribe to Lingo Plus for ${p} per month`,
  restoreLabel: 'Restore an earlier Lingo Plus purchase', backLabel: 'Back to the previous screen',
  loading: 'Checking Lingo Plus…',
  busy: { purchasing: 'Opening the Amazon purchase…', verifying: 'Confirming with Amazon…', restoring: 'Looking for your purchase…' },
  retry: 'That didn’t go through. Nothing was charged that we can see. Try again or restore.',
  restoreEmpty: 'No Lingo Plus purchase found for this Amazon account.',
  active: 'You have Lingo Plus.',
  renews: (d: string) => `Renews ${d}.`, cancels: (d: string) => `Ends ${d}.`,
  cancelHow: 'To cancel, open amazon.com/appstoresubscriptions.',
  demo: 'Lingo Plus is on for everyone in this demo.',
  unavailable: 'Lingo Plus isn’t available on this device yet.',
},
```

The old `strings.plus.body` is a single string. If LING-005's Settings reads it, it must call `strings.plus.body(caps.rate)`. Grep for `strings.plus.` before merging.

The `retry` sentence "Nothing was charged that we can see" is cautious on purpose. If the reviewer prefers, drop the second sentence (Q6).

---

## Acceptance (`it(...)` names, verbatim)

### apps/api — `test/rvs.test.ts`
- `it('builds the sandbox URL with encoded secret, user and receipt segments')`
- `it('uses the production base when RVS_ENV is production and RVS_BASE overrides both')`
- `it('maps 200 with a valid body to ok and parses epoch-ms dates')`
- `it('maps 400 to invalid_receipt, 496 to invalid_secret, 497 to invalid_user, 500 to rvs_error')`
- `it('maps a thrown fetch and a timeout to network')`
- `it('returns bad_body when a 200 body has no receiptId or productId')`
- `it('never includes the shared secret in a thrown error or log line')`

### apps/api — `test/entitlement.test.ts`
- `it('isActive is true for a null cancelDate and for a cancelDate in the future, false for one in the past')`
- `it('acceptsSku accepts the term SKU or the parent SKU and rejects anything else')`

### apps/api — `test/iap.test.ts` (Postgres; fake RvsClient; `createApp({ rvs, now })`)
- `it('POST /iap/verify with an active sandbox receipt sets plus and asks the client to fulfil')`
- `it('POST /iap/verify with a cancelled receipt stores it, clears plus and still asks the client to fulfil')`
- `it('POST /iap/verify does not grant plus for a receipt of another SKU')`
- `it('POST /iap/verify answers unavailable without fulfil when RVS is down, and plus is unchanged')`
- `it('POST /iap/verify rejects a body with an unknown sku or an overlong receiptId with 400')`
- `it('POST /iap/verify is idempotent for the same receiptId')`
- `it('GET /iap/status reports mode, plus, renewsAt and savesToday')`
- `it('GET /iap/status re-verifies a purchase last verified more than 24 hours ago and drops plus when RVS now shows a cancelDate')`
- `it('demo mode grants plus without any purchase and off mode denies it even with an active purchase')`
- `it('POST /me/words stops at 20 saves a day without plus and does not stop with plus')`
- `it('GET /me returns the computed plus, not the stored column')`

### packages/shared-ui — `test/amazon.test.ts`
- `it('mapVegaPurchase turns SUCCESSFUL with a receipt into purchased with userId and termSku')`
- `it('mapVegaPurchase maps ALREADY_PURCHASED, NOT_SUPPORTED, INVALID_SKU and FAILED')`
- `it('mapVegaUpdates keeps only Plus receipts and marks cancelled ones')`
- `it('mapFireOsPurchase uses purchaseToken as receiptId and userIdAmazon as userId, and returns null without them')`
- `it('mapFireOsError maps user-cancelled, already-owned and not-available codes')`
- `it('isPlusReceipt accepts lingo.plus and lingo.plus.monthly as sku or termSku')`

### packages/shared-ui — `test/plus.test.ts`
- `it('loaded goes to unavailable in off mode or without a store, demo in demo mode, active when plus, offer otherwise')`
- `it('offer without a price ignores subscribe')`
- `it('a purchased outcome moves to verifying and a plus verify result to active')`
- `it('user cancel returns to the offer with no note; an error returns with the retry note')`
- `it('alreadyOwned starts a restore and an empty restore shows restoreEmpty')`
- `it('events that do not apply to the phase return the same state object')`
- `it('purchaseFlow verifies before it fulfils and does not fulfil when the server says fulfil false')`
- `it('restoreFlow verifies each receipt in order and survives a verify error')`

### packages/shared-ui — `test/plusScreen.test.tsx` (react-test-renderer)
- `it('offer shows one sentence, the store price and three focusables with purpose labels')`
- `it('the sentence omits slower playback where caps.rate is false')`
- `it('hides Subscribe and says price unavailable when the store returns no product')`
- `it('active shows the cancel line and no Subscribe')`
- `it('no Plus string contains "failed" or "wrong"')`

### packages/shared-ui — `test/launch.test.ts`
- `it('parseLaunchUri reads lingo://clip/<slug> and an optional t in seconds')`
- `it('parseLaunchUri rejects other schemes, hosts and unsafe slugs')`
- `it('catalogItems dedupes slugs across rows in row order and builds lingo:// uris')`
- `it('createLaunchBus delivers a launch emitted before the first subscriber exactly once')`

### packages/shared-ui — `test/transport.test.ts`
- `it('transportToKey maps play, pause, toggle, seek and stop and ignores next and previous')`
- `it('the deduper drops a transport that follows the same remote key within the window and accepts it after')`

### packages/shared-ui — `test/playback.test.ts`
- `it('reports on every phase change and every 30 s while playing, never twice for the same second and phase')`
- `it('reports ended with the position at the duration')`

### apps/expo (or shared-ui test importing the plugin by path)
- `it('withAmazonIap sets openiapStore=amazon once and replaces fireOsEnabled')`

---

## Manual checklists (no devices in this environment; run on the stick and the VVD)

### A. Fire OS + App Tester (Fire TV stick)

References: [App Tester install/configure](https://developer.amazon.com/docs/in-app-purchasing/iap-install-and-configure-app-tester.html), [RVS Cloud Sandbox](https://developer.amazon.com/docs/in-app-purchasing/rvs-cloud-sandbox.html), [Appstore SDK troubleshooting](https://developer.amazon.com/docs/appstore-sdk/appstore-sdk-troubleshooting.html).

0. Developer Console: create subscription `lingo.plus` with term `lingo.plus.monthly` (Monthly). Export **Multiple IAPs / JSON** and save it over `apps/expo/amazon.sdktester.json`. Download the **Public Key** PEM to `apps/expo/amazon/AppstoreAuthenticationKey.pem`.
   Fallback file content (field names to confirm against the export):
   ```json
   { "lingo.plus": { "itemType": "SUBSCRIPTION", "price": 2.99, "title": "Lingo Plus", "description": "Challenge mode, unlimited saved words, 0.75× playback", "smallIconUrl": "https://example.invalid/plus.png" },
     "lingo.plus.monthly": { "itemType": "SUBSCRIPTION", "price": 2.99, "title": "Lingo Plus, monthly", "description": "Monthly", "smallIconUrl": "https://example.invalid/plus.png", "subscriptionParent": "lingo.plus" } }
   ```
1. Install **Amazon App Tester** from the Appstore on the stick.
2. `adb connect <stick-ip>` · `adb push apps/expo/amazon.sdktester.json /sdcard/amazon.sdktester.json` → expect `1 file pushed`.
3. `adb shell setprop debug.amazon.sandboxmode debug` → `adb shell getprop debug.amazon.sandboxmode` prints `debug`.
4. `cd apps/expo && EXPO_TV=1 npx expo prebuild --clean` → the log contains `openiapStore=amazon`. `grep openiapStore android/gradle.properties` shows it. `ls android/app/src/main/assets/AppstoreAuthenticationKey.pem` exists.
5. `pnpm --filter @lingo/expo android` (debug build) → the Gradle log line `openiap: store=amazon (source=explicit…)` appears.
6. API: `LINGO_PLUS_MODE=iap RVS_ENV=sandbox RVS_SHARED_SECRET=sandbox pnpm --filter @lingo/api dev` on the LAN; `EXPO_PUBLIC_API_URL` points at it.
7. Open Lingo → rail **Plus** → the price matches the JSON (2.99 in the tester's currency) and focus is on **Subscribe**. Its label is read as "Subscribe to Lingo Plus for … per month".
8. Select Subscribe → the App Tester purchase dialog appears → confirm → the screen shows "Confirming with Amazon…", then "You have Lingo Plus." The API log shows `POST /iap/verify` 200 with `outcome: active`. `adb logcat | grep -i iap` shows notifyFulfillment *after* the verify call.
9. Back → open a clip → **Watch in Challenge mode** plays with the native line hidden. In Explain, **Slower** sets 0.75×. Save 21 words: the 21st saves (no "That's 20 today").
10. Restart the app → still Plus (startup restore → verify).
11. App Tester → **Subscriptions / Active transactions** → cancel or expire `lingo.plus.monthly`. Restart Lingo → Plus → **Restore purchase** → "No Lingo Plus purchase found…" or the cancelled state, and `GET /iap/status` shows `plus: false`. The save limit is back at 20.
12. Cancel inside the purchase dialog (step 8 again, press Back) → the offer returns with no message and focus on Subscribe.
13. `LINGO_PLUS_MODE=demo` → Plus says "on for everyone in this demo" and Challenge mode works with no purchase. `LINGO_PLUS_MODE=off` → "isn't available on this device yet" and no App Tester dialog can be opened.
14. Deep link: `adb shell am start -a android.intent.action.VIEW -d "lingo://clip/<a-published-slug>?t=30"` → the Player opens at 0:30. An unknown slug → Home.
15. Turn sandbox off afterwards: `adb shell setprop debug.amazon.sandboxmode none`.

Any deviation → `pnpm friction "<title>"` with the exact command and output.

### B. Vega Virtual Device + App Tester

References: [Vega IAP overview](https://developer.amazon.com/docs/vega/0.22/vega-iap-overview.html), [Configure App Tester (Vega)](https://developer.amazon.com/docs/vega/0.22/configure-app-tester), [Use App Tester (Vega)](https://developer.amazon.com/docs/vega/0.22/use-app-tester.html), [RVS Cloud Sandbox (Vega)](https://developer.amazon.com/docs/vega/0.22/rvs-cloud.html), [Content Launcher guide](https://developer.amazon.com/ja/docs/vega/0.24/content-launcher-integration-guide.html).

1. Apply the `apps/vega/README.md` setup (LING-008 owns the Vega build itself). Add the two `@amazon-devices` packages at the pinned versions, merge `manifest.additions.template.toml`, and set package id `dev.moizp.lingo`.
2. `vega virtual-device start`. Install/configure App Tester on the VVD and place `amazon.sdktester.json` where *Configure App Tester (Vega)* says. **Record the exact command in the README**: this plan could not read the page.
3. `npm run build:app && vega run-app build/<arch>-release/lingo_<arch>.vpkg`.
4. Plus → the sentence has **no** "slower playback" (Vega `caps.rate` is false) → Subscribe → App Tester dialog → confirm → "You have Lingo Plus." The API log shows `store: amazon-vega`, `outcome: active`.
5. `journalctl -f | grep -i -E "iap|notifyFulfillment"` (VVD shell, per the Vega docs) → fulfilment after verify.
6. Restart the app → still Plus. Cancel in App Tester → Restore → Plus off.
7. Content Launcher: trigger a launch for external id `lingo_slug = <slug>` with the test method from the Content Launcher guide's testing section → the Player opens that clip. `journalctl` shows the handler log and a SUCCESS response. An unknown slug → failure response and Home.
8. Media Controls / Personalization: the kit logs `[vega-media-kit] mediaControls.setNowPlaying is a no-op on kepler — Vega support is experimental…` once. **Expected until KIT-007.** Note it in the friction log.

---

## Escalations (kit ↔ app interface; human decision per ORCHESTRATOR §6)

- **E1: Vega bindings are no-ops (KIT-007 deferred).** Content Launcher, Personalization and Media Controls on Vega only become real when the kit implements them. Lingo's interim Vega Content Launcher handler lives in `apps/vega/platform/contentLauncher.template.ts` and is offered upstream as KIT-007's starting point. The kit also exposes no public way for an app to feed launch intents in: `_dispatchIntent` is underscored and "for tests". Proposal: `contentLauncher.dispatchIntent(i)` as public API, or `contentLauncher.setVegaProvider(p)`.
- **E2: `onLaunchIntent` cannot answer.** Vega's `handleLaunchContent` must return `Promise<ILauncherResponse>` (SUCCESS or failure). The kit's callback returns `void`. Proposal: `onLaunchIntent(cb: (i) => boolean | Promise<boolean>)`.
- **E3: `personalization.reportPlayback(itemId, positionS, durationS)` carries no playback state.** Vega's `PlaybackEventBuilder` needs `playbackState` (PLAYING / PAUSED / EXIT…), `eventTimestamp`, `contentId` (id + namespace) and `profileId` (vega-video-sample `PlayerScreen.tsx`, `ContentPersonalizationMocks.ts`; [watch activity](https://developer.amazon.com/docs/vega/0.22/watch-activity.html)). Proposal: `reportPlayback({ itemId, namespace, positionS, durationS, state })`. Lingo's reporter already produces `phase`. The Fire OS column is a no-op as well: the Fire OS Content Personalization SDK is a native AAR, outside the kit's scope today.
- **E4: Vega Media Controls are bound to the w3cmedia `VideoPlayer`** (`setMediaControlFocus(component, handler)`, `KeplerMediaControlHandler`; vega-video-sample `VideoHandler.ts`, `AppOverrideMediaControlHandler.ts`). That player lives inside the kit's Vega adapter (KIT-010 deferred), so the app cannot attach a handler. The kit's `TransportControl` also lacks absolute seek (`handleSeek(position)`). Proposal: the kit adapter registers VMC itself and forwards to `mediaControls._dispatch`, with `TransportControl` gaining `{ seekTo: number }`.

None of these block the IAP half of the ticket. They decide whether "Personalization" and "Media Controls" are real on Vega by the Oct 15 freeze, or are shown honestly as kit-logged no-ops with friction logs.

---

## Risks

1. **react-native-iap 16 on react-native-tvos 0.81 + Expo 54.** It needs Nitro modules and the new architecture, and 16.7.2 was published on 2026-09-30. Mitigation: pin `~16.7.2`. If prebuild or the build breaks, switch to `expo-iap@~5.8.2` (same OpenIAP core). Its config plugin already pins `openiapStore` and copies `AppstoreAuthenticationKey.pem` (`plugin/src/withIAP.ts`), so `withAmazonIap.js` is deleted. `PlusStore` keeps the switch to one file.
2. **App Tester sandbox flakiness** (the BRIEF expects it). Mitigation: `LINGO_PLUS_MODE=demo` for filming. The video shows the sandbox for about 2 s, recorded once it works.
3. **No AppstoreAuthenticationKey.pem** → `AUTH_TOKEN_VERIFICATION_FAILURE` in App Tester (troubleshooting doc). This needs the Developer Console app entry (human).
4. **Vega lib version trap:** `2.12.13` fails every call. It is pinned `~2.13.0`, matching vega-video-sample and react-native-iap's peer range.
5. **Package id:** Vega must reuse `dev.moizp.lingo` for IAP items to apply to both apps (sample manifest comment). Changing either id later orphans test purchases.
6. **Receipt sharing across learners:** the newest learner to post a receipt wins it. Acceptable for a demo; recorded in decision 0009.
7. **Phone has its own learner:** Plus is per TV `x-device-id`. The phone's review deck is not gated, so nothing breaks; the LING-006 follow-up (`x-session-code`) covers identity.
8. **Voice search → "app appears" (video 0:15–0:35)** needs Amazon catalog ingestion on Fire OS ([integrate with launcher](https://developer.amazon.com/docs/catalog/integrate-with-launcher.html), [verify deep links](https://developer.amazon.com/docs/catalog/verify-deep-links-from-the-catalog.html)), which is a submission-time process. Without it, only the VVD Content Launcher test (B7) and the adb deep link (A14) can be filmed. Tell the human now.
9. **Merge conflicts** with LING-005/006 in `index.tsx`, `strings.ts`, `me.ts`. Mitigation: the edits are listed above as exact, small hunks. Land LING-007 after LING-005's `index.tsx` rewrite, or rebase the hunks onto it.

## Open questions (defaults in bold; the plan proceeds with them)

- Q1: Use react-native-iap's own `.kepler` entry on Vega instead of the direct lib? **No.** The brief names the direct lib, Amazon's sample uses it, and RN-for-Vega's resolution of the package's `exports` → `index.kepler.ts` is unverified.
- Q2: Price point for `lingo.plus.monthly`? **Whatever the console says.** The screen shows only the store's localized price; the JSON fallback uses 2.99.
- Q3: Cancel line URL: **amazon.com/appstoresubscriptions**. Confirm on the IAP FAQ before filming.
- Q4: Re-verify window. **24 h**, lazily on `GET /iap/status`. No pg-boss job (keeps AWS and queue cost at zero).
- Q5: Content Launcher `partner-id` and the failure status name. **`LINGO` placeholder**, and the failure enum from the guide, recorded in the friction log.
- Q6: Keep "Nothing was charged that we can see." in `retry`? **Keep.**

## Sources (Amazon URLs: cite these in the PR)

IAP / RVS / App Tester
- https://developer.amazon.com/docs/vega/0.22/appstore-integrations-overview.html
- https://developer.amazon.com/docs/vega/0.22/vega-iap-overview.html
- https://developer.amazon.com/docs/vega/0.22/configure-app-tester
- https://developer.amazon.com/docs/vega/0.22/use-app-tester.html
- https://developer.amazon.com/docs/vega/0.22/rvs-cloud.html
- https://developer.amazon.com/docs/vega/0.24/vega-rvs-overview
- https://developer.amazon.com/docs/vega/0.22/vega-submit-iap.html
- https://developer.amazon.com/docs/vega/0.22/iap-production-mode.html
- https://developer.amazon.com/docs/in-app-purchasing/iap-implement-iap.html
- https://developer.amazon.com/docs/in-app-purchasing/iap-install-and-configure-app-tester.html
- https://developer.amazon.com/docs/in-app-purchasing/iap-create-and-submit-iap-items.html
- https://developer.amazon.com/docs/in-app-purchasing/rvs-cloud-sandbox.html
- https://developer.amazon.com/docs/in-app-purchasing/iap-rvs-for-android-apps.html
- https://developer.amazon.com/docs/in-app-purchasing/iap-rvs-examples.html
- https://developer.amazon.com/docs/in-app-purchasing/iap-faqs.html
- https://developer.amazon.com/docs/appstore-sdk/integrate-appstore-sdk.html
- https://developer.amazon.com/docs/appstore-sdk/appstore-sdk-troubleshooting.html
- https://developer.amazon.com/apps-and-games/blogs/2026/08/amazon-sponsors-openiap-fire-os-vega-os
- https://community.amazondeveloper.com/t/using-amazon-devices-keplerscript-appstore-iap-lib-2-12-13-causes-in-app-purchases-to-fail/24746

Content Launcher / Personalization / Media Controls
- https://developer.amazon.com/ja/docs/vega/0.24/content-launcher-integration-guide.html (EN 0.21: https://developer.amazon.com/docs/vega/0.21/content-launcher-integration-guide)
- https://developer.amazon.com/docs/vega/0.21/content-launcher-overview.html
- https://community.amazondeveloper.com/t/sample-manifest-for-content-launcher-account-login-and-vega-media-controls/7956
- https://developer.amazon.com/docs/vega/0.21/get-started-with-vega-content-personalization.html
- https://developer.amazon.com/docs/vega/0.22/watch-activity.html · https://developer.amazon.com/docs/vega/0.24/watch-activity
- https://developer.amazon.com/docs/vega/0.22/media-controls-get-started · https://developer.amazon.com/docs/vega/0.24/media-controls-get-started
- https://developer.amazon.com/docs/vega/0.21/media-player-media-control
- https://developer.amazon.com/docs/catalog/integrate-with-launcher.html
- https://developer.amazon.com/docs/catalog/verify-deep-links-from-the-catalog.html
- https://developer.amazon.com/docs/fire-tv/introduction-content-personalization.html
- https://github.com/AmazonAppDev/vega-video-sample (`manifest.toml`, `src/iap/utils/*`, `src/screens/HomeScreen.tsx`, `src/screens/PlayerScreen.tsx`, `src/utils/AppOverrideMediaControlHandler.ts`)

Non-Amazon
- react-native-iap 16.7.2 (npm tarball: `android/openiap-store.gradle`, `src/types.ts`, `src/vega-adapter.ts`), https://github.com/hyodotdev/openiap
- expo-iap 5.8.2 (npm tarball: `plugin/src/withIAP.ts`), fallback for Risk 1
