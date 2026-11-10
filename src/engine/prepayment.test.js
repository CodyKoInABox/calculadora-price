import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { balanceOnDate, simulatePrepayment } from './prepayment'

const RUNS = 80

// Hand case A: 1000 at 10% a.m., SAC, 2 installments.
//   Installment 1: interest 100.00, amortization 500.00, payment 600.00, balance 500.00.
//   Installment 2: interest  50.00, amortization 500.00, payment 550.00, balance 0.
//   Total due 1150.00, future interest 150.00. Contract starts 2026-01-10, first due 2026-02-10.
const HAND_A = {
  principal: 1000,
  rate: 0.1,
  months: 2,
  system: 'sac',
  firstDueIso: '2026-02-10',
  dateIso: '2026-01-10'
}

// Hand case B: same loan at 21% a.m. (1.21 = 1.1^2, so half a period compounds to exactly 10%).
// First due 2026-05-01, contract start 2026-04-01 (30-day period). Prepayment on 2026-04-16 (f = 0.5).
//   Installment 1: interest 210.00, payment 710.00, balance 500.00.
//   Installment 2: interest 105.00, payment 605.00, balance 0.
//   Total due 1315.00. Balance on the date: 1000 x 1.21^0.5 = 1100.00.
const HAND_B = {
  principal: 1000,
  rate: 0.21,
  months: 2,
  system: 'sac',
  firstDueIso: '2026-05-01',
  dateIso: '2026-04-16'
}

describe('simulatePrepayment — parcelas (marcar parcelas para antecipar)', () => {
  it('total on the contract start: antecipating installment 2 saves 95.45', () => {
    // PV(550 at 2 periods) = 550 / 1.1^2 = 454.55; PV(600 at 1 period) = 545.45; sum = 1000.00.
    // Remaining installment 1 keeps 600.00 nominal; its interest falls to 54.55.
    const r = simulatePrepayment({ ...HAND_A, mode: 'parcelas', marked: [2] })
    expect(r.error).toBeUndefined()
    expect(r.before.presentValue).toBe(1000)
    expect(r.anticipated).toEqual([
      { month: 2, dueIso: '2026-03-10', nominal: 550, presentValue: 454.55, discount: 95.45 }
    ])
    expect(r.amortized).toBe(454.55)
    expect(r.after.schedule).toEqual([
      { month: 1, dueIso: '2026-02-10', payment: 600, interest: 54.55, amortization: 545.45, balance: 0 }
    ])
    expect(r.saved).toBe(95.45)
    expect(r.after.termMonths).toBe(1)
    expect(r.total).toBe(false)
    expect(r.proof).toEqual({
      original: 1150,
      amortized: 454.55,
      saved: 95.45,
      remaining: 600,
      difference: 0,
      balanceDifference: 0
    })
  })

  it('total when every open installment is marked: saves all future interest', () => {
    // Pay PV of both installments: 454.55 + 545.45 = 1000.00. Saving: 1150 - 1000 = 150.00.
    const r = simulatePrepayment({ ...HAND_A, mode: 'parcelas', marked: [1, 2] })
    expect(r.amortized).toBe(1000)
    expect(r.after.schedule).toEqual([])
    expect(r.saved).toBe(150)
    expect(r.total).toBe(true)
    expect(r.proof.difference).toBe(0)
  })

  it('fractional period (case B): antecipating installment 2 at mid-period', () => {
    // PV(605 at 1.5 periods) = 605 / 1.21^1.5 = 605 / 1.331 = 454.55.
    // Balance on the date = 1100.00 - 454.55 = 645.45; installment 1 interest = 64.55 (not 210).
    // Interest from the date before: 1315 - 1100 = 215.00; after: 64.55; saved = 150.45.
    const r = simulatePrepayment({ ...HAND_B, mode: 'parcelas', marked: [2] })
    expect(r.before.presentValue).toBe(1100)
    expect(r.amortized).toBe(454.55)
    expect(r.saved).toBe(150.45)
    expect(r.after.schedule).toEqual([
      { month: 1, dueIso: '2026-05-01', payment: 710, interest: 64.55, amortization: 645.45, balance: 0 }
    ])
    expect(r.proof).toEqual({
      original: 1315,
      amortized: 454.55,
      saved: 150.45,
      remaining: 710,
      difference: 0,
      balanceDifference: 0
    })
  })

  it('rejects an empty selection, a duplicate, and an installment already due', () => {
    expect(simulatePrepayment({ ...HAND_A, mode: 'parcelas', marked: [] }).error).toBeTruthy()
    expect(simulatePrepayment({ ...HAND_A, mode: 'parcelas', marked: [2, 2] }).error).toBeTruthy()
    // On 2026-03-10 installment 2 is due, so it cannot be anticipated any more.
    expect(simulatePrepayment({ ...HAND_A, dateIso: '2026-03-10', mode: 'parcelas', marked: [2] }).error).toBeTruthy()
  })
})

