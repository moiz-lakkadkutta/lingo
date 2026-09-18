import React, { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import type { Catalog, ClipDetail, HighlightDto, LearnerDto } from '@lingo/contracts'
import { Rail, Screen, T } from './components'
import { Home } from './screens/Home'
import { Player } from './screens/Player'
import { Quiz } from './screens/Quiz'
import { Summary } from './screens/Summary'
import { Pair } from './screens/Pair'
import { strings } from './strings'
import { useSession } from './session/useSession'
import type { SessionTransport } from './session/types'
export { tokens } from './theme/tokens'
export * from './components'
export { createSocketTransport } from './session/socketTransport'
export type { SessionTransport, SessionState } from './session/types'

type Route = { name: 'home' } | { name: 'player'; slug: string; challenge: boolean } | { name: 'summary' } | { name: 'quiz' } | { name: 'pair' } | { name: 'settings' } | { name: 'words' }
const defaultLearner: LearnerDto = { learning: 'de', native: 'en', level: 'A2', plus: false, streak: 0, firstRunDone: false, nativeLine: 'always', autoPause: false, cueScale: 1 }

export interface RootProps { apiBaseUrl: string; scale: number; deviceId?: string; /** Realtime link; defaults to socket.io-client. A platform entry may inject a relay. */ transport?: SessionTransport }

export function Root({ apiBaseUrl, scale, deviceId = 'dev-device', transport }: RootProps) {
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

  const save = async (highlightId: string) => {
    const r = await api<{ limit: boolean; saved: { highlight: HighlightDto } | null }>('/me/words', { method: 'POST', body: JSON.stringify({ highlightId, sessionCode: session.code ?? undefined }) })
    if (r.limit) return 'limit' as const
    if (r.saved) setSaved((s) => (s.some((h) => h.id === highlightId) ? s : [...s, r.saved!.highlight]))
    return 'saved' as const
  }
  const rail = <Rail expanded={false} current={route.name} items={[{ key: 'home', label: strings.rail.watch }, { key: 'quiz', label: strings.rail.review }, { key: 'words', label: strings.rail.words }, { key: 'pair', label: 'Pair' }, { key: 'settings', label: strings.rail.settings }]} onSelect={(k) => setRoute({ name: k as 'home' })} />
  if (offline) return <Screen><View style={{ flex: 1, justifyContent: 'center' }} accessibilityLiveRegion="polite"><T variant="title">{strings.offline}</T></View></Screen>
  switch (route.name) {
    case 'player': return clip ? <Player clip={clip} learner={learner} scale={scale} challenge={route.challenge && learner.plus} sessionCode={session.code ?? undefined} onSave={save} onBack={() => setRoute({ name: 'home' })} onEnd={() => setRoute({ name: 'summary' })} /> : <Screen rail={rail}><T variant="body">…</T></Screen>
    case 'summary': return <Screen><Summary saved={saved} lang={learner.learning} phoneConnected={!!session.phone} onQuizTv={() => setRoute({ name: 'quiz' })} onQuizPhone={() => setRoute({ name: 'home' })} onAgain={() => clip && setRoute({ name: 'player', slug: clip.slug, challenge: false })} onNext={() => setRoute({ name: 'home' })} /></Screen>
    case 'quiz': return <Screen>{clip ? <Quiz items={clip.quiz} onDone={() => setRoute({ name: 'home' })} onReplayCue={() => {}} /> : <T variant="body">{strings.words.empty}</T>}</Screen>
    case 'pair': return <Screen rail={rail}><Pair code={session.code} joinUrl={session.joinUrl} connected={session.phone} onLater={() => setRoute({ name: 'home' })} /></Screen>
    default: return <Screen rail={rail}><Home catalog={catalog} learner={learner} onOpen={(slug) => setRoute({ name: 'player', slug, challenge: false })} onWatch={(slug) => setRoute({ name: 'player', slug, challenge: false })} /></Screen>
  }
}
