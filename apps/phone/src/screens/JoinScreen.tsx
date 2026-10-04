import React, { useRef, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera' // https://docs.expo.dev/versions/v54.0.0/sdk/camera/
import { extractSessionCode } from '@lingo/contracts'
import { Button } from '../components/Button'
import { CodeBoxes } from '../components/CodeBoxes'
import { Hint } from '../components/Hint'
import { Page } from '../components/Page'
import { emptyBoxes } from '../lib/codeInput'
import { normaliseApiUrl } from '../lib/storage'
import type { Hint as HintKey } from '../state/app'
import { strings } from '../strings'
import { color, radius, space, tap, type } from '../theme'

export interface JoinScreenProps {
  hint: HintKey | null; joining: boolean; apiUrl: string
  onCode(code: string): void; onScanned(data: string): void; onReview(): void; onApiUrl(u: string): void; onHint(h: HintKey | null): void
}
/** Type the six characters (auto-advancing boxes), scan the TV's QR, or review without a TV. The footer changes the server without a rebuild. */
export function JoinScreen({ hint, joining, apiUrl, onCode, onScanned, onReview, onApiUrl, onHint }: JoinScreenProps) {
  const [boxes, setBoxes] = useState(emptyBoxes)
  const [scanning, setScanning] = useState(false)
  const [permission, requestPermission] = useCameraPermissions()
  const scanned = useRef(false) // Expo's pattern: once a frame is handled, onBarcodeScanned is undefined until the user scans again
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(apiUrl)
  const [draftBad, setDraftBad] = useState(false)
  const full = boxes.every((b) => b.length === 1)

  const scan = async () => {
    const p = permission?.granted ? permission : await requestPermission()
    if (p?.granted) { scanned.current = false; onHint(null); setScanning(true) } else onHint('cameraOff')
  }
  const handleScan = (data: string) => {
    if (scanned.current) return // the camera reports the same code on every frame until the re-render drops the handler
    if (!extractSessionCode(data)) { onHint('badCode'); return } // not a Lingo code: keep looking
    scanned.current = true
    setScanning(false)
    onScanned(data)
  }
  const saveServer = () => {
    const u = normaliseApiUrl(draft)
    if (!u) { setDraftBad(true); return }
    setDraftBad(false); setEditing(false); onApiUrl(u)
  }

  if (scanning) return (
    <Page>
      <Text accessibilityRole="header" style={[type.title, { color: color.text }]}>{strings.join.scanTitle}</Text>
      <CameraView
        style={{ flex: 1, borderRadius: radius.card, overflow: 'hidden' }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned.current ? undefined : (r) => handleScan(r.data)}
        aria-label={strings.join.scanLabel}
        accessibilityLabel={strings.join.scanLabel}
      />
      <Hint hint={hint} />
      <Button label={strings.join.typeInstead} onPress={() => { scanned.current = false; setScanning(false) }} />
    </Page>
  )

  return (
    <Page>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, gap: space.m }}>
        <Text accessibilityRole="header" style={[type.title, { color: color.text }]}>{strings.join.title}</Text>
        <CodeBoxes
          boxes={boxes}
          editable={!joining}
          onBoxes={(b) => { setBoxes(b); if (hint === 'invalidChar' || hint === 'badCode') onHint(null) }}
          onComplete={(code) => onCode(code)}
          onReject={() => onHint('invalidChar')}
        />
        <Hint hint={hint} />
        {joining ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
            <ActivityIndicator color={color.interactive} />
            <Text style={[type.body, { color: color.text }]}>{strings.join.joining}</Text>
          </View>
        ) : null}
        <Button label={strings.join.join} variant="primary" disabled={!full || joining} onPress={() => onCode(boxes.join(''))} />
        <Button label={strings.join.scan} onPress={scan} />
        <Button label={strings.join.review} onPress={onReview} />
        <View style={{ flex: 1 }} />
        <View style={{ gap: space.s }}>
          <Text style={[type.label, { color: color.textSecondary }]}>{strings.join.server(apiUrl)}</Text>
          {editing ? (<>
            <TextInput
              value={draft}
              onChangeText={(t) => { setDraft(t); setDraftBad(false) }}
              aria-label={strings.join.serverLabel}
              accessibilityLabel={strings.join.serverLabel}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onSubmitEditing={saveServer}
              style={[type.body, { minHeight: tap, color: color.text, backgroundColor: color.surface1, borderRadius: radius.button, paddingHorizontal: space.m }]}
            />
            {draftBad ? <Hint text={strings.join.serverInvalid} /> : null}
            <Button label={strings.join.serverSave} ariaLabel={`${strings.join.serverSave}: ${strings.join.serverLabel}`} onPress={saveServer} />
          </>) : (
            <Button label={strings.join.serverChange} ariaLabel={`${strings.join.serverChange}: ${strings.join.serverLabel}`} onPress={() => { setDraft(apiUrl); setEditing(true) }} />
          )}
        </View>
      </KeyboardAvoidingView>
    </Page>
  )
}
