/**
 * Remote keys enter shared-ui through a RemoteSource injected by each platform entry (decision 0006 §3):
 * apps/expo bridges react-native-tvos TVEventHandler, apps/vega bridges useTVEventHandler from @amazon-devices/react-native-kepler.
 */
export interface RawRemoteEvent { eventType: string; eventKeyAction?: number }
export interface RemoteSource { subscribe(cb: (e: RawRemoteEvent) => void): () => void }

/** A small fan-out bus: the platform bridge calls emit, the Player subscribes. */
export function createRemoteBus(): RemoteSource & { emit(e: RawRemoteEvent): void } {
  const subs = new Set<(e: RawRemoteEvent) => void>()
  return {
    subscribe(cb) {
      subs.add(cb)
      return () => { subs.delete(cb) }
    },
    emit(e) {
      for (const cb of [...subs]) cb(e)
    },
  }
}

/** Default when no platform bridge is given (tests, web harness). */
export const noRemote: RemoteSource = { subscribe: () => () => {} }
