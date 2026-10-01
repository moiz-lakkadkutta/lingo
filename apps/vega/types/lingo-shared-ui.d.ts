// What apps/vega/src imports from @lingo/shared-ui, copied from packages/shared-ui/src/index.tsx and remote/types.ts.
// Why a declaration and not the source: shared-ui is written and typechecked against react-native-tvos 0.81 in its own package;
// typechecking its source against RN for Vega 0.83 types would report tvOS-only props (nextFocus*). Metro bundles the real source.
// Keep in sync when RootProps changes (pnpm check:vega compares the exported names).
declare module '@lingo/shared-ui' {
  import type { JSX } from 'react'
  export interface RawRemoteEvent { eventType: string; eventKeyAction?: number }
  export interface RemoteSource { subscribe(cb: (e: RawRemoteEvent) => void): () => void }
  export function createRemoteBus(): RemoteSource & { emit(e: RawRemoteEvent): void }
  export interface RootProps { apiBaseUrl: string; scale: number; deviceId?: string; transport?: unknown; remote?: RemoteSource }
  export function Root(props: RootProps): JSX.Element
}
