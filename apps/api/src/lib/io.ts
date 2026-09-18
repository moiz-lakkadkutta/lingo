import type { LingoIo } from '../server'
let io: LingoIo | null = null
/** Set once at startup; route handlers emit through getIo() so app.ts stays importable in tests without a server. */
export const setIo = (s: LingoIo) => { io = s }
export const getIo = () => io
