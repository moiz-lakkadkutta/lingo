import { buildQrMatrix, qrPath } from '../src/lib/qr'

const isFinder = (m: boolean[][], r0: number, c0: number) => {
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
    const border = r === 0 || r === 6 || c === 0 || c === 6
    const core = r >= 2 && r <= 4 && c >= 2 && c <= 4
    const expected = border || core
    if (m[r0 + r]![c0 + c] !== expected) return false
  }
  return true
}

describe('buildQrMatrix', () => {
  it('returns a square matrix of size 21 + 4·(v−1)', () => {
    const m = buildQrMatrix('lingo://join/ABC234')
    const n = m.length
    expect(n).toBeGreaterThanOrEqual(21)
    expect((n - 21) % 4).toBe(0)
    for (const row of m) expect(row.length).toBe(n)
  })
  it('is deterministic', () => { expect(buildQrMatrix('lingo://join/ABC234')).toEqual(buildQrMatrix('lingo://join/ABC234')) })
  it('has the three finder patterns (7×7, dark border, dark 3×3 core)', () => {
    const m = buildQrMatrix('lingo://join/ABC234')
    const n = m.length
    expect(isFinder(m, 0, 0)).toBe(true)
    expect(isFinder(m, 0, n - 7)).toBe(true)
    expect(isFinder(m, n - 7, 0)).toBe(true)
  })
  it('grows for a longer value', () => {
    const short = buildQrMatrix('ABC234').length
    const long = buildQrMatrix('https://phone.lingo.example/join/ABC234?ref=tv&utm=very-long-query-string-to-push-the-version-up').length
    expect(long).toBeGreaterThan(short)
  })
  it('throws on empty input', () => { expect(() => buildQrMatrix('')).toThrow() })
})

describe('qrPath', () => {
  const m: boolean[][] = [[true, false], [false, true]]
  it('size = n + 2·margin', () => {
    expect(qrPath(m).size).toBe(2 + 8)
    expect(qrPath(m, 1).size).toBe(4)
  })
  it('emits one M…z command per dark module', () => {
    const real = buildQrMatrix('lingo://join/ABC234')
    const dark = real.flat().filter(Boolean).length
    expect((qrPath(real).d.match(/M/g) ?? []).length).toBe(dark)
    expect((qrPath(real).d.match(/z/g) ?? []).length).toBe(dark)
  })
  it('offsets modules by the margin', () => {
    expect(qrPath(m, 4).d).toBe('M4 4h1v1h-1zM5 5h1v1h-1z')
    expect(qrPath(m, 0).d).toBe('M0 0h1v1h-1zM1 1h1v1h-1z')
  })
})
