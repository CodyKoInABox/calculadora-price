import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { curvePresets, simulateFinancing } from './math'
import { parseTrInput } from './sacre'

const RUNS = 80

// Inputs generated in whole reais and basis points so failures are easy to read.
const property = fc.integer({ min: 20_000, max: 2_000_000 })
const downPct = fc.integer({ min: 0, max: 90 })
const months = fc.integer({ min: 1, max: 360 })
const monthlyRateBp = fc.integer({ min: 0, max: 300 })
const mode = fc.constantFrom('price', 'sac')

function build({ p, dp, n, bp, m }) {
  const down = Math.floor((p * dp) / 100)
  return {
    property: p,
    down,
    months: n,
    rate: bp / 10_000,
    mode: m,
    balloons: new Map(),
    curveControls: [...curvePresets.linear],
    extraEffect: 'payment'
  }
}

const loanArb = fc.record({ p: property, dp: downPct, n: months, bp: monthlyRateBp, m: mode })

describe('engine invariants (property-based)', () => {
  it('every Price and SAC loan liquidates to exactly zero', () => {
    fc.assert(
      fc.property(loanArb, input => {
        const r = simulateFinancing(build(input))
        expect(r.error).toBeUndefined()
        expect(r.schedule.at(-1).balance).toBe(0)
      }),
      { numRuns: RUNS }
    )
  })

  it('amortization over the whole term adds up to the financed principal', () => {
    fc.assert(
      fc.property(loanArb, input => {
        const r = simulateFinancing(build(input))
        const amortized = r.schedule.reduce((sum, row) => sum + row.amortization, 0)
        expect(amortized).toBeCloseTo(r.principal, 2)
      }),
      { numRuns: RUNS }
    )
  })

  it('balance never goes negative and never grows without a correction', () => {
    fc.assert(
      fc.property(loanArb, input => {
        const r = simulateFinancing(build(input))
        let previous = r.principal
        for (const row of r.schedule) {
          expect(row.balance).toBeGreaterThanOrEqual(-0.005)
          expect(row.balance).toBeLessThanOrEqual(previous + 0.005)
          previous = row.balance
        }
      }),
      { numRuns: RUNS }
    )
  })

  it('SAC amortization is flat until the last month', () => {
    fc.assert(
      fc.property(loanArb.map(x => ({ ...x, m: 'sac' })), input => {
        const r = simulateFinancing(build(input))
        const flat = r.schedule.slice(0, -1)
        for (const row of flat) {
          expect(Math.abs(row.amortization - flat[0].amortization)).toBeLessThanOrEqual(0.02)
        }
      }),
      { numRuns: RUNS }
    )
  })

  it('Price installment is flat until the last month', () => {
    fc.assert(
      fc.property(loanArb.map(x => ({ ...x, m: 'price' })), input => {
        const r = simulateFinancing(build(input))
        const flat = r.schedule.slice(0, -1)
        for (const row of flat) {
          expect(Math.abs(row.payment - flat[0].payment)).toBeLessThanOrEqual(0.02)
        }
      }),
      { numRuns: RUNS }
    )
  })

  it('SACRE keeps the ledger identity every month: previous + correction − amortization = balance', () => {
    const sacreArb = fc.record({
      p: property,
      dp: downPct,
      n: months,
      bp: monthlyRateBp,
      trBp: fc.integer({ min: 0, max: 100 })
    })
    fc.assert(
      fc.property(sacreArb, ({ p, dp, n, bp, trBp }) => {
        const base = build({ p, dp, n, bp, m: 'price' })
        const r = simulateFinancing({ ...base, mode: 'sacre', correctionRate: trBp / 10_000 })
        expect(r.error).toBeUndefined()
        let previous = r.principal
        for (const row of r.schedule) {
          expect(previous + (row.correction || 0) - row.amortization).toBeCloseTo(row.balance, 1)
          previous = row.balance
        }
        expect(r.schedule.at(-1).balance).toBe(0)
      }),
      { numRuns: RUNS }
    )
  })

  it('a balloon never produces a longer term and never leaves a balance behind', () => {
    const balloonArb = fc.record({
      loan: loanArb.map(x => ({ ...x, m: 'price' })),
      month: fc.integer({ min: 1, max: 360 }),
      amount: fc.integer({ min: 0, max: 500_000 })
    })
    fc.assert(
      fc.property(balloonArb, ({ loan, month, amount }) => {
        const input = build(loan)
        const m = Math.min(month, input.months)
        const r = simulateFinancing({ ...input, balloons: new Map([[m, amount]]), extraEffect: 'term' })
        expect(r.error).toBeUndefined()
        expect(r.effectiveMonths).toBeLessThanOrEqual(input.months)
        expect(r.schedule.at(-1).balance).toBe(0)
      }),
      { numRuns: RUNS }
    )
  })

  it('TR parsing is monotone and never negative', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), fc.integer({ min: 0, max: 10_000 }), (a, b) => {
        const lo = Math.min(a, b)
        const hi = Math.max(a, b)
        expect(parseTrInput(String(lo / 100))).toBeLessThanOrEqual(parseTrInput(String(hi / 100)))
        expect(parseTrInput(String(lo / 100))).toBeGreaterThanOrEqual(0)
      }),
      { numRuns: RUNS }
    )
  })
})
