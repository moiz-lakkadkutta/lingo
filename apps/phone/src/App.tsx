import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import AsyncStorage from '@react-native-async-storage/async-storage' // https://docs.expo.dev/versions/v54.0.0/sdk/async-storage/
import * as Crypto from 'expo-crypto' // https://docs.expo.dev/versions/v54.0.0/sdk/crypto/
import * as Device from 'expo-device' // https://docs.expo.dev/versions/v54.0.0/sdk/device/#devicedevicename
import * as Linking from 'expo-linking' // https://docs.expo.dev/versions/v54.0.0/sdk/linking/ (scheme "lingo" in app.json)
import { useFonts } from 'expo-font' // https://docs.expo.dev/versions/v54.0.0/sdk/font/
// Per-weight entry points: the package index would bundle every weight (~11 MB of TTFs) into the app.
import { NotoSans_400Regular } from '@expo-google-fonts/noto-sans/400Regular'
import { NotoSans_600SemiBold } from '@expo-google-fonts/noto-sans/600SemiBold'
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope/800ExtraBold'
import { extractSessionCode } from '@lingo/contracts'
import type { Lang } from '@lingo/contracts'
import { TabBar } from './components/TabBar'
import { ApiError, createApi, type PhoneApi } from './lib/api'
import { createPhoneLink } from './lib/link'
import { createStore } from './lib/storage'
import { JoinScreen } from './screens/JoinScreen'
import { LiveScreen } from './screens/LiveScreen'
import { ProgressScreen } from './screens/ProgressScreen'
import { QuizScreen } from './screens/QuizScreen'
import { appReducer, initialApp, type Screen } from './state/app'
import { color } from './theme'

const DEFAULT_API = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000'

/** Four screens, no drawer: Join → Live (saved words as the TV saves them) → Review (SM-2 graded server-side) → Progress. Side effects live here only. */
export default function App() {
  const [fontsLoaded] = useFonts({ NotoSans_400Regular, NotoSans_600SemiBold, Manrope_800ExtraBold })
  const store = useMemo(() => createStore(AsyncStorage, () => Crypto.randomUUID()), [])
  const [s, dispatch] = useReducer(appReducer, initialApp)
  const [booted, setBooted] = useState(false)
  const [apiUrl, setApiUrl] = useState(DEFAULT_API)
  const [learning, setLearning] = useState<Lang>('de')
  const apiUrlRef = useRef(DEFAULT_API)
  const deviceIdRef = useRef<string>('phone-starting')
  const tvRef = useRef<string | null>(null)
  const codeRef = useRef<string | null>(null) // the code the link is joining or joined
  tvRef.current = s.tv

  const refused = useCallback(() => { codeRef.current = null; void store.forgetTv(); dispatch({ type: 'refused' }) }, [store])
  const link = useMemo(() => createPhoneLink(() => apiUrlRef.current, {
    onJoined: () => { if (codeRef.current) void store.setTv(codeRef.current); dispatch({ type: 'joined' }) },
    onRefused: () => refused(),
    onTransport: (up) => dispatch({ type: 'transport', up }),
    onUnreachable: () => dispatch({ type: 'unreachable' }),
    onWordSaved: (w) => dispatch({ type: 'wordSaved', w }),
    onQuizStart: (p) => dispatch({ type: 'quizStart', clipSlug: p.clipSlug }),
  }), [store, refused])
  useEffect(() => () => link.leave(), [link])

  /** Every REST call carries x-session-code once a TV is remembered; an UNKNOWN_CODE answer forgets that TV. */
  const api = useMemo<PhoneApi>(() => {
    const raw = createApi(() => apiUrlRef.current, () => ({ deviceId: deviceIdRef.current, tvCode: tvRef.current }))
    const guard = <T,>(p: Promise<T>): Promise<T> => p.catch((e: unknown) => {
      if (e instanceof ApiError && e.code === 'UNKNOWN_CODE') { link.leave(); refused() }
      throw e
    })
    return { me: () => guard(raw.me()), dueWords: () => guard(raw.dueWords()), review: (id, g) => guard(raw.review(id, g)), stats: () => guard(raw.stats()) }
  }, [link, refused])

  const join = useCallback((code: string) => {
    codeRef.current = code
    dispatch({ type: 'submit', code })
    link.join(code, Device.deviceName)
  }, [link])

  useEffect(() => {
    let live = true
    void (async () => {
      const [deviceId, tv, storedUrl] = await Promise.all([store.deviceId(), store.tv(), store.apiUrl()])
      if (!live) return
      deviceIdRef.current = deviceId
      if (storedUrl) { apiUrlRef.current = storedUrl; setApiUrl(storedUrl) }
      tvRef.current = tv
      dispatch({ type: 'boot', tv })
      if (tv) { codeRef.current = tv; link.join(tv, Device.deviceName) }
      setBooted(true)
    })()
    return () => { live = false }
  }, [store, link])

  useEffect(() => {
    if (!booted) return
    api.me().then((l) => setLearning(l.learning), () => {})
  }, [booted, s.tv, api])

  const url = Linking.useURL()
  const lastUrl = useRef<string | null>(null)
  useEffect(() => {
    if (!booted || !url || url === lastUrl.current) return
    lastUrl.current = url
    const code = extractSessionCode(url)
    if (code) join(code)
  }, [url, booted, join])

  const go = (screen: Screen) => dispatch({ type: 'go', screen })
  const forget = () => { link.leave(); codeRef.current = null; void store.forgetTv(); dispatch({ type: 'forgetTv' }) }
  const changeServer = (u: string) => {
    apiUrlRef.current = u; setApiUrl(u); void store.setApiUrl(u)
    if (codeRef.current && s.link !== 'joined') link.join(codeRef.current, Device.deviceName) // a join stuck on the old address retries on the new one
  }

  if (!fontsLoaded || !booted) return <View style={{ flex: 1, backgroundColor: color.ground }} />
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={{ flex: 1, backgroundColor: color.ground }}>
        {s.screen === 'join' && (
          <JoinScreen
            hint={s.hint}
            joining={s.link === 'joining' && s.pending !== null}
            apiUrl={apiUrl}
            onCode={join}
            onScanned={(data) => { const c = extractSessionCode(data); if (c) join(c); else dispatch({ type: 'hint', hint: 'badCode' }) }}
            onReview={() => go('quiz')}
            onApiUrl={changeServer}
            onHint={(hint) => dispatch({ type: 'hint', hint })}
          />
        )}
        {s.screen === 'live' && (
          <LiveScreen link={s.link} saved={s.saved} open={s.open} learning={learning} quizOffer={s.quizOffer !== null}
            onToggle={(id) => dispatch({ type: 'toggleWord', id })} onQuiz={() => go('quiz')} onForget={forget} />
        )}
        {s.screen === 'quiz' && (
          <QuizScreen api={api} firstClip={s.deckClip} learning={learning} onResult={(c, t) => link.sendQuizResult(c, t)} onProgress={() => go('progress')} />
        )}
        {s.screen === 'progress' && <ProgressScreen api={api} onReview={() => go('quiz')} />}
      </View>
      {s.screen !== 'join' ? <TabBar screen={s.screen} hasTv={s.tv !== null} onGo={go} /> : null}
    </SafeAreaProvider>
  )
}
