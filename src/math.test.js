import { describe, expect, it } from 'vitest'
import {
  parseMoney,
  pricePayment,
  annualToMonthly,
  monthlyToAnnual,
  clampCurveValue,
  curveWeightAt,
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

function assertCentLedger(result) {
  expect(result.error).toBeUndefined()

  let previousBalance = Math.round(result.principal * 100)
  let interestTotal = 0
  let regularTotal = 0
  let balloonTotal = 0
  let amortizationTotal = 0

  result.schedule.forEach((row, index) => {
    expect(row.month).toBe(index + 1)

    const cents = {}
    for (const key of ['payment', 'interest', 'amortization', 'balloon', 'balance']) {
      expect(Number.isFinite(row[key])).toBe(true)
      cents[key] = Math.round(row[key] * 100)
      expect(row[key]).toBe(cents[key] / 100)
    }

    expect(previousBalance + cents.interest).toBe(
      cents.payment + cents.balloon + cents.balance
    )
    expect(cents.amortization).toBe(
      cents.payment + cents.balloon - cents.interest
    )
    expect(cents.balance).toBeGreaterThanOrEqual(0)

    previousBalance = cents.balance
    interestTotal += cents.interest
    regularTotal += cents.payment
    balloonTotal += cents.balloon
    amortizationTotal += cents.amortization
  })

  expect(previousBalance).toBe(0)
  expect(amortizationTotal).toBe(Math.round(result.principal * 100))
  expect(result.totalInterest).toBe(interestTotal / 100)
  expect(result.totalRegular).toBe(regularTotal / 100)
  expect(result.totalBalloon).toBe(balloonTotal / 100)
  expect(regularTotal + balloonTotal).toBe(
    Math.round(result.principal * 100) + interestTotal
  )
}

describe('annualToMonthly / monthlyToAnnual', () => {
  it('converts 1% a.m. to ~12.6825% a.a.', () => {
    expect(monthlyToAnnual(0.01)).toBeCloseTo(0.1268250301, 8)
  })

  it('converts ~12.6825% a.a. back to 1% a.m.', () => {
    expect(annualToMonthly(0.1268250301319697)).toBeCloseTo(0.01, 10)
  })

  it('round-trips a.a. → a.m. → a.a.', () => {
    const aa = 0.12
    expect(monthlyToAnnual(annualToMonthly(aa))).toBeCloseTo(aa, 12)
  })

  it('keeps 0 as 0', () => {
    expect(annualToMonthly(0)).toBe(0)
    expect(monthlyToAnnual(0)).toBe(0)
  })

  it('is not the naive /12', () => {
    expect(annualToMonthly(0.12)).not.toBeCloseTo(0.01, 3)
    expect(annualToMonthly(0.12)).toBeCloseTo(0.0094887929, 8)
  })
})

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
      const expectedInterest = Math.round(balance * 0.012 * 100) / 100
      expect(row.interest).toBe(expectedInterest)
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

  it('Price payment recalculates only after the extra occurs', () => {
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
    expect(withExtras.schedule[0].payment).toBe(baseline.schedule[0].payment)
    expect(withExtras.schedule[1].payment).toBeLessThan(baseline.schedule[1].payment)
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

  it('SAC payment recalculates amortization only after the extra occurs', () => {
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
    expect(withExtras.schedule[0].payment).toBe(baseline.schedule[0].payment)
    expect(
      withExtras.schedule[1].payment - withExtras.schedule[1].interest
    ).toBeLessThan(baseline.schedule[1].amortization)
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
    expect(r.schedule[0].payment).toBe(9_333.33)
    expect(r.schedule[0].amortization).toBe(8_333.33)

    for (let i = 1; i < r.schedule.length; i++) {
      expect(r.schedule[i].payment).toBeLessThan(r.schedule[i - 1].payment)
      if (i < months - 1) {
        expect(r.schedule[i].amortization).toBe(8_333.33)
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
    expect(inv.principal).toBeGreaterThanOrEqual(forward.principal)
    expect(maxRegularPayment(inv.schedule)).toBeLessThanOrEqual(target)
    const oneCentMore = runSim({
      property: inv.down + inv.principal + 0.01,
      down: inv.down,
      months: 36,
      rate: 0.01,
      mode: 'price'
    })
    expect(maxRegularPayment(oneCentMore.schedule)).toBeGreaterThan(target)
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
    expect(maxRegularPayment(inv.schedule)).toBeLessThanOrEqual(target)
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
    expect(maxRegularPayment(inv.schedule)).toBeLessThanOrEqual(target)
    expect(inv.principal).toBeGreaterThanOrEqual(forward.principal)
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
    expect(maxRegularPayment(inv.schedule)).toBeLessThanOrEqual(target)
    expect(inv.principal).toBeGreaterThanOrEqual(forward.principal)
    const oneCentMore = runSim({
      property: inv.down + inv.principal + 0.01,
      down: inv.down,
      months: 36,
      rate: 0.01,
      mode: 'growing',
      curveControls: [...curvePresets.linear]
    })
    expect(maxRegularPayment(oneCentMore.schedule)).toBeGreaterThan(target)
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
    expect(maxRegularPayment(inv.schedule)).toBeLessThanOrEqual(target)
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

describe('validated cent ledger contract', () => {
  it('uses a stable formula at zero and near-zero rates', () => {
    expect(pricePayment(120_000, 0, 12)).toBe(10_000)
    expect(pricePayment(120_000, 1e-12, 12)).toBeCloseTo(10_000, 5)
    expect(Number.isFinite(pricePayment(120_000, 1e-12, 600))).toBe(true)
  })

  it('rejects invalid term, rate, curve and extra map values', () => {
    expect(runSim({ property: 100_000, down: 0, months: 12.5, rate: 0.01 }).error).toBeTruthy()
    expect(runSim({ property: 100_000, down: 0, months: 601, rate: 0.01 }).error).toBeTruthy()
    expect(runSim({ property: 100_000, down: 0, months: 12, rate: Infinity }).error).toBeTruthy()
    expect(runSim({
      property: 100_000,
      down: 0,
      months: 12,
      rate: 0.01,
      curveControls: [1, 1, 1, 1, 1]
    }).error).toBeTruthy()
    expect(runSim({
      property: 100_000,
      down: 0,
      months: 12,
      rate: 0.01,
      balloons: new Map([[13, 500]])
    }).error).toBeTruthy()
  })

  it('rejects non-finite, negative and out-of-range numeric inputs', () => {
    expect(runSim({ property: Number.NaN, down: 0, months: 12, rate: 0.01 }).error).toBeTruthy()
    expect(runSim({ property: 100_000, down: Infinity, months: 12, rate: 0.01 }).error).toBeTruthy()
    expect(runSim({ property: 100_000, down: -0.01, months: 12, rate: 0.01 }).error).toBeTruthy()
    expect(runSim({ property: 100_000, down: 0, months: 12, rate: -0.01 }).error).toBeTruthy()
    expect(runSim({
      property: 100_000,
      down: 0,
      months: 12,
      rate: 0.01,
      curveControls: [CURVE_MIN - 0.01, 1, 1, 1, 1, 1]
    }).error).toBeTruthy()
    expect(runSim({
      property: 100_000,
      down: 0,
      months: 12,
      rate: 0.01,
      balloons: new Map([[1, Infinity]])
    }).error).toBeTruthy()
    expect(runSim({
      property: 100_000,
      down: 0,
      months: 12,
      rate: 0.01,
      balloons: new Map([[1.5, 100]])
    }).error).toBeTruthy()
  })

  it('rejects fractional and out-of-horizon extra recurrence data', () => {
    expect(extrasToMap(true, [{ month: 1.5, amount: 100 }], 12).error).toBeTruthy()
    expect(extrasToMap(true, [{ month: 13, amount: 100 }], 12).error).toBeTruthy()
    expect(extrasToMap(
      true,
      [{ recurrence: 'every', month: 1, everyN: 2.5, amount: 100 }],
      12
    ).error).toBeTruthy()
    expect(extrasToMap(true, [{ month: 1, amount: Infinity }], 12).error).toBeTruthy()
    expect(extrasToMap(true, [{ month: 1, amount: -0.01 }], 12).error).toBeTruthy()
  })

  it('keeps every monetary row on cents and closes the accounting identity', () => {
    const result = runSim({
      property: 300_000.009,
      down: 60_000.004,
      months: 36,
      rate: 0.0117,
      balloons: new Map([[7, 12_345.678], [18, 8_000.001]])
    })

    expect(result.error).toBeUndefined()
    let previousBalance = Math.round(result.principal * 100)
    let interestTotal = 0
    let regularTotal = 0
    let balloonTotal = 0

    for (const row of result.schedule) {
      const payment = Math.round(row.payment * 100)
      const interest = Math.round(row.interest * 100)
      const amortization = Math.round(row.amortization * 100)
      const balloon = Math.round(row.balloon * 100)
      const balance = Math.round(row.balance * 100)

      expect(row.payment).toBe(payment / 100)
      expect(row.interest).toBe(interest / 100)
      expect(row.amortization).toBe(amortization / 100)
      expect(row.balloon).toBe(balloon / 100)
      expect(row.balance).toBe(balance / 100)
      expect(previousBalance + interest).toBe(payment + balloon + balance)
      expect(amortization).toBe(payment + balloon - interest)

      previousBalance = balance
      interestTotal += interest
      regularTotal += payment
      balloonTotal += balloon
    }

    expect(previousBalance).toBe(0)
    expect(result.totalInterest).toBe(interestTotal / 100)
    expect(result.totalRegular).toBe(regularTotal / 100)
    expect(result.totalBalloon).toBe(balloonTotal / 100)
  })
})

describe('bounded curve and post-extra recasting', () => {
  it('never overshoots adjacent curve controls', () => {
    const controls = [0.25, 0.25, 0.25, 2.5, 2.5, 2.5]
    for (let index = 0; index < 5; index++) {
      const low = Math.min(controls[index], controls[index + 1])
      const high = Math.max(controls[index], controls[index + 1])
      for (let step = 0; step <= 20; step++) {
        const progress = (index + step / 20) / 5
        const weight = curveWeightAt(progress, controls)
        expect(weight).toBeGreaterThanOrEqual(low)
        expect(weight).toBeLessThanOrEqual(high)
        expect(weight).toBeGreaterThanOrEqual(CURVE_MIN)
        expect(weight).toBeLessThanOrEqual(CURVE_MAX)
      }
    }
  })

  it('floors the custom curve at monthly interest and exposes the adjustment', () => {
    const result = runSim({
      property: 300_000,
      down: 60_000,
      months: 36,
      rate: 0.01,
      mode: 'growing',
      curveControls: [0.25, 0.25, 0.25, 2.5, 2.5, 2.5]
    })

    expect(result.error).toBeUndefined()
    expect(result.curveFloorApplied).toBe(true)
    expect(result.schedule.some(row => row.interestFloorApplied)).toBe(true)
    expect(result.schedule.every(row => row.payment >= row.interest)).toBe(true)
    expect(result.schedule.reduce((sum, row) => sum + row.amortization, 0)).toBe(result.principal)
    expect(result.schedule.at(-1).balance).toBe(0)
  })

  it.each(['price', 'sac', 'growing'])(
    '%s keeps its original contract through the extra month and recasts afterward',
    mode => {
      const shared = {
        property: 300_000,
        down: 60_000,
        months: 36,
        rate: 0.01,
        mode
      }
      const baseline = runSim(shared)
      const withExtra = runSim({
        ...shared,
        balloons: new Map([[6, 20_000]]),
        extraEffect: 'payment'
      })

      expect(withExtra.error).toBeUndefined()
      for (let month = 0; month < 6; month++) {
        expect(withExtra.schedule[month].payment).toBe(baseline.schedule[month].payment)
      }
      expect(withExtra.schedule[6].payment).toBeLessThan(baseline.schedule[6].payment)
      expect(withExtra.schedule.at(-1).balance).toBe(0)
    }
  )

  it('removes zero months after an extra liquidates the balance', () => {
    const result = runSim({
      property: 100_000,
      down: 0,
      months: 36,
      rate: 0.01,
      balloons: new Map([[1, 1_000_000]]),
      extraEffect: 'payment'
    })

    expect(result.schedule).toHaveLength(1)
    expect(result.effectiveMonths).toBe(1)
    expect(result.schedule[0].balance).toBe(0)
  })
})

describe('exact cent regressions', () => {
  it('matches the golden PRICE ledger for 100k at 1% over 12 months', () => {
    const result = runSim({
      property: 100_000,
      down: 0,
      months: 12,
      rate: 0.01,
      mode: 'price'
    })

    expect(result.schedule[0]).toEqual({
      month: 1,
      payment: 8_884.88,
      interest: 1_000,
      amortization: 7_884.88,
      balloon: 0,
      balance: 92_115.12
    })
    expect(result.schedule[1]).toEqual({
      month: 2,
      payment: 8_884.88,
      interest: 921.15,
      amortization: 7_963.73,
      balloon: 0,
      balance: 84_151.39
    })
    expect(result.schedule.at(-1)).toEqual({
      month: 12,
      payment: 8_884.85,
      interest: 87.97,
      amortization: 8_796.88,
      balloon: 0,
      balance: 0
    })
    expect(result.totalInterest).toBe(6_618.53)
    expect(result.totalRegular).toBe(106_618.53)
    assertCentLedger(result)
  })

  it('matches the golden SAC ledger for 100k at 1% over 12 months', () => {
    const result = runSim({
      property: 100_000,
      down: 0,
      months: 12,
      rate: 0.01,
      mode: 'sac'
    })

    expect(result.schedule[0]).toEqual({
      month: 1,
      payment: 9_333.33,
      interest: 1_000,
      amortization: 8_333.33,
      balloon: 0,
      balance: 91_666.67
    })
    expect(result.schedule[1]).toEqual({
      month: 2,
      payment: 9_250,
      interest: 916.67,
      amortization: 8_333.33,
      balloon: 0,
      balance: 83_333.34
    })
    expect(result.schedule.at(-1)).toEqual({
      month: 12,
      payment: 8_416.7,
      interest: 83.33,
      amortization: 8_333.37,
      balloon: 0,
      balance: 0
    })
    expect(result.totalInterest).toBe(6_500)
    expect(result.totalRegular).toBe(106_500)
    assertCentLedger(result)
  })

  it('keeps zero and near-zero rates on the same exact cent ledger', () => {
    const zero = runSim({
      property: 120_000,
      down: 0,
      months: 12,
      rate: 0,
      mode: 'price'
    })
    const nearZero = runSim({
      property: 120_000,
      down: 0,
      months: 12,
      rate: 1e-12,
      mode: 'price'
    })

    expect(nearZero.schedule).toEqual(zero.schedule)
    expect(nearZero.totalInterest).toBe(0)
    assertCentLedger(nearZero)
  })

  it('matches the post-extra PRICE recast ledger exactly', () => {
    const result = runSim({
      property: 100_000,
      down: 0,
      months: 12,
      rate: 0.01,
      mode: 'price',
      balloons: new Map([[6, 10_000]]),
      extraEffect: 'payment'
    })

    expect(result.schedule[5]).toEqual({
      month: 6,
      payment: 8_884.88,
      interest: 597.79,
      amortization: 18_287.09,
      balloon: 10_000,
      balance: 41_492.09
    })
    expect(result.schedule[6].payment).toBe(7_159.39)
    expect(result.schedule.at(-1).payment).toBe(7_159.42)
    expect(result.totalInterest).toBe(6_265.65)
    expect(result.totalRegular).toBe(96_265.65)
    expect(result.totalBalloon).toBe(10_000)
    assertCentLedger(result)
  })

  it('finds the exact maximum PRICE principal in cents', () => {
    const inverse = solveFromMaxPayment({
      targetPayment: 8_884.88,
      solveFor: 'principal',
      property: 100_000,
      down: 0,
      months: 12,
      rate: 0.01,
      mode: 'price',
      balloons: new Map(),
      curveControls: [...curvePresets.linear]
    })

    expect(inverse.principal).toBe(100_000.02)
    expect(inverse.maxPayment).toBe(8_884.88)
    assertCentLedger(inverse)

    const oneCentMore = runSim({
      property: 100_000.03,
      down: 0,
      months: 12,
      rate: 0.01,
      mode: 'price'
    })
    expect(maxRegularPayment(oneCentMore.schedule)).toBeGreaterThan(8_884.88)
  })
})

describe('deterministic invariant matrix', () => {
  const cases = ['price', 'sac', 'growing'].flatMap(mode =>
    [0, 1e-12, 0.0117].flatMap(rate =>
      ['payment', 'term'].map(extraEffect => ({
        mode,
        rate,
        extraEffect
      }))
    )
  )

  it.each(cases)(
    '$mode at $rate with extraEffect=$extraEffect closes the cent ledger',
    ({ mode, rate, extraEffect }) => {
      const result = runSim({
        property: 300_000.009,
        down: 60_000.004,
        months: 36,
        rate,
        mode,
        extraEffect,
        balloons: new Map([[7, 12_345.678], [18, 8_000.001]]),
        curveControls: mode === 'growing'
          ? [0.25, 0.25, 0.25, 2.5, 2.5, 2.5]
          : [...curvePresets.linear]
      })

      assertCentLedger(result)
      if (mode === 'growing') {
        expect(result.schedule.every(row => row.payment >= row.interest)).toBe(true)
      }
    }
  )
})
