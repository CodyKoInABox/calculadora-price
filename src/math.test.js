import { describe, expect, it } from 'vitest'
import {
  parseMoney,
  pricePayment,
  clampCurveValue,
  curvePresets,
  extrasToMap,
  simulateFinancing,
  maxRegularPayment,
  solveFromMaxPayment,
  CURVE_MIN,
  CURVE_MAX
} from './math'

/** Walk a classic Price schedule independently of simulateFinancing scaling. */
function classicPriceSchedule(principal, rate, months) {
  const payment = pricePayment(principal, rate, months)
  let balance = principal
  const rows = []
  let totalInterest = 0
  let totalAmort = 0

  for (let m = 1; m <= months; m++) {
    const interest = balance * rate
    let amort = payment - interest
    let pay = payment
    // last installment: wipe residual floating-point dust
    if (m === months) {
      amort = balance
      pay = balance + interest
    }
    balance = Math.max(0, balance - amort)
    totalInterest += interest
    totalAmort += amort
    rows.push({ month: m, payment: pay, interest, amortization: amort, balance })
  }

  return { payment, rows, totalInterest, totalAmort }
}

function runSim(partial) {
  return simulateFinancing({
    balloons: new Map(),
    curveControls: [...curvePresets.linear],
    mode: 'price',
    ...partial
  })
}

describe('parseMoney', () => {
  it('parses pt-BR currency strings', () => {
    expect(parseMoney('300.000,00')).toBe(300000)
    expect(parseMoney('60.000,00')).toBe(60000)
    expect(parseMoney('1.234,56')).toBe(1234.56)
  })
})

describe('pricePayment', () => {
  it('matches closed-form Price for 100k @ 1%/mês × 12', () => {
    // Golden: PV * i * (1+i)^n / ((1+i)^n - 1)
    expect(pricePayment(100_000, 0.01, 12)).toBeCloseTo(8884.878867834166, 6)
  })

  it('matches closed-form Price for 240k @ 1%/mês × 36', () => {
    expect(pricePayment(240_000, 0.01, 36)).toBeCloseTo(7971.4343550842805, 6)
  })

  it('splits principal evenly when rate is 0', () => {
    expect(pricePayment(120_000, 0, 12)).toBe(10_000)
    expect(pricePayment(50_000, 0, 10)).toBe(5_000)
  })
})

describe('clampCurveValue', () => {
  it('clamps and optionally snaps to step', () => {
    expect(clampCurveValue(0, 0.05)).toBe(CURVE_MIN)
    expect(clampCurveValue(9, 0.05)).toBe(CURVE_MAX)
    expect(clampCurveValue(1.02, 0.05)).toBeCloseTo(1.0, 10)
  })
})

