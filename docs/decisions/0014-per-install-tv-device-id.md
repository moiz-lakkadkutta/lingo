# 0014 — A per-install TV device id

Status: accepted (LING-005 review fix H1, commit a6ef6f8, 2026-10-02). The two-device check on hardware is pending
(docs/plans/LING-005.md §10 step 15).
Plan: docs/plans/LING-005.md §10 step 15. Review: docs/reviews/2026-10-02-ling-005.md (H1).

## Context

The API keys a learner by the `x-device-id` header. Root defaulted `deviceId` to `'dev-device'` and neither platform entry passed one,
so every Fire TV and every Vega device was the same learner: one level, one library, one Continue row, one session code (every TV
showed the same pairing code and every phone joined one room) and one Plus entitlement (a purchase on one stick gave Plus to all).

## Decision

1. **Each TV install creates a stable id once**: `tv-<uuid>` (lower-case v4 UUID), made on first launch by
   `packages/shared-ui/src/platform/deviceId.ts` (`loadDeviceId`, `useDeviceId`) and stored under the key `lingo.deviceId` in the store the
   platform entry hands in. Later launches reuse it.
2. **Stores**: Fire OS keeps it in AsyncStorage and makes the UUID with expo-crypto's `randomUUID` (`apps/expo/App.tsx`). Vega keeps it in
   MMKV through `@amazon-devices/react-native-mmkv` (`apps/vega/src/App.tsx`; added to the `check:vega` allowlist), with shared-ui's
   `randomUuid` (`crypto.getRandomValues` when the runtime has it, else `Math.random`; the id only has to be unique, not secret).
3. **No shared fallback.** `RootProps.deviceId` is required, so a build without an id does not typecheck. `useDeviceId` renders nothing
   until the id is known. If the store cannot be read or written, the app still gets a fresh id for that run (a new learner next launch)
   rather than a constant.

## Consequences

- Two TVs on one API are two learners with their own codes, words, level and Plus.
- Reinstalling the app or clearing its data creates a new learner: saved words, level and progress stay with the old id. Plus comes
  back through Restore, because the receipt moves to the newest learner that posts it (decision 0012).
- The id is not a secret and not authenticated; anyone who learns it can act as that TV on the device-id routes. Acceptable on a LAN demo;
  account sign-in is out of scope. The phone keeps its own id and reaches the TV's learner only through the session code (decision 0011).
- Manual check (plan §10 step 15): two devices against one API show different pairing codes, and the database lists two `tv-<uuid>` ids.
