import { describe, expect, it } from 'vitest'
import { curvePresets, simulateFinancing } from './engine/math'
import { compareSavedScenarios, runSavedScenario, MAX_COMPARE } from './multiCompare'
import { encodeState } from './urlState'

function query(overrides) {
  return encodeState({
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
    ...overrides
  }).toString()
}

describe('runSavedScenario', () => {
  it('matches the engine called directly with the same inputs', () => {
    const run = runSavedScenario(query({}))
    const direct = simulateFinancing({
      property: 300000,
      down: 60000,
      months: 120,
      rate: 0.01,
      mode: 'price',
      balloons: new Map(),
      curveControls: [...curvePresets.linear],
      extraEffect: 'payment'
    })
    expect(run.error).toBeUndefined()
    expect(run.result.principal).toBe(direct.principal)
    expect(run.result.totalInterest).toBe(direct.totalInterest)
    expect(run.modeLabel).toBe('Price')
    expect(run.rateLabel).toBe('1% a.m.')
  })

  it('uses SACRE with TR when the saved scenario has them', () => {
    const run = runSavedScenario(query({ sacre: true, trRate: '0,2' }))
    expect(run.modeLabel).toBe('SACRE')
    expect(run.result.totalCorrection).toBeGreaterThan(0)
  })

  it('ignores SACRE for non-price modes', () => {
    const run = runSavedScenario(query({ mode: 'growing', sacre: true, trRate: '0,2' }))
    expect(run.modeLabel).toBe('Curva')
    expect(run.result.totalCorrection).toBe(0)
  })

  it('reports a cost summary with CET', () => {
    const run = runSavedScenario(query({ costInputs: { upfront: '2.000,00', monthlyAdmin: '', mipMonthly: '', dfiAnnual: '' } }))
    expect(run.cost.totalCost).toBeGreaterThan(0)
    expect(Number.isFinite(run.cost.cetAnnual)).toBe(true)
  })

  it('returns an error for an invalid scenario instead of throwing', () => {
    const run = runSavedScenario(query({ downPayment: '400.000,00' }))
    expect(run.error).toBeDefined()
  })
})

describe('compareSavedScenarios', () => {
  it('caps the selection and keeps names', () => {
    const items = Array.from({ length: MAX_COMPARE + 2 }, (_, i) => ({ id: `${i}`, name: `c${i}`, query: query({}) }))
    const out = compareSavedScenarios(items)
    expect(out).toHaveLength(MAX_COMPARE)
    expect(out[0].name).toBe('c0')
  })
})