describe('simulateFinancing — Price tradicional', () => {
  it('rejects invalid property / down payment', () => {
    expect(runSim({ property: 0, down: 0, months: 12, rate: 0.01 }).error).toBeTruthy()
    expect(runSim({ property: 100_000, down: 100_000, months: 12, rate: 0.01 }).error).toBeTruthy()
    expect(runSim({ property: 100_000, down: 120_000, months: 12, rate: 0.01 }).error).toBeTruthy()
  })

  it('uses financed principal = property − down', () => {
    const r = runSim({ property: 300_000, down: 60_000, months: 36, rate: 0.01 })
    expect(r.error).toBeUndefined()
    expect(r.principal).toBe(240_000)
  })

  it('keeps fixed installment close to classic Price (no balloons)', () => {
    const principal = 240_000
    const rate = 0.01
    const months = 36
    const expected = pricePayment(principal, rate, months)
    const r = runSim({ property: 300_000, down: 60_000, months, rate })

    expect(r.error).toBeUndefined()
    for (const row of r.schedule.slice(0, -1)) {
      expect(row.payment).toBeCloseTo(expected, 2)
    }
    // last row may absorb residual; still near Price
    expect(r.schedule.at(-1).payment).toBeCloseTo(expected, 0)
  })

  it('liquidates balance to ~0', () => {
    const r = runSim({ property: 300_000, down: 60_000, months: 36, rate: 0.01 })
    expect(r.schedule.at(-1).balance).toBeCloseTo(0, 2)
  })

  it('sums amortization (+ balloons) back to principal', () => {
    const r = runSim({ property: 300_000, down: 60_000, months: 36, rate: 0.01 })
    const amortSum = r.schedule.reduce((s, row) => s + row.amortization, 0)
    expect(amortSum).toBeCloseTo(r.principal, 2)
  })

  it('matches interest accounting month by month', () => {
    const r = runSim({ property: 110_000, down: 10_000, months: 24, rate: 0.012 })
    let balance = r.principal
    let interestSum = 0

    for (const row of r.schedule) {
      const expectedInterest = balance * 0.012
      expect(row.interest).toBeCloseTo(expectedInterest, 6)
      interestSum += row.interest
      balance = Math.max(0, balance + row.interest - row.payment - row.balloon)
      expect(row.balance).toBeCloseTo(balance, 6)
    }

    expect(r.totalInterest).toBeCloseTo(interestSum, 6)
  })

  it('aligns totals with an independent classic Price walk (short term)', () => {
    const principal = 100_000
    const rate = 0.01
    const months = 12
    const classic = classicPriceSchedule(principal, rate, months)
    const r = runSim({ property: principal + 20_000, down: 20_000, months, rate })

    expect(r.schedule).toHaveLength(months)
    expect(r.schedule[0].payment).toBeCloseTo(classic.payment, 2)
    expect(r.totalInterest).toBeCloseTo(classic.totalInterest, 1)
    expect(r.schedule.at(-1).balance).toBeCloseTo(0, 2)
  })

  it('handles zero interest', () => {
    const r = runSim({ property: 120_000, down: 0, months: 12, rate: 0 })
    expect(r.error).toBeUndefined()
    expect(r.totalInterest).toBeCloseTo(0, 8)
    for (const row of r.schedule) {
      expect(row.payment).toBeCloseTo(10_000, 6)
      expect(row.interest).toBeCloseTo(0, 8)
    }
    expect(r.schedule.at(-1).balance).toBeCloseTo(0, 6)
  })
})

describe('simulateFinancing — balões', () => {
  it('applies balloon in the chosen month and still zeros balance', () => {
    const balloons = new Map([[6, 20_000]])
    const r = runSim({
      property: 300_000,
      down: 60_000,
      months: 36,
      rate: 0.01,
      balloons
    })

    expect(r.error).toBeUndefined()
    const row6 = r.schedule.find(row => row.month === 6)
    expect(row6.balloon).toBeCloseTo(20_000, 2)
    expect(r.totalBalloon).toBeCloseTo(20_000, 2)
    expect(r.schedule.at(-1).balance).toBeCloseTo(0, 2)
    expect(r.schedule).toHaveLength(36)
    expect(r.effectiveMonths).toBe(36)

    const amortSum = r.schedule.reduce((s, row) => s + row.amortization, 0)
    expect(amortSum).toBeCloseTo(r.principal, 2)
  })

  it('caps balloon so it never exceeds amount due', () => {
    const balloons = new Map([[1, 1_000_000]])
    const r = runSim({
      property: 100_000,
      down: 0,
      months: 12,
      rate: 0.01,
      balloons
    })

    expect(r.schedule[0].balloon).toBeLessThanOrEqual(r.principal * 1.01 + 1e-6)
    expect(r.schedule.at(-1).balance).toBeCloseTo(0, 2)
  })
})

