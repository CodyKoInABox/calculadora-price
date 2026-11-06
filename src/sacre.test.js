import { describe, expect, it } from 'vitest'
import { curvePresets, pricePayment, simulateFinancing } from './math'
import { parseTrInput } from './sacre'
import { decodeState, encodeState } from './urlState'

const base = {
  property: 300000,
  down: 60000,
  months: 120,
  rate: 0.01,
  balloons: new Map(),
  curveControls: [...curvePresets.linear]
}

const run = overrides => simulateFinancing({ ...base, ...overrides })

describe('SACRE', () => {
  it('matches Price during the first contract year when there is no TR', () => {
    const price = run({ mode: 'price' })
    const sacre = run({ mode: 'sacre' })

    expect(sacre.error).toBeUndefined()
    for (let i = 0; i < 12; i++) {
      expect(sacre.schedule[i].payment).toBeCloseTo(price.schedule[i].payment, 2)
    }
  })

  it('recalculates the installment at the anniversary over the TR-corrected balance', () => {
    const tr = 0.002
    const sacre = run({ mode: 'sacre', correctionRate: tr })
    const corrected = sacre.schedule[11].balance * (1 + tr)
    const expected = pricePayment(corrected, base.rate, base.months - 12)

    expect(sacre.schedule[12].payment).toBeCloseTo(expected, 1)
    expect(sacre.schedule[12].payment).toBeGreaterThan(sacre.schedule[11].payment)
  })

  it('keeps the installment constant within each year (cent rounding tolerance)', () => {
    const sacre = run({ mode: 'sacre', correctionRate: 0.002 })
    // last installment is excluded: it absorbs the TR residual of the final year
    for (let i = 0; i < base.months - 1; i++) {
      const yearStart = Math.floor(i / 12) * 12
      expect(sacre.schedule[i].payment).toBeCloseTo(sacre.schedule[yearStart].payment, 1)
    }
  })

  it('final installment absorbs the TR residual and is the largest one', () => {
    const sacre = run({ mode: 'sacre', correctionRate: 0.002 })
    const last = sacre.schedule.at(-1).payment
    const previous = sacre.schedule.at(-2).payment
    expect(last).toBeGreaterThan(previous)
  })

  it('pays the balance to zero at the end of the term', () => {
    const sacre = run({ mode: 'sacre' })
    expect(sacre.error).toBeUndefined()
    expect(sacre.schedule.at(-1).balance).toBeCloseTo(0, 6)
  })
})

describe('parseTrInput', () => {
  it('reads percent a.m. with comma as monthly decimal', () => {
    expect(parseTrInput('0,20')).toBeCloseTo(0.002, 12)
    expect(parseTrInput('0.5')).toBeCloseTo(0.005, 12)
  })

  it('treats empty, zero, negative and invalid input as no correction', () => {
    expect(parseTrInput('')).toBe(0)
    expect(parseTrInput(undefined)).toBe(0)
    expect(parseTrInput('0')).toBe(0)
    expect(parseTrInput('-1')).toBe(0)
    expect(parseTrInput('abc')).toBe(0)
  })
})

describe('SACRE in share links', () => {
  const state = {
    propertyValue: '300.000,00',
    downPayment: '60.000,00',
    months: 120,
    interest: 1,
    ratePeriod: 'am',
    mode: 'price',
    direction: 'forward',
    extraEffect: 'payment',
    balloonEnabled: false,
    balloons: [],
    activePreset: 'linear',
    curveControls: [...curvePresets.linear],
    sacre: true,
    trRate: '0,2'
  }

  it('round-trips sacre flag and TR', () => {
    const params = encodeState(state)
    expect(params.get('sc')).toBe('1')
    expect(params.get('tr')).toBe('0.2')
    const decoded = decodeState(params)
    expect(decoded.sacre).toBe(true)
    expect(decoded.trRate).toBe('0,2')
  })

  it('omits SACRE params when off or outside price mode', () => {
    expect(encodeState({ ...state, sacre: false }).has('sc')).toBe(false)
    expect(encodeState({ ...state, mode: 'growing' }).has('sc')).toBe(false)
  })
})

describe('TR correction on SACRE', () => {
  const tr = 0.002

  it('corrects the balance before charging interest', () => {
    const sacre = run({ mode: 'sacre', correctionRate: tr })
    expect(sacre.error).toBeUndefined()
    expect(sacre.schedule[0].correction).toBeCloseTo(sacre.principal * tr, 2)
    expect(sacre.schedule[0].interest).toBeCloseTo((sacre.principal + sacre.schedule[0].correction) * base.rate, 2)
  })

  it('keeps the ledger balanced every month: previous + correction − amortization = balance', () => {
    const sacre = run({ mode: 'sacre', correctionRate: tr })
    let previous = sacre.principal
    for (const row of sacre.schedule) {
      const correction = row.correction || 0
      expect(previous + correction - row.amortization).toBeCloseTo(row.balance, 2)
      previous = row.balance
    }
  })

  it('reports total correction and still liquidates the loan', () => {
    const sacre = run({ mode: 'sacre', correctionRate: tr })
    const sumCorrection = sacre.schedule.reduce((sum, row) => sum + (row.correction || 0), 0)
    expect(sacre.totalCorrection).toBeCloseTo(sumCorrection, 2)
    expect(sacre.totalCorrection).toBeGreaterThan(0)
    expect(sacre.schedule.at(-1).balance).toBeCloseTo(0, 6)
  })

  it('works together with balloons', () => {
    const sacre = run({
      mode: 'sacre',
      correctionRate: tr,
      balloons: new Map([[24, 30000]]),
      extraEffect: 'payment'
    })
    expect(sacre.error).toBeUndefined()
    expect(sacre.schedule.at(-1).balance).toBeCloseTo(0, 6)
  })

  it('is rejected outside SACRE', () => {
    expect(run({ mode: 'price', correctionRate: tr }).error).toMatch(/SACRE/)
    expect(run({ mode: 'sac', correctionRate: tr }).error).toMatch(/SACRE/)
  })

  it('rejects negative correction', () => {
    expect(run({ mode: 'sacre', correctionRate: -0.01 }).error).toBeDefined()
  })
})
