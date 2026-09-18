import React, { useEffect, useRef, useState } from 'react'
import { Pressable, SafeAreaView, Text, TextInput, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera' // https://docs.expo.dev/versions/v54.0.0/sdk/camera/
import * as Device from 'expo-device' // https://docs.expo.dev/versions/v54.0.0/sdk/device/#devicedevicename
import * as Linking from 'expo-linking' // https://docs.expo.dev/versions/v54.0.0/sdk/linking/ (scheme "lingo" in app.json)
import { io, type Socket } from 'socket.io-client'
import { extractSessionCode } from '@lingo/contracts'
import type { ClientToServerEvents, DueWord, ServerToClientEvents, WordSavedPayload } from '@lingo/contracts'

const API = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000'
const C = { ground: '#0F151B', surface: '#182028', text: '#EFF1EE', dim: '#A7B1BC', marker: '#E3C77A', blue: '#7FB3D5' }
type Screen = 'join' | 'live' | 'quiz' | 'progress'
type PhoneSocket = Socket<ServerToClientEvents, ClientToServerEvents>

/** Four screens, no drawer. Join → Live (saved words appear as the TV saves them) → Quiz (SM-2, server-side grading) → Progress. */
export default function App() {
  const [screen, setScreen] = useState<Screen>('join')
  const [code, setCode] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [permission, requestPermission] = useCameraPermissions()
  const socketRef = useRef<PhoneSocket | null>(null) // a ref, not state: join() must see the live socket even when called several times in one frame
  const scanned = useRef(false) // Expo's pattern: once a frame is handled, onBarcodeScanned is undefined until the user asks to scan again
  const [saved, setSaved] = useState<WordSavedPayload[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [due, setDue] = useState<DueWord[]>([])
  const headers = { 'content-type': 'application/json', 'x-device-id': 'phone-dev' }
  const url = Linking.useURL()

  /** Typed code, scanned QR, or deep link → the same six characters; the code is the single source of truth. */
  const join = (c: string) => {
    socketRef.current?.disconnect() // never two sockets: the old one would stay in the room and the TV would see a second phone
    const s: PhoneSocket = io(API, { transports: ['websocket'] })
    socketRef.current = s
    const deviceName = Device.deviceName?.trim().slice(0, 40) || undefined // JoinPayload clamps too; sending a clean name keeps the TV's label honest
    s.on('connect', () => s.emit('join', { code: c, role: 'phone', deviceName })) // re-emits on every reconnect: rooms are lost on a new connection
    s.on('session:error', (e) => { s.disconnect(); if (socketRef.current === s) socketRef.current = null; setHint(e.message); setScreen('join') }) // a refused join must not be re-sent on every reconnect
    s.on('word:saved', (w) => setSaved((x) => (x.some((v) => v.savedWordId === w.savedWordId) ? x : [...x, w])))
    s.on('quiz:start', () => loadDue().then(() => setScreen('quiz')))
    setCode(c); setHint(null); setScanning(false); setScreen('live')
  }
  /** Returns false when the input holds no code (the hint explains). */
  const tryJoin = (input: string | null | undefined): boolean => {
    const c = extractSessionCode(input ?? '')
    if (!c) { setHint('Check the six characters on the TV.'); return false }
    join(c)
    return true
  }
  const onScanned = (data: string) => {
    if (scanned.current) return // the camera reports the same code on every frame until the re-render drops the handler
    scanned.current = true
    if (!tryJoin(data)) scanned.current = false // not a Lingo code: keep looking
  }
  const lastUrl = useRef<string | null>(null)
  useEffect(() => { if (url && url !== lastUrl.current) { lastUrl.current = url; if (extractSessionCode(url)) tryJoin(url) } }, [url]) // tryJoin is stable enough: it only reads state setters
  const scan = async () => {
    const p = permission?.granted ? permission : await requestPermission()
    if (p?.granted) { scanned.current = false; setScanning(true) } else setHint('Camera is off. Type the code instead.')
  }
  const loadDue = async () => { const r = await fetch(`${API}/me/words?due=today`, { headers }); setDue(((await r.json()) as { data: DueWord[] }).data) }
  useEffect(() => () => { socketRef.current?.disconnect() }, []) // unmount only; join() handles replacement itself

  const btn = (label: string, onPress: () => void, primary = false) => (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ backgroundColor: primary ? C.blue : C.surface, padding: 18, borderRadius: 8, minHeight: 56, justifyContent: 'center' }}><Text style={{ color: primary ? C.ground : C.text, fontSize: 18, textAlign: 'center' }}>{label}</Text></Pressable>
  )
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.ground, padding: 20, gap: 16 }}>
      {screen === 'join' && !scanning && (<>
        <Text style={{ color: C.text, fontSize: 28, fontWeight: '600' }}>Enter the code on your TV</Text>
        <TextInput value={code} onChangeText={setCode} autoCapitalize="characters" maxLength={6} placeholder="ABC234" placeholderTextColor={C.dim} style={{ color: C.text, fontSize: 36, letterSpacing: 8, backgroundColor: C.surface, padding: 16, borderRadius: 8, textAlign: 'center' }} accessibilityLabel="Six character code" />
        {hint ? <Text style={{ color: C.marker, fontSize: 16 }} accessibilityLiveRegion="polite">{hint}</Text> : null}
        {btn('Join', () => tryJoin(code), true)}
        {btn("Scan the TV's code", scan)}
        {btn('Review words', () => loadDue().then(() => setScreen('quiz')))}
      </>)}
      {screen === 'join' && scanning && (<>
        <Text style={{ color: C.text, fontSize: 22, fontWeight: '600' }}>Point at the code on the TV</Text>
        <CameraView style={{ flex: 1, borderRadius: 12, overflow: 'hidden' }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={scanned.current ? undefined : (r) => onScanned(r.data)} accessibilityLabel="Camera, scanning for the TV's QR code" />
        {hint ? <Text style={{ color: C.marker, fontSize: 16 }} accessibilityLiveRegion="polite">{hint}</Text> : null}
        {btn('Type it instead', () => { scanned.current = false; setScanning(false) })}
      </>)}
      {screen === 'live' && (<>
        <Text style={{ color: C.dim, fontSize: 14 }}>{saved.at(-1)?.clipTitle ?? `Connected · ${code}`}</Text>
        <Text style={{ color: C.text, fontSize: 24, fontWeight: '600' }}>Saved words</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{saved.map((w) => (
          <Pressable key={w.savedWordId} onPress={() => setOpen(open === w.savedWordId ? null : w.savedWordId)} accessibilityRole="button" accessibilityLabel={`${w.word}, ${w.gloss}`} style={{ backgroundColor: C.marker, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, maxWidth: '100%' }}>
            <Text style={{ color: C.ground, fontSize: 18 }}>{w.word}</Text>
            {open === w.savedWordId ? <><Text style={{ color: C.ground, fontSize: 14 }}>{w.gloss}</Text><Text style={{ color: C.ground, fontSize: 13, fontStyle: 'italic' }}>{w.example}</Text></> : null}
          </Pressable>
        ))}</View>
        {saved.length ? btn('Quiz me now', () => loadDue().then(() => setScreen('quiz')), true) : <Text style={{ color: C.dim }}>Words you save on the TV appear here.</Text>}
      </>)}
      {screen === 'quiz' && <QuizDeck due={due} onDone={() => setScreen('progress')} headers={headers} />}
      {screen === 'progress' && (<><Text style={{ color: C.text, fontSize: 28, fontWeight: '600' }}>Welcome back</Text><Text style={{ color: C.dim }}>Next review tomorrow.</Text>{btn('Back', () => setScreen('join'))}</>)}
    </SafeAreaView>
  )
}