describe('simulatePrepayment — valor (amortização parcial ou total do saldo)', () => {
  it('partial 300 with effect "prazo" keeps installment 1 at 600 and the last payment absorbs the rest (case A)', () => {
    // Balance 1000 - 300 = 700. Month 1: interest 70, pays 600, balance 170.
    // Month 2: interest 17, pays 187, balance 0. Interest 87.00 instead of 150.00.
    const r = simulatePrepayment({ ...HAND_A, mode: 'valor', amount: 300, effect: 'prazo' })
    expect(r.after.schedule.map(row => [row.payment, row.interest, row.balance])).toEqual([
      [600, 70, 170],
      [187, 17, 0]
    ])
    expect(r.saved).toBe(63)
    expect(r.proof).toEqual({
      original: 1150,
      amortized: 300,
      saved: 63,
      remaining: 787,
      difference: 0,
      balanceDifference: 0
    })
  })

  it('partial 300 with effect "parcela" re-amortizes 700 by SAC (case A)', () => {
    // SAC on 700 over 2 periods: amortization 350 each. Payments 420.00 and 385.00. Interest 70 + 35 = 105.00.
    const r = simulatePrepayment({ ...HAND_A, mode: 'valor', amount: 300, effect: 'parcela' })
    expect(r.after.schedule.map(row => row.payment)).toEqual([420, 385])
    expect(r.after.schedule.map(row => row.interest)).toEqual([70, 35])
    expect(r.saved).toBe(45)
    expect(r.proof.difference).toBe(0)
  })

  it('partial with a fractional period (case B, effect "prazo")', () => {
    // Balance on 2026-04-16 = 1100.00. Pay 300.00 -> 800.00.
    // Installment 1 (May 1): 800 x 1.21^0.5 = 880.00, pays 710.00, balance 170.00.
    // Installment 2 (June 1): 170 x 0.21 = 35.70 interest, pays 205.70.
    // Interest after the date: 80.00 + 35.70 = 115.70. Saved: 215.00 - 115.70 = 99.30.
    const r = simulatePrepayment({ ...HAND_B, mode: 'valor', amount: 300, effect: 'prazo' })
    expect(r.before.presentValue).toBe(1100)
    expect(r.after.schedule).toEqual([
      { month: 1, dueIso: '2026-05-01', payment: 710, interest: 80, amortization: 630, balance: 170 },
      { month: 2, dueIso: '2026-06-01', payment: 205.7, interest: 35.7, amortization: 170, balance: 0 }
    ])
    expect(r.saved).toBe(99.3)
    expect(r.proof).toEqual({
      original: 1315,
      amortized: 300,
      saved: 99.3,
      remaining: 915.7,
      difference: 0,
      balanceDifference: 0
    })
  })

  it('partial with a fractional period (case B, effect "parcela")', () => {
    // Balance 800 re-amortized by SAC: 400 each. Payments 480.00 and 484.00. Interest 80 + 84 = 164.00.
    const r = simulatePrepayment({ ...HAND_B, mode: 'valor', amount: 300, effect: 'parcela' })
    expect(r.after.schedule.map(row => row.payment)).toEqual([480, 484])
    expect(r.after.schedule.map(row => row.interest)).toEqual([80, 84])
    expect(r.saved).toBe(51)
    expect(r.proof.remaining).toBe(964)
    expect(r.proof.difference).toBe(0)
  })

  it('liquidates the whole balance when the amount reaches the balance on the date (case A)', () => {
    const r = simulatePrepayment({ ...HAND_A, mode: 'valor', amount: 1000, effect: 'prazo' })
    expect(r.amortized).toBe(1000)
    expect(r.after.schedule).toEqual([])
    expect(r.total).toBe(true)
    expect(r.saved).toBe(150)
    expect(r.proof).toEqual({
      original: 1150,
      amortized: 1000,
      saved: 150,
      remaining: 0,
      difference: 0,
      balanceDifference: 0
    })
  })

  it('caps an amount above the balance at the balance', () => {
    const r = simulatePrepayment({ ...HAND_A, mode: 'valor', amount: 5000, effect: 'parcela' })
    expect(r.amortized).toBe(1000)
    expect(r.total).toBe(true)
  })

  it('reduces the term with Price at zero rate: 1200 in 4 installments of 300', () => {
    // Pay 300 on the contract start: 900 remains. "prazo" keeps 300 per installment -> 3 installments.
    // Zero rate means no interest is saved, so the total is 300 + 0 + 900 = 1200.
    const shared = { principal: 1200, rate: 0, months: 4, system: 'price', firstDueIso: '2026-02-10', dateIso: '2026-01-10', mode: 'valor', amount: 300 }
    const prazo = simulatePrepayment({ ...shared, effect: 'prazo' })
    expect(prazo.after.schedule.map(row => row.payment)).toEqual([300, 300, 300])
    expect(prazo.after.termMonths).toBe(3)
    expect(prazo.saved).toBe(0)
    expect(prazo.proof.difference).toBe(0)

    const parcela = simulatePrepayment({ ...shared, effect: 'parcela' })
    expect(parcela.after.schedule.map(row => row.payment)).toEqual([225, 225, 225, 225])
    expect(parcela.after.termMonths).toBe(4)
  })
})

