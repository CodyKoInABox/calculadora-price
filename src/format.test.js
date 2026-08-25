import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  exportAbCompareCsv,
  exportCompareCsv,
  exportScheduleCsv,
  formatInstallmentMonth,
  formatYearMonth,
  monthCashOut,
  parseYearMonthInput,
  shiftYearMonth,
  yearMonthInputValue
} from './format'

function scheduleRow(month, overrides = {}) {
  return {
    month,
    payment: 100,
    interest: 10,
    amortization: 90,
    balloon: 0,
    balance: 1000,
    ...overrides
  }
}

beforeEach(() => {
  vi.stubGlobal('document', {
    createElement: vi.fn(() => ({ click: vi.fn(), href: '', download: '' }))
  })
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:csv'),
    revokeObjectURL: vi.fn()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

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

describe('CSV exports', () => {
  it('exports the schedule ledger with fixed cents and monthly cash out', () => {
    const csv = exportScheduleCsv([
      scheduleRow(1, {
        payment: 1000,
        interest: 10.1,
        amortization: 989.9,
        balloon: 250,
        balance: 5000
      })
    ], { year: 2030, month: 1 })

    expect(csv).toBe(
      '\ufeffMês;Calendário;Parcela regular;Juros;Amortização;Extra/Balão;Total no mês;Saldo\n' +
      '1;jan/2030;1000,00;10,10;989,90;250,00;1250,00;5000,00'
    )
  })

  it('uses the longer PRICE/SAC schedule and includes regular and total deltas', () => {
    const csv = exportCompareCsv(
      [scheduleRow(1, { payment: 100, balloon: 20 })],
      [
        scheduleRow(1, { payment: 90, balloon: 25 }),
        scheduleRow(2, {
          payment: 90,
          interest: 9,
          amortization: 101,
          balloon: 20,
          balance: 0
        })
      ],
      { year: 2030, month: 1 }
    )
    const [header, first, second] = csv.split('\n')

    expect(header).toContain('Parcela regular Price')
    expect(header).toContain('Extra/Balão SAC')
    expect(header).toContain('Δ Total no mês')
    expect(first.split(';').slice(-2)).toEqual(['-10,00', '-5,00'])
    expect(second.split(';').slice(2, 8)).toEqual(['', '', '', '', '', ''])
    expect(second.split(';').slice(8, 14)).toEqual([
      '90,00', '9,00', '101,00', '20,00', '110,00', '0,00'
    ])
    expect(second.split(';').slice(-2)).toEqual(['90,00', '110,00'])
  })

  it('includes total deltas through the longer A/B schedule', () => {
    const csv = exportAbCompareCsv(
      [
        scheduleRow(1, { payment: 100, balloon: 50 }),
        scheduleRow(2, { payment: 80, balance: 0 })
      ],
      [scheduleRow(1, { payment: 120, balloon: 10 })],
      { year: 2030, month: 1 }
    )
    const [, first, second] = csv.split('\n')

    expect(first.split(';').slice(-2)).toEqual(['20,00', '-20,00'])
    expect(second.split(';').slice(8, 14)).toEqual(['', '', '', '', '', ''])
    expect(second.split(';').slice(-2)).toEqual(['-80,00', '-80,00'])
  })
})
