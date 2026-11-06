import { describe, expect, it } from 'vitest'
import { simulateFinancing } from './engine/math'
import {
  DEFAULT_APP_STATE,
  cloneExtras,
  cloneScenario,
  defaultScenarioA,
  formatRatePct,
  prepareScheduleInputs,
  runScenario,
  toMonthlyRate
} from './appState'

describe('toMonthlyRate', () => {
  it('reads monthly and annual rates as decimals', () => {
    expect(toMonthlyRate(1, 'am')).toBeCloseTo(0.01, 12)
    expect(toMonthlyRate(12, 'aa')).toBeCloseTo(0.009488, 5)
  })

  it('returns NaN for empty, negative or non-numeric input', () => {
    expect(toMonthlyRate('', 'am')).toBeNaN()
    expect(toMonthlyRate(-1, 'am')).toBeNaN()
    expect(toMonthlyRate('abc', 'am')).toBeNaN()
  })
})

describe('formatRatePct', () => {
  it('rounds to four decimals without float noise', () => {
    expect(formatRatePct(0.0123456)).toBe(1.2346)
    expect(formatRatePct(0)).toBe(0)
  })
})

describe('extras and scenarios', () => {
  it('gives each cloned extra a new id and keeps its values', () => {
    const source = [{ recurrence: 'every', month: 3, everyN: 12, amount: '5.000,00' }]
    const [a] = cloneExtras(source)
    expect(a.id).toEqual(expect.any(Number))
    expect(a).toMatchObject({ recurrence: 'every', month: 3, everyN: 12, amount: '5.000,00' })
    expect(cloneExtras(source)[0].id).not.toBe(a.id)
  })

  it('clones a scenario without sharing its balloon array', () => {
    const original = { ...defaultScenarioA(), balloons: [{ recurrence: 'once', month: 6, amount: '1,00' }] }
    const copy = cloneScenario(original)
    expect(copy.balloons).not.toBe(original.balloons)
    expect(copy.balloons[0].month).toBe(6)
  })

  it('exposes defaults that the simulator accepts', () => {
    expect(DEFAULT_APP_STATE.mode).toBe('price')
    expect(DEFAULT_APP_STATE.sacre).toBe(false)
  })
})

describe('prepareScheduleInputs / runScenario', () => {
  it('rejects a term outside 1..600 months', () => {
    expect(prepareScheduleInputs(false, [], 0).error).toBeDefined()
    expect(prepareScheduleInputs(false, [], 601).error).toBeDefined()
  })

  it('runs an A vs B scenario through the same engine call as the engine tests', () => {
    const scenario = { ...defaultScenarioA(), downPayment: '60.000,00', months: 120, interest: 1, ratePeriod: 'am' }
    const out = runScenario(300000, scenario)
    const direct = simulateFinancing({
      property: 300000,
      down: 60000,
      months: 120,
      rate: 0.01,
      mode: 'price',
      balloons: new Map(),
      curveControls: DEFAULT_APP_STATE.curveControls,
      extraEffect: 'payment'
    })
    expect(out.error).toBeUndefined()
    expect(out.totalInterest).toBe(direct.totalInterest)
  })
})
