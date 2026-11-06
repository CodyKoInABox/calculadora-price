import { describe, expect, it } from 'vitest'
import { annualToMonthly, curvePresets, simulateFinancing, monthlyToAnnual } from './math'
import { computeCost, DEFAULT_COSTS, monthlyIrr } from './costs'

const price = ({ property = 300000, down = 60000, months = 120, rate = 0.01 } = {}) =>
  simulateFinancing({
    property,
    down,
    months,
    rate,
    mode: 'price',
    balloons: new Map(),
    curveControls: [...curvePresets.linear]
  })

describe('monthlyIrr', () => {
  it('recovers the rate used to build an annuity', () => {
    const rate = 0.012
    const n = 60
    const pmt = (1000 * rate) / (1 - (1 + rate) ** -n)
    const payments = Array.from({ length: n }, () => pmt)
    expect(monthlyIrr(1000, payments)).toBeCloseTo(rate, 9)
  })

  it('returns NaN when payments can never repay the principal', () => {
    expect(monthlyIrr(1000, [1, 1, 1])).toBeNaN()
  })
})

describe('computeCost', () => {
  it('matches the contract rate when there are no fees or insurance', () => {
    const result = price()
    const cost = computeCost({ principal: result.principal, property: result.property, schedule: result.schedule })

    expect(cost.cetMonthly).toBeCloseTo(0.01, 4)
    expect(cost.totalInsurance).toBe(0)
    expect(cost.totalCost).toBe(0)
  })

  it('raises CET above the contract rate when upfront fees are charged', () => {
    const result = price()
    const cost = computeCost({
      principal: result.principal,
      property: result.property,
      schedule: result.schedule,
      costs: { ...DEFAULT_COSTS, upfront: 3000 }
    })

    expect(cost.cetMonthly).toBeGreaterThan(0.01)
    expect(cost.upfront).toBe(3000)
    expect(cost.totalCost).toBe(3000)
  })

  it('charges MIP on the outstanding balance and DFI on the property value', () => {
    const result = price({ months: 12 })
    const cost = computeCost({
      principal: result.principal,
      property: result.property,
      schedule: result.schedule,
      costs: { ...DEFAULT_COSTS, mipMonthly: 0.03, dfiAnnual: 0.06 }
    })

    expect(cost.rows[0].mip).toBeCloseTo(result.principal * 0.0003, 2)
    expect(cost.rows[0].dfi).toBeCloseTo(300000 * 0.0006 / 12, 2)
    expect(cost.rows[11].mip).toBeLessThan(cost.rows[0].mip)
    expect(cost.totalInsurance).toBeCloseTo(cost.totalMip + cost.totalDfi, 2)
  })

  it('annualizes the monthly CET with effective compounding', () => {
    const result = price()
    const cost = computeCost({
      principal: result.principal,
      property: result.property,
      schedule: result.schedule,
      costs: { ...DEFAULT_COSTS, monthlyAdmin: 25 }
    })

    expect(cost.cetAnnual).toBeCloseTo(monthlyToAnnual(cost.cetMonthly), 10)
    expect(annualToMonthly(cost.cetAnnual)).toBeCloseTo(cost.cetMonthly, 10)
  })
})
