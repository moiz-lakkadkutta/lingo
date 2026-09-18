# 0005 — Realtime session (TV ↔ phone)

- The Socket.IO client lives in packages/shared-ui behind a `SessionTransport` interface (default: socket.io-client,
  transports ['websocket']). Amazon lists Socket.io 4.7.5 as tested on Vega for RN 0.72 and 0.83
  (https://developer.amazon.com/docs/vega-api/0.24/supported-libraries.html); the library has no native code and uses
  React Native's global WebSocket. Platform entries stay one-liners and may inject another transport (relay) later.
- A session is created on app start (after /me) and is idempotent per TV device: POST /sessions returns the learner's
  latest session. The 6-character code is the single source of truth; joinUrl (`${PHONE_URL ?? 'lingo://join'}/CODE`)
  is only a carrier. The phone extracts the code from typed input, a scanned QR, or a deep link the same way.
- Phone presence is live state derived from the Socket.IO room (socket.data.role/phoneName, io.in(code).fetchSockets()),
  reported to a joining TV as `session:state`; `Session.phoneConnected` is only a coarse persisted flag. No phoneName column.
  Several phones may sit in one room: the first phone wins for the name the TV shows, every phone receives `word:saved`,
  and `phone:disconnected` (and the flag reset) fire only when the last phone leaves.
- `join.deviceName` is sanitised, not rejected (trim, clip to 40, blank → "Your phone"): a phone that can never pair is
  worse than a clipped name. `POST /me/words.sessionCode` is validated before any row is written; the `word:saved` emit
  never decides the HTTP result (a bad payload is logged, the save stands).
- `word:saved` is emitted only by POST /me/words; every socket payload is a Zod schema in @lingo/contracts; invalid or
  unknown `join` → `session:error`, never a crash.
- QR: qrcode-generator 2.0.4 (MIT, zero deps) → boolean matrix → one <Path> in react-native-svg (Expo 54: 15.12.1; Vega:
  the SDK's @amazon-devices/react-native-svg via a Metro alias, pattern from Amazon's react-native-multi-tv-app-sample).
  Modules use tokens.color.ground on tokens.color.text — never pure white. Fallback if a device spike fails:
  react-native-qrcode-svg 6.2.0, which Amazon lists as tested on Vega.
- CI runs `prisma migrate deploy` against the Postgres service before tests; apps/api/test/realtime.test.ts proves
  TV save → phone receive < 1 s p95 over a local server.