describe('extrasToMap', () => {
  it('expands monthly extras across the horizon', () => {
    const map = extrasToMap(true, [{ recurrence: 'monthly', month: 1, amount: '500,00' }], 12)
    expect(map.size).toBe(12)
    for (let m = 1; m <= 12; m++) expect(map.get(m)).toBe(500)
  })

  it('expands yearly and every-N from start month', () => {
    const yearly = extrasToMap(true, [{ recurrence: 'yearly', month: 12, amount: '10.000,00' }], 36)
    expect([...yearly.keys()].sort((a, b) => a - b)).toEqual([12, 24, 36])
    expect(yearly.get(12)).toBe(10_000)

    const every = extrasToMap(true, [{ recurrence: 'every', month: 1, everyN: 6, amount: '5.000,00' }], 24)
    expect([...every.keys()].sort((a, b) => a - b)).toEqual([1, 7, 13, 19])
  })

  it('sums overlapping once + recurring on the same month', () => {
    const map = extrasToMap(
      true,
      [
        { recurrence: 'once', month: 6, amount: '1.000,00' },
        { recurrence: 'every', month: 6, everyN: 6, amount: '500,00' }
      ],
      12
    )
    expect(map.get(6)).toBe(1_500)
    expect(map.get(12)).toBe(500)
  })
})

describe('simulateFinancing — extraEffect payment vs term', () => {
  const monthlyExtras = extrasToMap(true, [{ recurrence: 'monthly', month: 1, amount: '500,00' }], 36)

  it('Price payment keeps contracted term and lowers installment', () => {
    const baseline = runSim({ property: 300_000, down: 60_000, months: 36, rate: 0.01 })
    const withExtras = runSim({
      property: 300_000,
      down: 60_000,
      months: 36,
      rate: 0.01,
      balloons: monthlyExtras,
      extraEffect: 'payment'
    })

    expect(withExtras.schedule).toHaveLength(36)
    expect(withExtras.effectiveMonths).toBe(36)
    expect(withExtras.schedule[0].payment).toBeLessThan(baseline.schedule[0].payment)
    expect(withExtras.schedule.at(-1).balance).toBeCloseTo(0, 2)
  })

  it('Price term keeps contracted PMT and shortens schedule', () => {
    const baseline = runSim({ property: 300_000, down: 60_000, months: 36, rate: 0.01 })
    const withExtras = runSim({
      property: 300_000,
      down: 60_000,
      months: 36,
      rate: 0.01,
      balloons: monthlyExtras,
      extraEffect: 'term'
    })

    expect(withExtras.months).toBe(36)
    expect(withExtras.effectiveMonths).toBeLessThan(36)
    expect(withExtras.schedule).toHaveLength(withExtras.effectiveMonths)
    expect(withExtras.schedule[0].payment).toBeCloseTo(baseline.schedule[0].payment, 2)
    expect(withExtras.schedule.at(-1).balance).toBeCloseTo(0, 2)
  })

  it('SAC payment keeps contracted term with lower amort', () => {
    const baseline = runSim({ property: 300_000, down: 60_000, months: 36, rate: 0.01, mode: 'sac' })
    const withExtras = runSim({
      property: 300_000,
      down: 60_000,
      months: 36,
      rate: 0.01,
      mode: 'sac',
      balloons: monthlyExtras,
      extraEffect: 'payment'
    })

    expect(withExtras.schedule).toHaveLength(36)
    expect(withExtras.schedule[0].payment).toBeLessThan(baseline.schedule[0].payment)
    expect(withExtras.schedule.at(-1).balance).toBeCloseTo(0, 2)
  })

  it('SAC term truncates when extras pay off early', () => {
    const withExtras = runSim({
      property: 300_000,
      down: 60_000,
      months: 36,
      rate: 0.01,
      mode: 'sac',
      balloons: monthlyExtras,
      extraEffect: 'term'
    })

    expect(withExtras.effectiveMonths).toBeLessThan(36)
    expect(withExtras.schedule).toHaveLength(withExtras.effectiveMonths)
    expect(withExtras.schedule.at(-1).balance).toBeCloseTo(0, 2)
  })
})