describe('simulatePrepayment — validação', () => {
  it('rejects a date after the last installment', () => {
    expect(simulatePrepayment({ ...HAND_A, dateIso: '2026-03-15', mode: 'valor', amount: 100 }).error).toBeTruthy()
  })

  it('rejects a missing or non-positive amount', () => {
    expect(simulatePrepayment({ ...HAND_A, mode: 'valor', amount: 0 }).error).toBeTruthy()
    expect(simulatePrepayment({ ...HAND_A, mode: 'valor', amount: Number.NaN }).error).toBeTruthy()
  })

  it('rejects an unknown system or effect', () => {
    expect(simulatePrepayment({ ...HAND_A, system: 'sacre', mode: 'valor', amount: 100 }).error).toBeTruthy()
    expect(simulatePrepayment({ ...HAND_A, mode: 'valor', amount: 100, effect: 'term' }).error).toBeTruthy()
  })
})

describe('simulatePrepayment — invariantes', () => {
  const loan = fc.record({
    principal: fc.integer({ min: 5_000, max: 500_000 }),
    rateBp: fc.integer({ min: 0, max: 300 }),
    months: fc.integer({ min: 2, max: 60 }),
    system: fc.constantFrom('price', 'sac', 'growing'),
    offsetDays: fc.integer({ min: 0, max: 700 }),
    effect: fc.constantFrom('prazo', 'parcela'),
    share: fc.integer({ min: 1, max: 100 })
  })

  it('the proof always closes and the remaining balance ends at zero', () => {
    fc.assert(fc.property(loan, ({ principal, rateBp, months, system, offsetDays, effect, share }) => {
      const base = { principal, rate: rateBp / 10_000, months, system, firstDueIso: '2026-05-01', effect, curveControls: [0.6, 0.85, 1.1, 1.35, 1.6, 1.85] }
      const dayNumber = Date.UTC(2026, 3, 1) / 86_400_000 + offsetDays
      const iso = new Date(dayNumber * 86_400_000).toISOString().slice(0, 10)
      const amount = principal * share / 100

      const byValue = simulatePrepayment({ ...base, dateIso: iso, mode: 'valor', amount })
      if (byValue.error) return
      expect(byValue.proof.difference).toBe(0)
      expect(byValue.proof.balanceDifference).toBe(0)
      expect(byValue.after.schedule.every(row => row.balance >= 0 && row.interest >= 0)).toBe(true)
      if (byValue.after.schedule.length) expect(byValue.after.schedule.at(-1).balance).toBe(0)
    }), { numRuns: RUNS })
  })
})

