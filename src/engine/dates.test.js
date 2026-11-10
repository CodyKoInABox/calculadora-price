import { describe, expect, it } from 'vitest'
import { addMonths, daysBetween, dueDates, parseIsoDate, toDayNumber, fromDayNumber } from './dates'

describe('parseIsoDate', () => {
  it('accepts real calendar dates only', () => {
    expect(parseIsoDate('2026-02-28')).toEqual({ year: 2026, month: 2, day: 28 })
    expect(parseIsoDate('2026-02-30')).toBeNull()
    expect(parseIsoDate('2026-13-01')).toBeNull()
    expect(parseIsoDate('10/02/2026')).toBeNull()
    expect(parseIsoDate('')).toBeNull()
  })
})

describe('addMonths', () => {
  it('keeps the day and clamps to the end of shorter months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30')
  })

  it('rolls over years in both directions', () => {
    expect(addMonths('2026-11-10', 3)).toBe('2027-02-10')
    expect(addMonths('2026-01-10', -1)).toBe('2025-12-10')
    expect(addMonths('2026-05-01', 0)).toBe('2026-05-01')
  })
})

describe('dueDates and day arithmetic', () => {
  it('lists monthly due dates from the first installment', () => {
    expect(dueDates('2026-05-01', 3)).toEqual(['2026-05-01', '2026-06-01', '2026-07-01'])
  })

  it('counts calendar days between dates', () => {
    expect(daysBetween('2026-04-10', '2026-04-25')).toBe(15)
    expect(daysBetween('2026-02-10', '2026-04-25')).toBe(74)
    expect(toDayNumber('2026-04-10') - toDayNumber('2026-03-10')).toBe(31)
    expect(fromDayNumber(toDayNumber('2026-12-31'))).toBe('2026-12-31')
  })
})
