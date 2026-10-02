import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { BackHandler } from 'react-native'
import type { Catalog, ClipCard, ClipReady, HighlightDto, LearnerDto, LearnerSettingsPatch, LevelResult, PlusStatus } from '@lingo/contracts'
import { Screen, StateMessage, T } from '../components'
import { createApi, type Api } from '../api/client'
import { endpoints, type Endpoints } from '../api/endpoints'
import { useResource } from '../data/resource'
import { patchLearnerOptimistic } from '../lib/learnerPatch'
import { createFocusMemory, type FocusMemory, type FocusMemoryProps } from '../nav/focusMemory'
import { canPop, initialNav, navReduce, routeKey, top, type NavAction, type Route, type WordsFilter } from '../nav/stack'
import { noRemote, type RemoteSource } from '../remote/types'
import { noLaunches, type LaunchSource } from '../platform/launch'
import { useLaunchIntents } from '../platform/useLaunchIntents'
import { caps } from '../platformCaps'
import { restoreFlow } from '../plus/flow'
import { noStore, type PlusStore } from '../plus/types'
import { About } from '../screens/About'
import { Clip } from '../screens/Clip'
import { FirstRun } from '../screens/FirstRun'
import { Home } from '../screens/Home'
import { Pair } from '../screens/Pair'
import { Player } from '../screens/Player'
import { Plus } from '../screens/Plus'
import { Quiz } from '../screens/Quiz'
import { Settings } from '../screens/Settings'
import type { SettingsAction } from '../screens/settings/model'
import { Summary } from '../screens/Summary'
import { Words } from '../screens/Words'
import type { SessionHandle, SessionTransport } from '../session/types'
import { useSession } from '../session/useSession'
import { strings } from '../strings'
import { nextClip, progressBody } from './selectors'

export interface RootProps { apiBaseUrl: string; scale: number; /** Per-install id from the platform entry (platform/deviceId.ts useDeviceId); the API's learner key. Required: no shared default (review-005 H1). */ deviceId: string; /** Realtime link; defaults to socket.io-client. A platform entry may inject a relay. */ transport?: SessionTransport; /** Remote keys from the platform entry (react-native-tvos / Vega TVEventHandler bridge); defaults to none. */ remote?: RemoteSource; /** Amazon IAP store from the platform entry (LING-007); defaults to noStore. */ plusStore?: PlusStore; /** Deep links / Content Launcher intents from the platform entry (LING-007); defaults to noLaunches. */ launches?: LaunchSource }

const defaultLearner: LearnerDto = { learning: 'de', native: 'en', level: 'A2', plus: false, streak: 0, firstRunDone: false, nativeLine: 'always', autoPause: false, cueScale: 1 }
type Boot = 'loading' | 'ready' | 'offline'
type Score = { correct: number; total: number }

/** What every route component gets from Root. */
interface Ctx {
  ep: Endpoints; learner: LearnerDto; setLearner: React.Dispatch<React.SetStateAction<LearnerDto>>; patchLearner(p: LearnerSettingsPatch): Promise<boolean>
  nav(a: NavAction): void; focus(r: Route): FocusMemoryProps; memory: FocusMemory
  catalog: Catalog | null; setCatalog(c: Catalog | null): void; clips: Map<string, ClipReady>
  session: SessionHandle; scale: number; remote: RemoteSource
  api: Api; plusStore: PlusStore; refreshMe(): void
  saved: HighlightDto[]; setSaved: React.Dispatch<React.SetStateAction<HighlightDto[]>>; lastPlayerSlug: React.MutableRefObject<string | null>
  tvQuiz: Record<string, Score>; setTvQuiz: React.Dispatch<React.SetStateAction<Record<string, Score>>>
  settingsStatus: string | null; setSettingsStatus(s: string | null): void
}

/**
 * App shell (docs/plans/LING-005.md §6): boot (GET /me → first run or Home), a pure nav stack with one BackHandler listener, focus memory per
 * route, and one component per route (only the top route is mounted). Screens own their own listeners (Player, Words, First run), added
 * after Root's and therefore run first.
 */