// Pró-rata 'parcelas' on hand case B (same contract, prepayment on 2026-04-16).
//   The current period counts as a whole installment, so t = 1 for installment 1 and t = 2 for installment 2.
//   Balance on the date = 710 / 1.21 + 605 / 1.21^2 = 586.78 + 413.22 = 1000.00, the table balance at contract start.
describe('simulatePrepayment — pró-rata por parcelas', () => {
  it('balance on the date equals the table balance at the last due date (1000.00, not 1100.00)', () => {
    expect(balanceOnDate({ ...HAND_B, proRata: 'parcelas' }).presentValue).toBe(1000)
    expect(balanceOnDate({ ...HAND_B, proRata: 'dias' }).presentValue).toBe(1100)
  })

  it('antecipating installment 2 saves the whole discount 605 - 413.22 = 191.78', () => {
    // Remaining installment 1: interest 1000 - 413.22 = 586.78 x 21% = 123.22, payment 710.00, balance 0.
    // Saved = 315.00 - 123.22 = 191.78. Proof: 1315.00 = 413.22 + 191.78 + 710.00.
    const r = simulatePrepayment({ ...HAND_B, mode: 'parcelas', marked: [2], proRata: 'parcelas' })
    expect(r.proRata).toBe('parcelas')
    expect(r.before.presentValue).toBe(1000)
    expect(r.amortized).toBe(413.22)
    expect(r.saved).toBe(191.78)
    expect(r.after.schedule).toEqual([
      { month: 1, dueIso: '2026-05-01', payment: 710, interest: 123.22, amortization: 586.78, balance: 0 }
    ])
    expect(r.proof.difference).toBe(0)
  })

  it('partial 300 with effect "prazo": installment 1 at 710 leaves 137.00, last payment 165.77', () => {
    // Start 1000 - 300 = 700. Installment 1: interest 700 x 21% = 147.00, payment 710.00, balance 137.00.
    // Installment 2: interest 137 x 21% = 28.77, payment 137.00 + 28.77 = 165.77, balance 0.
    // Saved = 315.00 - (147.00 + 28.77) = 139.23. Proof: 1315.00 = 300.00 + 139.23 + (710.00 + 165.77).
    const r = simulatePrepayment({ ...HAND_B, mode: 'valor', amount: 300, effect: 'prazo', proRata: 'parcelas' })
    expect(r.amortized).toBe(300)
    expect(r.after.schedule).toEqual([
      { month: 1, dueIso: '2026-05-01', payment: 710, interest: 147, amortization: 563, balance: 137 },
      { month: 2, dueIso: '2026-06-01', payment: 165.77, interest: 28.77, amortization: 137, balance: 0 }
    ])
    expect(r.saved).toBe(139.23)
    expect(r.proof).toEqual({
      original: 1315,
      amortized: 300,
      saved: 139.23,
      remaining: 875.77,
      difference: 0,
      balanceDifference: 0
    })
  })

  it('rejects an unknown pro-rata base', () => {
    const r = simulatePrepayment({ ...HAND_B, mode: 'parcelas', marked: [2], proRata: 'mes' })
    expect(r.error).toBeTruthy()
  })
})
