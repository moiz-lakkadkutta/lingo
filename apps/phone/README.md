# Lingo Phone (Expo SDK 54)

Join the TV (QR or six-character code), see saved words live, review them (SM-2, graded on the server), see progress.

**Run locally** (phone and laptop on the same Wi-Fi; the API listens on port 4000):

```bash
pnpm db:deploy && pnpm api                                   # laptop
EXPO_PUBLIC_API_URL=http://<LAN-IP>:4000 pnpm --filter @lingo/phone start
pnpm --filter @lingo/api exec tsx scripts/fake-tv.ts --api http://<LAN-IP>:4000   # a stand-in TV: s = save, q = quiz
```

The server address can also be changed in the app (Join screen footer) without a rebuild.

**Tests:** `pnpm --filter @lingo/phone test` (logic and react-test-renderer screens in Node) and `pnpm --filter @lingo/phone typecheck`.

**Builds (EAS, internal distribution):** after `npx eas-cli@latest login && npx eas-cli@latest init` in this folder,

- Android APK (primary): `pnpm --filter @lingo/phone build:android`
- iOS device (needs a paid Apple Developer account): `pnpm --filter @lingo/phone build:ios`
- iOS Simulator (no account needed): `pnpm --filter @lingo/phone build:ios-sim`

Set `EXPO_PUBLIC_API_URL` in `eas.json` to the laptop's LAN address first. Cleartext HTTP (Android) and ATS exceptions (iOS) are
for the LAN demo only; remove them when the API has HTTPS. Manual device checklist: `docs/plans/LING-006.md` (M1–M5, D1–D16).