export function Root({ apiBaseUrl, scale, deviceId, transport, remote = noRemote, plusStore = noStore, launches = noLaunches }: RootProps) {
  const [nav, dispatchNav] = useReducer(navReduce, initialNav({ name: 'home' }))
  const navRef = useRef(nav); navRef.current = nav
  const memory = useRef(createFocusMemory()).current
  const [learner, setLearner] = useState<LearnerDto>(defaultLearner)
  const learnerRef = useRef(learner); learnerRef.current = learner
  const [boot, setBoot] = useState<Boot>('loading')
  const [bootTick, setBootTick] = useState(0)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const clips = useRef(new Map<string, ClipReady>()).current
  const [saved, setSaved] = useState<HighlightDto[]>([])
  const lastPlayerSlug = useRef<string | null>(null)
  const [tvQuiz, setTvQuiz] = useState<Record<string, Score>>({})
  const [settingsStatus, setSettingsStatus] = useState<string | null>(null)

  const api = useMemo(() => createApi({ baseUrl: apiBaseUrl, deviceId, getNative: () => learnerRef.current.native }), [apiBaseUrl, deviceId])
  const ep = useMemo(() => endpoints(api), [api])

  useEffect(() => {
    let live = true
    setBoot('loading')
    ep.me().then((l) => {
      if (!live) return
      setLearner(l)
      dispatchNav({ type: 'reset', route: l.firstRunDone ? { name: 'home' } : { name: 'firstRun' } })
      setBoot('ready')
    }, () => { if (live) setBoot('offline') })
    return () => { live = false }
  }, [ep, bootTick])

  const session = useSession({ api, apiBaseUrl, enabled: boot === 'ready', transport, onOffline: () => setBoot('offline') })

  // One listener for the app's lifetime (empty deps): registered before any screen's, so screens' listeners run first.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canPop(navRef.current)) return false // top level: the OS leaves the app (Fire TV guideline)
      dispatchNav({ type: 'pop' })
      return true
    })
    return () => sub.remove()
  }, [])

  /** After a purchase / restore: re-read /me so learner.plus (Challenge mode, 0.75×, the save limit) follows the server's entitlement. */
  const refreshMe = useCallback(() => { ep.me().then(setLearner, () => {}) }, [ep])
  // Restore on startup (LING-007): once per app run, after /me, only when the server is in IAP mode and the platform has a store.
  const restoredOnce = useRef(false)
  useEffect(() => {
    if (boot !== 'ready' || restoredOnce.current || plusStore.kind === 'none') return
    restoredOnce.current = true
    api<PlusStatus>('/iap/status').then(async (s) => {
      if (s.mode !== 'iap') return
      await plusStore.init()
      const [ev] = await restoreFlow(plusStore, api)
      if (ev?.type === 'restored' && ev.results.length) refreshMe()
    }).catch(() => {})
  }, [boot, plusStore, api, refreshMe])
  // Content Launcher / deep links: a known slug opens the Player on top of the current stack.
  useLaunchIntents({ catalog, launches, onOpen: (slug) => dispatchNav({ type: 'push', route: { name: 'player', slug, challenge: false } }) })

  const patchLearner = useCallback((p: LearnerSettingsPatch) => patchLearnerOptimistic({ put: ep.patchMe, setLearner }, p), [ep])
  const focus = useCallback((r: Route): FocusMemoryProps => {
    const k = routeKey(r)
    return { initialFocus: memory.get(k), onFocusId: (id) => memory.set(k, id) }
  }, [memory])

  if (boot === 'offline') {
    return <Screen><StateMessage title={strings.offline} announceOnMount actions={[{ label: strings.common.retry, text: strings.common.retry, onPress: () => setBootTick((t) => t + 1) }]} /></Screen>
  }
  if (boot === 'loading') return <Screen><T accessibilityLiveRegion="polite" style={{ opacity: 0 }}>{strings.common.loading}</T></Screen>

  const ctx: Ctx = {
    ep, learner, setLearner, patchLearner, nav: dispatchNav, focus, memory, catalog, setCatalog, clips, session, scale, remote, api, plusStore, refreshMe,
    saved, setSaved, lastPlayerSlug, tvQuiz, setTvQuiz, settingsStatus, setSettingsStatus,
  }
  const route = top(nav)
  return <RouteView key={`${nav.stack.length}:${routeKey(route)}`} route={route} ctx={ctx} />
}

