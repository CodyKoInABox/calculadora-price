import { describe, expect, it } from 'vitest'
import { calculateCollection } from './collection'

// Hand case C: 1000 at 21% a.m., SAC, 4 installments of 250.00 amortization. First due 2026-02-10,
// contract start 2026-01-10.
//   1: interest 210.00, payment 460.00, balance 750.00
//   2: interest 157.50, payment 407.50, balance 500.00
//   3: interest 105.00, payment 355.00, balance 250.00
//   4: interest  52.50, payment 302.50, balance 0
// Total due 1525.00.
//
// Calculation on 2026-04-25 (installment 4 is the only one still to fall due).
//   Period 4 runs 2026-04-10 to 2026-05-10 (30 days), 15 elapsed, so f = 0.5.
//   PV of installment 4 = 302.50 / 1.21^0.5 = 302.50 / 1.1 = 275.00.
//   Future interest abated = 302.50 - 275.00 = 27.50.
//
// Overdue, unpaid: 1 (due 2026-02-10, 74 days), 2 (due 2026-03-10, 46 days), 3 (due 2026-04-10, 15 days).
// Fine 2% on 1222.50 = 24.45. Mora 1% a.m. pro-rata by days/30:
//   1: 460.00 x 1% x 74/30 = 11.35; 2: 407.50 x 1% x 46/30 = 6.25; 3: 355.00 x 1% x 15/30 = 1.78 (177.5 rounded up).
//   Mora total 19.38. Encargos 43.83.
//
// Demand = saldo 1525.00 - abated 27.50 + encargos 43.83 = 1541.33.
const HAND_C = {
  principal: 1000,
  rate: 0.21,
  months: 4,
  system: 'sac',
  firstDueIso: '2026-02-10',
  calcDateIso: '2026-04-25',
  noticeDateIso: '2026-04-10',
  overdue: [
    { month: 1, paid: false },
    { month: 2, paid: false },
    { month: 3, paid: false }
  ],
  finePct: 2,
  moraMonthlyPct: 1
}

describe('calculateCollection — vencimento antecipado (caso à mão)', () => {
  it('computes balance, abated future interest, charges and total due', () => {
    const r = calculateCollection(HAND_C)
    expect(r.error).toBeUndefined()
    expect(r.balance).toBe(1525)
    expect(r.future).toEqual({
      installments: 1,
      nominal: 302.5,
      presentValue: 275,
      firstDueIso: '2026-05-10',
      lastDueIso: '2026-05-10'
    })
    expect(r.abated).toBe(27.5)
    expect(r.charges).toEqual({ fine: 24.45, mora: 19.38, total: 43.83 })
    expect(r.demand).toBe(1541.33)
  })

  it('lists each unpaid installment with its days late and mora', () => {
    const r = calculateCollection(HAND_C)
    expect(r.unpaid).toEqual([
      { month: 1, dueIso: '2026-02-10', nominal: 460, daysLate: 74, mora: 11.35 },
      { month: 2, dueIso: '2026-03-10', nominal: 407.5, daysLate: 46, mora: 6.25 },
      { month: 3, dueIso: '2026-04-10', nominal: 355, daysLate: 15, mora: 1.78 }
    ])
  })

  it('proof: balance + charges - abated equals the independent sum overdue + present value + charges', () => {
    const r = calculateCollection(HAND_C)
    expect(r.proof).toEqual({ demand: 1541.33, independentDemand: 1541.33, difference: 0 })
    expect(r.balance - r.abated + r.charges.total).toBeCloseTo(r.demand, 2)
  })

  it('is eligible: 3 unpaid overdue installments and notice 15 days before the calculation', () => {
    expect(calculateCollection(HAND_C).checks).toEqual({
      overdueCount: 3,
      overdueOk: true,
      noticeDays: 15,
      noticeOk: true,
      eligible: true
    })
  })
})

describe('calculateCollection — requisitos do vencimento antecipado', () => {
  it('flags fewer than 3 unpaid overdue installments', () => {
    const r = calculateCollection({
      ...HAND_C,
      overdue: [{ month: 1, paid: false }, { month: 2, paid: true }, { month: 3, paid: false }]
    })
    expect(r.checks.overdueCount).toBe(2)
    expect(r.checks.overdueOk).toBe(false)
    expect(r.checks.eligible).toBe(false)
  })

  it('flags a notice given less than 10 calendar days before the calculation', () => {
    const r = calculateCollection({ ...HAND_C, noticeDateIso: '2026-04-20' })
    expect(r.checks.noticeDays).toBe(5)
    expect(r.checks.noticeOk).toBe(false)
    expect(r.checks.eligible).toBe(false)
  })

  it('does not flag the notice when no date was informed', () => {
    const r = calculateCollection({ ...HAND_C, noticeDateIso: null })
    expect(r.checks.noticeOk).toBe(false)
    expect(r.checks.noticeDays).toBeNull()
  })

  it('defaults fine and mora to zero', () => {
    const r = calculateCollection({ ...HAND_C, finePct: 0, moraMonthlyPct: 0 })
    expect(r.charges.total).toBe(0)
    expect(r.demand).toBe(1525 - 27.5)
  })
})

