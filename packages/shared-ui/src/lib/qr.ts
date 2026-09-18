// qrcode-generator 2.0.4 (MIT, zero deps): pure JS, no DOM/Node globals in make()/isDark() — safe for Fire OS and Vega bundles.
import qrcode from 'qrcode-generator'

/** [row][col], true = dark. */
export type QrMatrix = boolean[][]

/** Error-correction M (15 %): a join URL is 25–45 bytes → version 2–3, scan-friendly at 320 px from 2–3 m. Throws on ''. */
export function buildQrMatrix(value: string, ecl: 'L' | 'M' | 'Q' | 'H' = 'M'): QrMatrix {
  if (!value) throw new Error('QR value must not be empty')
  const qr = qrcode(0, ecl)
  qr.addData(value, 'Byte')
  qr.make()
  const n = qr.getModuleCount()
  const m: QrMatrix = []
  for (let r = 0; r < n; r++) { const row: boolean[] = []; for (let c = 0; c < n; c++) row.push(qr.isDark(r, c)); m.push(row) }
  return m
}

/** One SVG path (`M x y h1 v1 h-1 z` per dark module) in module units; quiet zone = `margin` modules (ISO/IEC 18004: 4). */
export function qrPath(m: QrMatrix, margin = 4): { d: string; size: number } {
  const n = m.length
  const parts: string[] = []
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r]?.[c]) parts.push(`M${c + margin} ${r + margin}h1v1h-1z`)
  return { d: parts.join(''), size: n + 2 * margin }
}