function RouteView({ route, ctx }: { route: Route; ctx: Ctx }) {
  const { nav, learner, session } = ctx
  switch (route.name) {
    case 'firstRun':
      return (
        <FirstRun
          learner={learner} session={session}
          onProfile={(p) => { void ctx.patchLearner(p); ctx.memory.forget('home'); ctx.setCatalog(null) }}
          onLevel={(level) => { ctx.setLearner((l) => ({ ...l, level })); ctx.ep.putLevel({ source: 'placement', level }).catch(() => {}) }}
          onDone={() => { void ctx.patchLearner({ firstRunDone: true }); nav({ type: 'reset', route: { name: 'home' } }) }}
        />
      )
    case 'home': return <HomeRoute ctx={ctx} />
    case 'clip': return <ClipRoute ctx={ctx} slug={route.slug} />
    case 'player': return <PlayerRoute ctx={ctx} slug={route.slug} challenge={route.challenge} />
    case 'summary': return <SummaryRoute ctx={ctx} slug={route.slug} />
    case 'quiz': return <QuizRoute ctx={ctx} slug={route.slug} />
    case 'words': return <WordsRoute ctx={ctx} filter={route.filter} />
    case 'settings': return <SettingsRoute ctx={ctx} />
    case 'pair': return <Screen><Pair code={session.code} joinUrl={session.joinUrl} connected={session.phone} onLater={() => nav({ type: 'pop' })} /></Screen>
    case 'about': {
      const c = ctx.catalog
      const all = c ? [...c.continue, ...c.justRight, ...c.harder, ...c.fresh] : []
      const unique = [...new Map(all.map((x) => [x.slug, x] as [string, ClipCard])).values()]
      return <About clips={unique} onBack={() => nav({ type: 'pop' })} />
    }
    case 'plus': return <Screen><Plus store={ctx.plusStore} api={ctx.api} caps={caps} onBack={() => nav({ type: 'pop' })} onChanged={ctx.refreshMe} /></Screen>
    default: return null
  }
}

function HomeRoute({ ctx }: { ctx: Ctx }) {
  const { ep, learner, nav } = ctx
  const res = useResource(() => ep.catalog({ learning: learner.learning, level: learner.level }), [learner.learning, learner.level], ctx.catalog ?? undefined)
  const { setCatalog } = ctx
  useEffect(() => { if (res.state === 'ready') setCatalog(res.data) }, [res.state, res.data, setCatalog])
  return (
    <Home
      catalog={res} learner={learner} onReload={res.reload} {...ctx.focus({ name: 'home' })}
      onWatch={(c) => nav({ type: 'push', route: { name: 'player', slug: c.slug, challenge: false } })}
      onOpen={(slug) => nav({ type: 'push', route: { name: 'clip', slug } })}
      onSettings={() => { ctx.setSettingsStatus(null); nav({ type: 'push', route: { name: 'settings' } }) }}
      onRail={(k) => {
        if (k === 'review') nav({ type: 'push', route: { name: 'words', filter: 'due' } })
        else if (k === 'words') nav({ type: 'push', route: { name: 'words', filter: 'all' } })
        else if (k === 'plus') nav({ type: 'push', route: { name: 'plus' } })
        else if (k === 'settings') { ctx.setSettingsStatus(null); nav({ type: 'push', route: { name: 'settings' } }) }
      }}
    />
  )
}

