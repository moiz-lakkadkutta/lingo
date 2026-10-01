import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'
import type { Catalog, ClipDetail, HighlightDto, LearnerDto, LearnerSettingsPatch } from '@lingo/contracts'
import { Rail, Screen, T } from './components'
import { Home } from './screens/Home'
import { Player } from './screens/Player'
import { Quiz } from './screens/Quiz'
import { Summary } from './screens/Summary'
import { Pair } from './screens/Pair'
import { strings } from './strings'
import { patchLearnerOptimistic } from './lib/learnerPatch'
import { useSession } from './session/useSession'
import type { SessionTransport } from './session/types'
import { noRemote, type RemoteSource } from './remote/types'
export { tokens } from './theme/tokens'
export * from './components'
export { createSocketTransport } from './session/socketTransport'
export type { SessionTransport, SessionState } from './session/types'
export { createRemoteBus, noRemote } from './remote/types'
export type { RemoteSource, RawRemoteEvent } from './remote/types'

type Route = { name: 'home' } | { name: 'player'; slug: string; challenge: boolean } | { name: 'summary' } | { name: 'quiz' } | { name: 'pair' } | { name: 'settings' } | { name: 'words' }
const defaultLearner: LearnerDto = { learning: 'de', native: 'en', level: 'A2', plus: false, streak: 0, firstRunDone: false, nativeLine: 'always', autoPause: false, cueScale: 1 }

export interface RootProps { apiBaseUrl: string; scale: number; deviceId?: string; /** Realtime link; defaults to socket.io-client. A platform entry may inject a relay. */ transport?: SessionTransport; /** Remote keys from the platform entry (react-native-tvos / Vega TVEventHandler bridge); defaults to none. */ remote?: RemoteSource }

export function Root({ apiBaseUrl, scale, deviceId = 'dev-device', transport, remote = noRemote }: RootProps) {
  const [route, setRoute] = useState<Route>({ name: 'home' })
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [learner, setLearner] = useState<LearnerDto>(defaultLearner)
  const [clip, setClip] = useState<ClipDetail | null>(null)
  const [saved, setSaved] = useState<HighlightDto[]>([])
  const [learnerLoaded, setLearnerLoaded] = useState(false)
  const [offline, setOffline] = useState(false)
  const api = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const r = await fetch(apiBaseUrl + path, { ...init, headers: { 'content-type': 'application/json', 'x-device-id': deviceId, 'x-native': learner.native, ...(init?.headers ?? {}) } })
    const j = (await r.json()) as { success: boolean; data: T }; if (!j.success) throw new Error('api'); return j.data
  }, [apiBaseUrl, deviceId, learner.native])

  useEffect(() => { Promise.all([api<Catalog>('/catalog'), api<LearnerDto>('/me')]).then(([c, l]) => { setCatalog(c); setLearner({ ...defaultLearner, ...l }); setOffline(false); setLearnerLoaded(true) }).catch(() => setOffline(true)) }, [api])
  const session = useSession({ api, apiBaseUrl, enabled: learnerLoaded && !offline, transport, onOffline: () => setOffline(true) })
  useEffect(() => { if (route.name === 'player') { setSaved([]); api<ClipDetail>(`/clips/${route.slug}`).then(setClip).catch(() => setOffline(true)) } }, [route, api])

  const save = async (highlightId: string): Promise<'saved' | 'limit' | 'error'> => {
    try {
      const r = await api<{ limit: boolean; saved: { highlight: HighlightDto } | null }>('/me/words', { method: 'POST', body: JSON.stringify({ highlightId, sessionCode: session.code ?? undefined }) })
      if (r.limit) return 'limit'
      if (r.saved) setSaved((s) => (s.some((h) => h.id === highlightId) ? s : [...s, r.saved!.highlight]))
      return 'saved'
    } catch {
      return 'error'
    }
  }
  const savedIds = useMemo(() => new Set(saved.map((h) => h.id)), [saved])
  /** Optimistic: the Player sees the change at once; a failed PUT is logged and rolled back (lib/learnerPatch). */
  const patchLearner = (p: LearnerSettingsPatch) => { void patchLearnerOptimistic({ put: (body) => api('/me', { method: 'PUT', body: JSON.stringify(body) }), setLearner }, p) }
  const onPlus = () => setRoute({ name: 'settings' }) // LING-005/007 own the Plus screen
  const rail = <Rail current="home" items={[{ key: 'home', label: strings.rail.watchLabel, text: strings.rail.watch }, { key: 'review', label: strings.rail.reviewLabel, text: strings.rail.review }, { key: 'words', label: strings.rail.wordsLabel, text: strings.rail.words }, { key: 'settings', label: strings.rail.settingsLabel, text: strings.rail.settings }]} onSelect={(k) => setRoute(k === 'review' ? { name: 'quiz' } : { name: k as 'home' })} />
  if (offline) return <Screen><View style={{ flex: 1, justifyContent: 'center' }} accessibilityLiveRegion="polite"><T variant="title">{strings.offline}</T></View></Screen>
  switch (route.name) {
    case 'player': return clip ? <Player clip={clip} learner={learner} scale={scale} challenge={route.challenge && learner.plus} sessionCode={session.code ?? undefined} savedIds={savedIds} savedCount={saved.length} remote={remote} onSave={save} onPlus={onPlus} onLearnerChange={patchLearner} onBack={() => setRoute({ name: 'home' })} onEnd={() => setRoute({ name: 'summary' })} /> : <Screen rail={rail}><T variant="body">…</T></Screen>
    case 'summary': return clip ? <Summary clip={clip} saved={saved} lang={learner.learning} phoneName={session.phone} phoneQuiz={session.phoneQuiz} lastTvQuiz={null} onQuizTv={() => setRoute({ name: 'quiz' })} onQuizPhone={() => session.startPhoneQuiz(clip.slug)} onAgain={() => setRoute({ name: 'player', slug: clip.slug, challenge: false })} onNext={() => setRoute({ name: 'home' })} /> : null
    case 'quiz': return clip ? <Quiz clip={clip} onFinish={async () => null} onNext={() => setRoute({ name: 'home' })} onAgain={() => setRoute({ name: 'player', slug: clip.slug, challenge: false })} onDone={() => setRoute({ name: 'home' })} /> : null
    case 'pair': return <Screen rail={rail}><Pair code={session.code} joinUrl={session.joinUrl} connected={session.phone} onLater={() => setRoute({ name: 'home' })} /></Screen>
    default: return <Home catalog={catalog ? { state: 'ready', data: catalog } : { state: 'loading' }} learner={learner} onReload={() => {}} onRail={() => {}} onSettings={() => setRoute({ name: 'settings' })} onFocusId={() => {}} onOpen={(slug) => setRoute({ name: 'player', slug, challenge: false })} onWatch={(c) => setRoute({ name: 'player', slug: c.slug, challenge: false })} />
  }
}
