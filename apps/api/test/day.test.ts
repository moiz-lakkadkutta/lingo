import { addUtcDays, DAY_MS, startOfNextUtcDay, utcDay } from '../src/lib/day'

describe('UTC days', () => {
  it('utcDay is the ISO date of the instant in UTC', () => {
    expect(utcDay(new Date('2026-10-01T23:59:59.999Z'))).toBe('2026-10-01')
    expect(utcDay(new Date('2026-10-02T00:30:00+02:00'))).toBe('2026-10-01') // 22:30Z
  })
  it('startOfNextUtcDay at 23:59:59.999Z is one millisecond later and at 00:00Z is a full day later', () => {
    const late = new Date('2026-10-01T23:59:59.999Z')
    expect(startOfNextUtcDay(late).getTime() - late.getTime()).toBe(1)
    const midnight = new Date('2026-10-01T00:00:00.000Z')
    expect(startOfNextUtcDay(midnight).getTime() - midnight.getTime()).toBe(DAY_MS)
    expect(startOfNextUtcDay(midnight).toISOString()).toBe('2026-10-02T00:00:00.000Z')
  })
  it('addUtcDays crosses month and year boundaries', () => {
    expect(addUtcDays('2026-10-01', -1)).toBe('2026-09-30')
    expect(addUtcDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addUtcDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addUtcDays('2027-01-01', -1)).toBe('2026-12-31')
  })
})