function ClipRoute({ ctx, slug }: { ctx: Ctx; slug: string }) {
  const { ep, nav, clips } = ctx
  const res = useResource(() => ep.clip(slug), [slug], clips.get(slug))
  useEffect(() => { if (res.state === 'ready' && res.data.status === 'ready') clips.set(slug, res.data) }, [res.state, res.data, clips, slug])
  return (
    <Clip
      clip={res} learner={ctx.learner} inContinue={!!ctx.catalog?.continue.some((c) => c.slug === slug)} onReload={res.reload} {...ctx.focus({ name: 'clip', slug })}
      onWatch={(challenge) => nav({ type: 'push', route: { name: 'player', slug, challenge } })}
      onPlus={() => nav({ type: 'push', route: { name: 'plus' } })}
      onAddToContinue={() => ep.putProgress({ clipSlug: slug, positionS: 0, completed: false }).then(() => true, () => false)}
      onBack={() => nav({ type: 'pop' })}
    />
  )
}

function PlayerRoute({ ctx, slug, challenge }: { ctx: Ctx; slug: string; challenge: boolean }) {
  const { ep, nav, clips, learner, session, setSaved } = ctx
  const cached = clips.get(slug)
  const res = useResource(() => (cached ? Promise.resolve(cached) : ep.clip(slug)), [slug], cached)
  // A new clip starts a new saved-words list; Watch again (same slug) keeps it for the Summary.
  useEffect(() => {
    if (ctx.lastPlayerSlug.current !== slug) { ctx.lastPlayerSlug.current = slug; setSaved([]) }
  }, [slug]) // once per player visit
  const savedIds = useMemo(() => new Set(ctx.saved.map((h) => h.id)), [ctx.saved])
  const data = res.data
  if (!data || data.status !== 'ready') {
    const back = { label: strings.common.back, text: strings.common.back, onPress: () => nav({ type: 'pop' }) }
    if (data?.status === 'preparing') return <Screen><StateMessage title={strings.clip.preparing(data.etaMin)} body={strings.clip.preparingBody} actions={[back]} /></Screen>
    if (res.state === 'error') return <Screen><StateMessage title={res.error === 'notFound' ? strings.clip.notFound : res.error === 'offline' ? strings.offline : strings.common.error} actions={[{ label: strings.common.retry, text: strings.common.retry, onPress: res.reload }, back]} /></Screen>
    return <Screen><T accessibilityLiveRegion="polite">{strings.common.loading}</T></Screen>
  }
  const clip = data
  if (!cached) clips.set(slug, clip)
  const save = async (highlightId: string): Promise<'saved' | 'limit' | 'error'> => {
    try {
      const r = await ep.saveWord(highlightId, session.code ?? undefined)
      if (r.limit) return 'limit'
      if (r.saved) setSaved((s) => (s.some((h) => h.id === highlightId) ? s : [...s, r.saved!.highlight]))
      return 'saved'
    } catch {
      return 'error'
    }
  }
  return (
    <Player
      clip={clip} learner={learner} scale={ctx.scale} challenge={challenge && learner.plus} sessionCode={session.code ?? undefined}
      savedIds={savedIds} savedCount={ctx.saved.length} remote={ctx.remote} onSave={save}
      onPlus={() => nav({ type: 'push', route: { name: 'plus' } })}
      onLearnerChange={(p) => { void ctx.patchLearner(p) }}
      onBack={(pos) => {
        const body = progressBody(slug, pos, clip.durationS)
        ep.putProgress(body).catch(() => {}) // fire and forget: leaving must never wait on the network
        clips.set(slug, { ...clip, resumeS: body.completed ? null : pos, completed: !!body.completed })
        nav({ type: 'pop' })
      }}
      onEnd={() => {
        ep.putProgress({ clipSlug: slug, positionS: clip.durationS, completed: true }).catch(() => {})
        clips.set(slug, { ...clip, resumeS: null, completed: true })
        nav({ type: 'replace', route: { name: 'summary', slug } })
      }}
    />
  )
}

/** Next clip from Summary / Quiz: the next unfinished just-right clip, else Home. */
const goNext = (ctx: Ctx, slug: string) => {
  const next = nextClip(ctx.catalog, slug)
  ctx.nav(next ? { type: 'replace', route: { name: 'clip', slug: next.slug } } : { type: 'reset', route: { name: 'home' } })
}

