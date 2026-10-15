/**
 * The Lingo API as seen from the Vega device (`pnpm api` listens on :4000 on the host).
 * Vega Virtual Device: `localhost` with the device port reverse-forwarded to the host —
 * `vega device start-port-forwarding --device VirtualDevice -p 4000 --forward false` (README.md, VVD checklist step 5).
 * A physical Vega device needs the host's LAN address instead (e.g. `http://192.168.1.x:4000`).
 */
export const API_BASE_URL = 'http://localhost:4000' // VVD + reverse port forwarding (2026-10-14); LAN address for a real device
