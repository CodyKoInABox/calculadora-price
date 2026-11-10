import { describe, expect, it } from 'vitest'
import {
  buildContractTable,
  growthFactor,
  locatePeriod,
  recastBalance,
  walkBalance
} from './contract'

describe('buildContractTable', () => {
  it('reproduces the SAC table by hand: 1000 at 10% a.m. over 2 months', () => {
    const table = buildContractTable({ principal: 1000, rate: 0.1, months: 2, system: 'sac' })
    expect(table.rows).toEqual([
      { month: 1, payment: 60000, interest: 10000, amortization: 50000, balance: 50000 },
      { month: 2, payment: 55000, interest: 5000, amortization: 50000, balance: 0 }
    ])
  })

  it('rejects a principal that is not positive', () => {
    expect(buildContractTable({ principal: 0, rate: 0.1, months: 2, system: 'sac' }).error).toBeTruthy()
  })
})

describe('locatePeriod', () => {
  it('places a date inside the first period, counting elapsed calendar days', () => {
    // Contract starts 2026-04-01 (one month before 2026-05-01); the period has 30 days.
    const position = locatePeriod({ firstDueIso: '2026-05-01', months: 2, dateIso: '2026-04-16' })
    expect(position.k).toBe(1)
    expect(position.periodDays).toBe(30)
    expect(position.f).toBe(0.5)
  })

  it('treats an installment due on the date as already due, so the next one starts a new period', () => {
    const position = locatePeriod({ firstDueIso: '2026-05-01', months: 3, dateIso: '2026-06-01' })
    expect(position.k).toBe(3)
    expect(position.f).toBe(0)
  })

  it('flags dates after the last due date', () => {
    const position = locatePeriod({ firstDueIso: '2026-05-01', months: 2, dateIso: '2026-07-15' })
    expect(position.pastMaturity).toBe(true)
    expect(position.k).toBe(3)
  })

  it('rejects dates before the contract starts', () => {
    expect(locatePeriod({ firstDueIso: '2026-05-01', months: 2, dateIso: '2026-03-31' }).error).toBeTruthy()
  })
})

describe('growthFactor', () => {
  it('compounds fractions of a period at the contract rate', () => {
    expect(growthFactor(0.21, 0.5)).toBeCloseTo(0.1, 12)
    expect(growthFactor(0.1, 1)).toBe(0.1)
    expect(growthFactor(0.1, 0)).toBe(0)
  })
})

describe('walkBalance', () => {
  it('closes a balance of 700 at 10% over two periods, with the last payment absorbing the residue', () => {
    const result = walkBalance({
      start: 70000,
      rate: 0.1,
      steps: [{ month: 1, t: 1 }, { month: 2, t: 2 }],
      paymentFor: () => 60000
    })
    expect(result.rows).toEqual([
      { month: 1, payment: 60000, interest: 7000, amortization: 53000, balance: 17000 },
      { month: 2, payment: 18700, interest: 1700, amortization: 17000, balance: 0 }
    ])
    expect(result.finalBalance).toBe(0)
  })
})

describe('recastBalance', () => {
  it('re-amortizes 700 in two SAC installments of 420 and 385', () => {
    const result = recastBalance({
      startCents: 70000,
      rate: 0.1,
      steps: [{ month: 1, t: 1 }, { month: 2, t: 2 }],
      system: 'sac',
      curveControls: [0.6, 0.85, 1.1, 1.35, 1.6, 1.85]
    })
    expect(result.rows.map(row => row.payment)).toEqual([42000, 38500])
    expect(result.rows.map(row => row.interest)).toEqual([7000, 3500])
    expect(result.finalBalance).toBe(0)
  })

  it('returns no rows when nothing remains', () => {
    expect(recastBalance({ startCents: 0, rate: 0.1, steps: [], system: 'price', curveControls: [] }).rows).toEqual([])
  })
})