function QuizDeck({ due, onDone, headers }: { due: DueWord[]; onDone: () => void; headers: Record<string, string> }) {
  const [i, setI] = useState(0); const [flipped, setFlipped] = useState(false)
  const w = due[i]
  if (!w) return <><Text style={{ color: C.text, fontSize: 24 }}>Nothing due today.</Text><Pressable onPress={onDone} style={{ backgroundColor: C.surface, padding: 18, borderRadius: 8 }}><Text style={{ color: C.text, textAlign: 'center' }}>Done</Text></Pressable></>
  const grade = async (g: 'again' | 'hard' | 'good' | 'easy') => { await fetch(`${API}/me/reviews`, { method: 'POST', headers, body: JSON.stringify({ savedWordId: w.savedWordId, grade: g }) }); setFlipped(false); if (i + 1 >= due.length) onDone(); else setI(i + 1) }
  return (
    <View style={{ flex: 1, gap: 16 }}>
      <Text style={{ color: C.dim }}>{i + 1} of {due.length}</Text>
      <Pressable onPress={() => setFlipped(true)} style={{ flex: 1, backgroundColor: C.surface, borderRadius: 12, padding: 24, justifyContent: 'center', gap: 12 }} accessibilityLabel={flipped ? `${w.word}: ${w.gloss}` : `${w.word}. Tap to reveal`}>
        <Text style={{ color: C.text, fontSize: 36, fontWeight: '600', textAlign: 'center' }}>{w.word}</Text>
        {flipped ? <><Text style={{ color: C.marker, fontSize: 24, textAlign: 'center' }}>{w.gloss}</Text><Text style={{ color: C.dim, fontSize: 16, textAlign: 'center', fontStyle: 'italic' }}>{w.example}</Text></> : <Text style={{ color: C.dim, textAlign: 'center' }}>Tap to reveal</Text>}
      </Pressable>
      {flipped ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['again', 'hard', 'good', 'easy'] as const).map((g) => <Pressable key={g} onPress={() => grade(g)} style={{ flex: 1, backgroundColor: g === 'good' ? C.blue : C.surface, padding: 16, borderRadius: 8, minHeight: 56, justifyContent: 'center' }}><Text style={{ color: g === 'good' ? C.ground : C.text, textAlign: 'center', fontSize: 16, textTransform: 'capitalize' }}>{g}</Text></Pressable>)}
        </View>
      ) : null}
    </View>
  )
}
