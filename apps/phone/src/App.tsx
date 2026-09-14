import React, { useEffect, useState } from 'react'
import { Pressable, SafeAreaView, Text, TextInput, View } from 'react-native'
import { io, type Socket } from 'socket.io-client'
import type { DueWord } from '@lingo/contracts'

const API = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000'
const C = { ground: '#0F151B', surface: '#182028', text: '#EFF1EE', dim: '#A7B1BC', marker: '#E3C77A', blue: '#7FB3D5' }
type Screen = 'join' | 'live' | 'quiz' | 'progress'

/** Four screens, no drawer. Join → Live (saved words appear as the TV saves them) → Quiz (SM-2, server-side grading) → Progress. */
export default function App() {
  const [screen, setScreen] = useState<Screen>('join')
  const [code, setCode] = useState('')
  const [socket, setSocket] = useState<Socket | null>(null)
  const [saved, setSaved] = useState<Array<{ word: string; gloss: string }>>([])
  const [due, setDue] = useState<DueWord[]>([])
  const headers = { 'content-type': 'application/json', 'x-device-id': 'phone-dev' }

  const join = () => {
    const s = io(API); s.emit('join', { code: code.toUpperCase(), role: 'phone' })
    s.on('word:saved', (w: { word: string; gloss: string }) => setSaved((x) => [...x, w]))
    s.on('quiz:start', () => loadDue().then(() => setScreen('quiz')))
    setSocket(s); setScreen('live')
  }
  const loadDue = async () => { const r = await fetch(`${API}/me/words?due=today`, { headers }); setDue(((await r.json()) as { data: DueWord[] }).data) }
  useEffect(() => () => { socket?.disconnect() }, [socket])

  const btn = (label: string, onPress: () => void, primary = false) => (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ backgroundColor: primary ? C.blue : C.surface, padding: 18, borderRadius: 8, minHeight: 56, justifyContent: 'center' }}><Text style={{ color: primary ? C.ground : C.text, fontSize: 18, textAlign: 'center' }}>{label}</Text></Pressable>
  )
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.ground, padding: 20, gap: 16 }}>
      {screen === 'join' && (<>
        <Text style={{ color: C.text, fontSize: 28, fontWeight: '600' }}>Enter the code on your TV</Text>
        <TextInput value={code} onChangeText={setCode} autoCapitalize="characters" maxLength={6} placeholder="ABC234" placeholderTextColor={C.dim} style={{ color: C.text, fontSize: 36, letterSpacing: 8, backgroundColor: C.surface, padding: 16, borderRadius: 8, textAlign: 'center' }} accessibilityLabel="Six character code" />
        {btn('Join', join, true)}
        {btn('Review words', () => loadDue().then(() => setScreen('quiz')))}
      </>)}
      {screen === 'live' && (<>
        <Text style={{ color: C.dim, fontSize: 14 }}>Connected · {code.toUpperCase()}</Text>
        <Text style={{ color: C.text, fontSize: 24, fontWeight: '600' }}>Saved words</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{saved.map((w, i) => <View key={i} style={{ backgroundColor: C.marker, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 }}><Text style={{ color: C.ground, fontSize: 18 }}>{w.word}</Text></View>)}</View>
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