describe('simulateFinancing — SAC', () => {
  it('splits principal evenly when rate is 0', () => {
    const r = runSim({ property: 120_000, down: 0, months: 12, rate: 0, mode: 'sac' })
    expect(r.error).toBeUndefined()
    expect(r.totalInterest).toBeCloseTo(0, 8)
    for (const row of r.schedule) {
      expect(row.payment).toBeCloseTo(10_000, 6)
      expect(row.interest).toBeCloseTo(0, 8)
      expect(row.amortization).toBeCloseTo(10_000, 6)
    }
    expect(r.schedule.at(-1).balance).toBeCloseTo(0, 6)
  })

  it('keeps constant amortization and declining payment (100k @ 1% × 12)', () => {
    const principal = 100_000
    const rate = 0.01
    const months = 12
    const amort = principal / months
    const r = runSim({ property: principal, down: 0, months, rate, mode: 'sac' })

    expect(r.error).toBeUndefined()
    expect(r.schedule[0].payment).toBeCloseTo(amort + principal * rate, 6)
    expect(r.schedule[0].amortization).toBeCloseTo(amort, 6)

    for (let i = 1; i < r.schedule.length; i++) {
      expect(r.schedule[i].payment).toBeLessThan(r.schedule[i - 1].payment)
      if (i < months - 1) {
        expect(r.schedule[i].amortization).toBeCloseTo(amort, 4)
      }
    }

    const amortSum = r.schedule.reduce((s, row) => s + row.amortization, 0)
    expect(amortSum).toBeCloseTo(principal, 2)
    expect(r.schedule.at(-1).balance).toBeCloseTo(0, 2)
    expect(r.schedule.at(-1).payment).toBeLessThan(r.schedule[0].payment)
  })

  it('pays less total interest than Price for the same inputs', () => {
    const shared = { property: 300_000, down: 60_000, months: 36, rate: 0.01 }
    const price = runSim({ ...shared, mode: 'price' })
    const sac = runSim({ ...shared, mode: 'sac' })

    expect(sac.totalInterest).toBeLessThan(price.totalInterest)
    expect(sac.schedule[0].payment).toBeGreaterThan(price.schedule[0].payment)
    expect(sac.schedule.at(-1).payment).toBeLessThan(price.schedule.at(-1).payment)
  })

  it('applies balloon in the chosen month and still zeros balance', () => {
    const balloons = new Map([[6, 20_000]])
    const r = runSim({
      property: 300_000,
      down: 60_000,
      months: 36,
      rate: 0.01,
      mode: 'sac',
      balloons
    })

    expect(r.error).toBeUndefined()
    const row6 = r.schedule.find(row => row.month === 6)
    expect(row6.balloon).toBeCloseTo(20_000, 2)
    expect(r.totalBalloon).toBeCloseTo(20_000, 2)
    expect(r.schedule.at(-1).balance).toBeCloseTo(0, 2)

    const amortSum = r.schedule.reduce((s, row) => s + row.amortization, 0)
    expect(amortSum).toBeCloseTo(r.principal, 2)
  })
})

describe('simulateFinancing — curva crescente', () => {
  it('zeros balance for each curve preset', () => {
    for (const [name, controls] of Object.entries(curvePresets)) {
      const r = runSim({
        property: 300_000,
        down: 60_000,
        months: 36,
        rate: 0.01,
        mode: 'growing',
        curveControls: [...controls]
      })

      expect(r.error, name).toBeUndefined()
      expect(r.schedule.at(-1).balance, name).toBeCloseTo(0, 2)

      const amortSum = r.schedule.reduce((s, row) => s + row.amortization, 0)
      expect(amortSum, name).toBeCloseTo(r.principal, 2)
    }
  })

  it('produces rising installments on linear preset (no balloons)', () => {
    const r = runSim({
      property: 300_000,
      down: 60_000,
      months: 36,
      rate: 0.01,
      mode: 'growing',
      curveControls: [...curvePresets.linear]
    })

    const first = r.schedule[0].payment
    const last = r.schedule.at(-1).payment
    expect(last).toBeGreaterThan(first)
  })
})

