import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { curvePresets, simulateFinancing } from './math'
import { proofCheck } from './proof'

const RUNS = 80

function run(overrides) {
  return simulateFinancing({
    property: 12000,
    down: 0,
    months: 12,
    rate: 0.01,
    mode: 'sac',
    balloons: new Map(),
    curveControls: [...curvePresets.linear],
    extraEffect: 'payment',
    ...overrides
  })
}

describe('proofCheck with known values', () => {
  it('SAC 12.000 em 12 meses a 1% a.m.: juros = P·i·(n+1)/2 = 780', () => {
    const result = run({})
    const proof = proofCheck(result)

    expect(proof.ok).toBe(true)
    expect(proof.settled).toBe(true)
    expect(proof.interest).toBeCloseTo(780, 2)
    expect(proof.paid).toBeCloseTo(12780, 2)
    expect(proof.totalFinancing).toBeCloseTo(12780, 2)
    expect(proof.balance).toBe(0)
    expect(proof.checks.map(item => item.id)).toEqual(['amortization', 'paid', 'interest', 'totals', 'totals-paid'])
  })

  it('Price 100.000 em 12 meses a 1% a.m.: parcela 8.884,88 e juros próximos da fórmula fechada', () => {
    const result = run({ property: 100000, mode: 'price' })
    const payment = 100000 * 0.01 / (1 - Math.pow(1.01, -12))
    const proof = proofCheck(result)

    expect(result.schedule[0].payment).toBeCloseTo(8884.88, 2)
    expect(proof.ok).toBe(true)
    expect(proof.interest).toBeCloseTo(12 * payment - 100000, 1)
  })

  it('zero juros: total pago é igual ao principal', () => {
    const result = run({ property: 1000, months: 10, rate: 0, mode: 'price' })
    const proof = proofCheck(result)

    expect(proof.ok).toBe(true)
    expect(proof.interest).toBe(0)
    expect(proof.paid).toBe(1000)
  })

  it('conferência parcial no mês 3 do SAC: saldo 9.000, juros 330, pago 3.330', () => {
    const result = run({})
    const proof = proofCheck(result, 3)

    expect(proof.month).toBe(3)
    expect(proof.settled).toBe(false)
    expect(proof.balance).toBe(9000)
    expect(proof.interest).toBe(330)
    expect(proof.paid).toBe(3330)
    expect(proof.amortized).toBe(3000)
    expect(proof.checks.map(item => item.id)).toEqual(['amortization', 'paid'])
    expect(proof.ok).toBe(true)
  })

  it('limita o mês conferido ao intervalo do cronograma', () => {
    const result = run({})
    expect(proofCheck(result, 0).month).toBe(1)
    expect(proofCheck(result, 999).month).toBe(12)
  })

  it('retorna null sem cronograma', () => {
    expect(proofCheck({ schedule: [] })).toBeNull()
    expect(proofCheck(undefined)).toBeNull()
  })
})

describe('proofCheck detects inconsistent tables', () => {
  it('falha quando os juros de uma linha foram alterados', () => {
    const result = run({})
    const tampered = {
      ...result,
      schedule: result.schedule.map((row, index) => (index === 4 ? { ...row, interest: row.interest + 50 } : row))
    }
    const proof = proofCheck(tampered)

    expect(proof.ok).toBe(false)
    expect(proof.checks.find(item => item.id === 'paid').ok).toBe(false)
    expect(proof.checks.find(item => item.id === 'interest').ok).toBe(false)
  })

  it('falha quando o total de juros do resumo não bate com a tabela', () => {
    const result = run({})
    const proof = proofCheck({ ...result, totalInterest: result.totalInterest + 1 })

    expect(proof.checks.find(item => item.id === 'totals').ok).toBe(false)
    expect(proof.ok).toBe(false)
  })
})

describe('proofCheck (property-based)', () => {
  const loan = fc.record({
    p: fc.integer({ min: 20_000, max: 2_000_000 }),
    dp: fc.integer({ min: 0, max: 90 }),
    n: fc.integer({ min: 1, max: 360 }),
    bp: fc.integer({ min: 0, max: 300 }),
    m: fc.constantFrom('price', 'sac', 'sacre', 'growing'),
    trBp: fc.integer({ min: 0, max: 100 }),
    balloonMonth: fc.integer({ min: 1, max: 360 }),
    balloonAmount: fc.integer({ min: 0, max: 300_000 }),
    extraEffect: fc.constantFrom('payment', 'term'),
    checkMonth: fc.integer({ min: 1, max: 360 })
  })

  it('every table passes the proof, at the end and at any month, with extras and TR', () => {
    fc.assert(
      fc.property(loan, input => {
        const result = simulateFinancing({
          property: input.p,
          down: Math.floor((input.p * input.dp) / 100),
          months: input.n,
          rate: input.bp / 10_000,
          mode: input.m,
          balloons: new Map([[Math.min(input.balloonMonth, input.n), input.balloonAmount]]),
          curveControls: [...curvePresets.linear],
          extraEffect: input.extraEffect,
          correctionRate: input.m === 'sacre' ? input.trBp / 10_000 : 0
        })
        expect(result.error).toBeUndefined()

        const full = proofCheck(result)
        expect(full.ok).toBe(true)
        expect(full.settled).toBe(true)

        const partial = proofCheck(result, input.checkMonth)
        expect(partial.ok).toBe(true)
      }),
      { numRuns: RUNS }
    )
  })
})
