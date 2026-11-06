import { describe, expect, it } from 'vitest'
import { annualToMonthly, curvePresets, simulateFinancing } from './math'
import { breakEvenAnnualRate, compareAmortizeInvest, investedGain, irRateForDays } from './invest'

describe('irRateForDays', () => {
  it('uses the regressive brackets for fixed income', () => {
    expect(irRateForDays(90)).toBe(0.225)
    expect(irRateForDays(180)).toBe(0.225)
    expect(irRateForDays(181)).toBe(0.2)
    expect(irRateForDays(721)).toBe(0.15)
  })
})

describe('investedGain', () => {
  it('returns zero gain for a contribution made in the last month', () => {
    const r = investedGain({ contributions: new Map([[12, 1000]]), months: 12, annualRate: 0.12 })
    expect(r.gross).toBeCloseTo(0, 10)
    expect(r.net).toBeCloseTo(0, 10)
  })

  it('compounds monthly from the month after payment', () => {
    const r = investedGain({ contributions: new Map([[1, 1000]]), months: 13, annualRate: 0.12, taxed: false })
    const monthly = annualToMonthly(0.12)
    expect(r.gross).toBeCloseTo(1000 * ((1 + monthly) ** 12 - 1), 6)
  })

  it('discounts IR on the gain and not on the principal', () => {
    const r = investedGain({ contributions: new Map([[1, 1000]]), months: 13, annualRate: 0.12 })
    expect(r.ir).toBeCloseTo(r.gross * 0.2, 6)
    expect(r.net).toBeCloseTo(r.gross - r.ir, 10)
  })

  it('is empty when there are no contributions', () => {
    expect(investedGain({ contributions: new Map(), months: 12, annualRate: 0.1 })).toEqual({
      contributed: 0,
      gross: 0,
      ir: 0,
      net: 0
    })
  })
})

describe('breakEvenAnnualRate', () => {
  it('finds the rate where net income equals the interest saved', () => {
    const contributions = new Map([[6, 5000], [18, 5000]])
    const interestSaved = 3000
    const rate = breakEvenAnnualRate({ contributions, months: 36, interestSaved })
    const net = investedGain({ contributions, months: 36, annualRate: rate }).net
    expect(net).toBeCloseTo(interestSaved, 2)
  })

  it('returns NaN when even 100% a.a. cannot match the saving', () => {
    expect(breakEvenAnnualRate({ contributions: new Map([[35, 10]]), months: 36, interestSaved: 1e9 })).toBeNaN()
  })
})

describe('compareAmortizeInvest', () => {
  it('uses interest saved from amortizing against the invested gain', () => {
    const base = simulateFinancing({
      property: 300000,
      down: 60000,
      months: 120,
      rate: 0.01,
      mode: 'price',
      balloons: new Map(),
      curveControls: [...curvePresets.linear]
    })
    const withExtra = simulateFinancing({
      property: 300000,
      down: 60000,
      months: 120,
      rate: 0.01,
      mode: 'price',
      balloons: new Map([[12, 20000]]),
      curveControls: [...curvePresets.linear]
    })
    const r = compareAmortizeInvest({
      result: withExtra,
      baseResult: base,
      contributions: new Map([[12, 20000]]),
      months: 120,
      annualRate: 0.1
    })
    expect(r.interestSaved).toBeGreaterThan(0)
    expect(r.invested.contributed).toBe(20000)
    expect(r.breakEvenAnnual).toBeGreaterThan(0)
  })

  it('returns null when either scenario failed', () => {
    expect(compareAmortizeInvest({ result: { error: 'x' }, baseResult: {}, contributions: new Map(), months: 1, annualRate: 0 })).toBeNull()
  })
})