describe('calculateCollection — validação', () => {
  it('rejects an unpaid installment that has not yet fallen due', () => {
    const r = calculateCollection({ ...HAND_C, overdue: [{ month: 4, paid: false }] })
    expect(r.error).toBeTruthy()
  })

  it('rejects an installment listed twice or out of range', () => {
    expect(calculateCollection({ ...HAND_C, overdue: [{ month: 1, paid: false }, { month: 1, paid: true }] }).error).toBeTruthy()
    expect(calculateCollection({ ...HAND_C, overdue: [{ month: 9, paid: false }] }).error).toBeTruthy()
  })

  it('rejects a negative fine', () => {
    expect(calculateCollection({ ...HAND_C, finePct: -1 }).error).toBeTruthy()
  })
})

describe('calculateCollection — pró-rata por parcelas (caso C)', () => {
  it('abates future interest from the table balance at the last due date: 302.50 / 1.21 = 250.00', () => {
    // Installment 4 is the only future one: t = 1 instead of 0.5. PV = 250.00, abated = 52.50.
    // Charges unchanged (43.83). Demand = 1525.00 - 52.50 + 43.83 = 1516.33.
    const r = calculateCollection({ ...HAND_C, proRata: 'parcelas' })
    expect(r.proRata).toBe('parcelas')
    expect(r.future.presentValue).toBe(250)
    expect(r.abated).toBe(52.5)
    expect(r.charges.total).toBe(43.83)
    expect(r.demand).toBe(1516.33)
    expect(r.proof.difference).toBe(0)
  })
})

describe('calculateCollection — regras configuráveis e aviso de multa', () => {
  it('flags fewer overdue installments than the chosen minimum (4 instead of 3)', () => {
    const r = calculateCollection({ ...HAND_C, minOverdue: 4 })
    expect(r.checks.overdueOk).toBe(false)
    expect(r.checks.eligible).toBe(false)
  })

  it('flags a notice shorter than the chosen minimum (20 days) but accepts exactly the minimum (15)', () => {
    expect(calculateCollection({ ...HAND_C, noticeDays: 20 }).checks.noticeOk).toBe(false)
    expect(calculateCollection({ ...HAND_C, noticeDays: 15 }).checks.noticeOk).toBe(true)
  })

  it('mora with a 60-day base is half the 30-day mora, rounded per line: 5.67 + 3.12 + 0.89 = 9.68', () => {
    // 460.00 x 1% x 74/60 = 5.67; 407.50 x 1% x 46/60 = 3.12; 355.00 x 1% x 15/60 = 0.89 (0.8875 rounds up).
    // Charges = fine 24.45 + mora 9.68 = 34.13. Demand = 1525.00 - 27.50 + 34.13 = 1531.63.
    const r = calculateCollection({ ...HAND_C, moraDaysPerMonth: 60 })
    expect(r.charges.mora).toBe(9.68)
    expect(r.charges.total).toBe(34.13)
    expect(r.demand).toBe(1531.63)
  })

  it('warns when the fine is above 2%, without blocking the calculation', () => {
    expect(calculateCollection({ ...HAND_C, finePct: 2 }).warnings.fineAboveConsumerLimit).toBe(false)
    const r = calculateCollection({ ...HAND_C, finePct: 2.5 })
    expect(r.warnings.fineAboveConsumerLimit).toBe(true)
    // Fine 2.5% on 1222.50 = 30.5625 -> 30.56. Charges = 30.56 + 19.38 = 49.94. Demand = 1497.50 + 49.94 = 1547.44.
    expect(r.charges.fine).toBe(30.56)
    expect(r.demand).toBe(1547.44)
  })

  it('rejects invalid rules and an unknown pro-rata base', () => {
    expect(calculateCollection({ ...HAND_C, minOverdue: 0 }).error).toBeTruthy()
    expect(calculateCollection({ ...HAND_C, noticeDays: -1 }).error).toBeTruthy()
    expect(calculateCollection({ ...HAND_C, moraDaysPerMonth: 0 }).error).toBeTruthy()
    expect(calculateCollection({ ...HAND_C, proRata: 'mes' }).error).toBeTruthy()
  })
})
