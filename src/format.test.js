import { describe, expect, it } from 'vitest'
import {
  formatInstallmentMonth,
  formatYearMonth,
  monthCashOut,
  parseYearMonthInput,
  shiftYearMonth,
  yearMonthInputValue
} from './format'

describe('year-month helpers', () => {
  it('shifts across year boundary', () => {
    expect(shiftYearMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftYearMonth({ year: 2026, month: 3 }, 11)).toEqual({ year: 2027, month: 2 })
  })

  it('formats installment 1 as the start month', () => {
    expect(formatInstallmentMonth({ year: 2026, month: 9 }, 1)).toBe('set/2026')
    expect(formatInstallmentMonth({ year: 2026, month: 9 }, 12)).toBe('ago/2027')
  })

  it('round-trips YYYY-MM input values', () => {
    expect(yearMonthInputValue({ year: 2026, month: 3 })).toBe('2026-03')
    expect(parseYearMonthInput('2026-03')).toEqual({ year: 2026, month: 3 })
    expect(parseYearMonthInput('2026-13')).toBeNull()
    expect(parseYearMonthInput('nope')).toBeNull()
  })

  it('formats pt-BR short month/year', () => {
    expect(formatYearMonth({ year: 2026, month: 1 })).toBe('jan/2026')
  })

  it('sums parcela + balão as cash out that month', () => {
    expect(monthCashOut({ payment: 1000, balloon: 250 })).toBe(1250)
    expect(monthCashOut({ payment: 800, balloon: 0 })).toBe(800)
  })
})
