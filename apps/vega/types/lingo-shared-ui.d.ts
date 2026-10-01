// What apps/vega/src imports from @lingo/shared-ui, copied from packages/shared-ui/src/index.tsx, remote/types.ts, plus/types.ts,
// plus/amazon.ts, platform/launch.ts and the kit's LaunchIntent (re-exported by shared-ui).
// Why a declaration and not the source: shared-ui is written and typechecked against react-native-tvos 0.81 in its own package;
// typechecking its source against RN for Vega 0.83 types would report tvOS-only props (nextFocus*). Metro bundles the real source.
// Keep in sync when RootProps, PlusStore or the Vega mappers change (pnpm check:vega compares the exported names).
declare module '@lingo/shared-ui' {
  import type { JSX } from 'react'
  export interface RawRemoteEvent { eventType: string; eventKeyAction?: number }
  export interface RemoteSource { subscribe(cb: (e: RawRemoteEvent) => void): () => void }
  export function createRemoteBus(): RemoteSource & { emit(e: RawRemoteEvent): void }

  // Lingo Plus (LING-007)
  export interface StoreProduct { sku: string; price: string; title: string }
  export interface StoreReceipt { receiptId: string; userId: string; sku: string; termSku: string | null; cancelled: boolean }
  export type PurchaseOutcome =
    | { kind: 'purchased'; receipt: StoreReceipt }
    | { kind: 'alreadyOwned' }
    | { kind: 'userCancelled' }
    | { kind: 'notSupported' }
    | { kind: 'error'; detail: string }
  export interface PlusStore {
    readonly kind: 'amazon-fireos' | 'amazon-vega' | 'none'
    init(): Promise<void>
    product(sku: string): Promise<StoreProduct | null>
    purchase(sku: string): Promise<PurchaseOutcome>
    restore(): Promise<StoreReceipt[]>
    fulfil(receiptId: string): Promise<void>
    dispose(): void
  }
  export type VegaCode = 'SUCCESSFUL' | 'ALREADY_PURCHASED' | 'INVALID_SKU' | 'FAILED' | 'NOT_SUPPORTED' | 'UNKNOWN' // lint-words-allow: Amazon response code
  interface VegaReceiptLike { receiptId: string; sku: string; termSku?: string | null; isCancelled?: boolean; cancelDate?: unknown }
  export function mapVegaPurchase(r: { code: VegaCode; userId?: string | null; receipt?: VegaReceiptLike | null }): PurchaseOutcome
  export function mapVegaUpdates(r: { code: VegaCode; userId?: string | null; receipts: VegaReceiptLike[]; hasMore: boolean }): StoreReceipt[]

  // Launch intents (Content Launcher, LING-007)
  export interface LaunchIntent { itemId: string; positionS?: number; source: 'search' | 'voice' | 'row' | 'unknown' }
  export interface LaunchSource { subscribe(cb: (i: LaunchIntent) => void): () => void }
  export function createLaunchBus(): LaunchSource & { emit(i: LaunchIntent): void }

  export interface RootProps {
    apiBaseUrl: string; scale: number; deviceId?: string; transport?: unknown; remote?: RemoteSource
    plusStore?: PlusStore; launches?: LaunchSource
  }
  export function Root(props: RootProps): JSX.Element
}