function SummaryRoute({ ctx, slug }: { ctx: Ctx; slug: string }) {
  const { nav, session } = ctx
  const clip = ctx.clips.get(slug)
  if (!clip) return <Screen><StateMessage title={strings.common.error} actions={[{ label: strings.common.back, text: strings.common.back, onPress: () => nav({ type: 'pop' }) }]} /></Screen>
  const pq = session.phoneQuiz
  return (
    <Summary
      clip={clip} saved={ctx.saved} lang={ctx.learner.learning} phoneName={session.phone}
      phoneQuiz={pq.status !== 'idle' && pq.clipSlug === slug ? pq : { status: 'idle' }} lastTvQuiz={ctx.tvQuiz[slug] ?? null}
      onQuizTv={() => nav({ type: 'push', route: { name: 'quiz', slug } })}
      onQuizPhone={() => session.startPhoneQuiz(slug)}
      onAgain={() => nav({ type: 'replace', route: { name: 'player', slug, challenge: false } })}
      onNext={() => goNext(ctx, slug)}
    />
  )
}

function QuizRoute({ ctx, slug }: { ctx: Ctx; slug: string }) {
  const { nav, ep } = ctx
  const clip = ctx.clips.get(slug)
  if (!clip) return <Screen><StateMessage title={strings.common.error} actions={[{ label: strings.common.back, text: strings.common.back, onPress: () => nav({ type: 'pop' }) }]} /></Screen>
  const onFinish = async (r: Score): Promise<LevelResult | null> => {
    ctx.setTvQuiz((m) => ({ ...m, [slug]: r }))
    try {
      const res = await ep.putLevel({ source: 'quiz', clipSlug: slug, correct: r.correct, total: r.total })
      if (res.changed) ctx.setLearner((l) => ({ ...l, level: res.level }))
      return res
    } catch {
      return null
    }
  }
  return (
    <Quiz
      clip={clip} onFinish={onFinish}
      onNext={() => { nav({ type: 'pop' }); goNext(ctx, slug) }}
      onAgain={() => { nav({ type: 'pop' }); nav({ type: 'replace', route: { name: 'player', slug, challenge: false } }) }}
      onDone={() => nav({ type: 'pop' })}
    />
  )
}

function WordsRoute({ ctx, filter }: { ctx: Ctx; filter: WordsFilter }) {
  const { ep, nav } = ctx
  const res = useResource(() => ep.library(), [])
  return (
    <Words
      words={res} filter={filter} remote={ctx.remote} onReload={res.reload} {...ctx.focus({ name: 'words', filter })}
      onFilter={(f) => nav({ type: 'replace', route: { name: 'words', filter: f } })}
      onFindClip={() => nav({ type: 'reset', route: { name: 'home' } })}
    />
  )
}

function SettingsRoute({ ctx }: { ctx: Ctx }) {
  const { ep, nav, learner } = ctx
  const onAction = (a: SettingsAction) => {
    if (a.kind === 'open') { nav({ type: 'push', route: { name: a.route } }); return }
    ctx.setSettingsStatus(null)
    if (a.kind === 'patch') {
      if (a.patch.learning) { ctx.memory.forget('home'); ctx.setCatalog(null) }
      void ctx.patchLearner(a.patch).then((ok) => { if (!ok) ctx.setSettingsStatus(strings.common.saveError) })
      return
    }
    const before = learner.level
    ctx.setLearner((l) => ({ ...l, level: a.level }))
    ctx.memory.forget('home')
    ep.putLevel({ source: 'settings', level: a.level }).catch(() => {
      ctx.setLearner((l) => (l.level === a.level ? { ...l, level: before } : l))
      ctx.setSettingsStatus(strings.common.saveError)
    })
  }
  return <Settings learner={learner} phoneName={ctx.session.phone} remote={ctx.remote} status={ctx.settingsStatus} onAction={onAction} {...ctx.focus({ name: 'settings' })} />
}