describe('solveFromMaxPayment', () => {
  const base = {
    months: 36,
    rate: 0.01,
    balloons: new Map(),
    curveControls: [...curvePresets.linear],
    extraEffect: 'payment'
  }

  it('round-trips Price principal from max payment', () => {
    const forward = runSim({
      property: 300_000,
      down: 60_000,
      months: 36,
      rate: 0.01,
      mode: 'price'
    })
    const target = maxRegularPayment(forward.schedule)
    const inv = solveFromMaxPayment({
      ...base,
      mode: 'price',
      targetPayment: target,
      solveFor: 'principal',
      down: 60_000,
      property: 300_000
    })

    expect(inv.error).toBeUndefined()
    expect(inv.principal).toBeCloseTo(forward.principal, 0)
    expect(maxRegularPayment(inv.schedule)).toBeLessThanOrEqual(target + 0.02)
  })

  it('round-trips Price down from max payment', () => {
    const forward = runSim({
      property: 300_000,
      down: 60_000,
      months: 36,
      rate: 0.01,
      mode: 'price'
    })
    const target = maxRegularPayment(forward.schedule)
    const inv = solveFromMaxPayment({
      ...base,
      mode: 'price',
      targetPayment: target,
      solveFor: 'down',
      property: 300_000,
      down: 0
    })

    expect(inv.error).toBeUndefined()
    expect(inv.down).toBeCloseTo(forward.down, 0)
    expect(inv.principal).toBeCloseTo(forward.principal, 0)
    expect(maxRegularPayment(inv.schedule)).toBeLessThanOrEqual(target + 0.02)
  })

  it('keeps SAC max payment ≤ target', () => {
    const forward = runSim({
      property: 300_000,
      down: 60_000,
      months: 36,
      rate: 0.01,
      mode: 'sac'
    })
    const target = maxRegularPayment(forward.schedule)
    const inv = solveFromMaxPayment({
      ...base,
      mode: 'sac',
      targetPayment: target,
      solveFor: 'principal',
      down: 60_000,
      property: 300_000
    })

    expect(inv.error).toBeUndefined()
    expect(maxRegularPayment(inv.schedule)).toBeLessThanOrEqual(target + 0.05)
    expect(inv.principal).toBeCloseTo(forward.principal, 0)
  })

  it('keeps growing max payment ≤ target', () => {
    const forward = runSim({
      property: 300_000,
      down: 60_000,
      months: 36,
      rate: 0.01,
      mode: 'growing',
      curveControls: [...curvePresets.linear]
    })
    const target = maxRegularPayment(forward.schedule)
    const inv = solveFromMaxPayment({
      ...base,
      mode: 'growing',
      targetPayment: target,
      solveFor: 'principal',
      down: 60_000,
      property: 300_000,
      curveControls: [...curvePresets.linear]
    })

    expect(inv.error).toBeUndefined()
    expect(maxRegularPayment(inv.schedule)).toBeLessThanOrEqual(target + 0.05)
    expect(inv.principal).toBeCloseTo(forward.principal, 0)
  })

  it('converges with extras in payment effect', () => {
    const balloons = new Map([[12, 20_000], [24, 20_000]])
    const forward = runSim({
      property: 300_000,
      down: 60_000,
      months: 36,
      rate: 0.01,
      mode: 'price',
      balloons,
      extraEffect: 'payment'
    })
    const target = maxRegularPayment(forward.schedule)
    const inv = solveFromMaxPayment({
      ...base,
      mode: 'price',
      balloons,
      extraEffect: 'payment',
      targetPayment: target,
      solveFor: 'down',
      property: 300_000,
      down: 0
    })

    expect(inv.error).toBeUndefined()
    expect(inv.down).toBeCloseTo(forward.down, 0)
    expect(maxRegularPayment(inv.schedule)).toBeLessThanOrEqual(target + 0.05)
  })

  it('rejects non-positive target payment', () => {
    const inv = solveFromMaxPayment({
      ...base,
      mode: 'price',
      targetPayment: 0,
      solveFor: 'principal',
      down: 60_000,
      property: 300_000
    })
    expect(inv.error).toBeTruthy()
  })
})
