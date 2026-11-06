import { curvePresets } from './engine/math'
import { DEFAULT_DOWN, DEFAULT_INTEREST, DEFAULT_MAX_PAYMENT, DEFAULT_MONTHS, DEFAULT_PROPERTY, SCENARIO_B_DEFAULTS } from './defaults'
import { EMPTY_COST_INPUTS } from './engine/costs'
import { extrasToMap, parseMoney, simulateFinancing, annualToMonthly } from './engine/math'
import { number } from './format'

let extraSeq = 1

export function newExtra(overrides = {}) {
  return {
    id: extraSeq++,
    recurrence: 'once',
    month: 6,
    everyN: 6,
    amount: number.format(10000),
    ...overrides
  }
}

export function cloneScenario(scenario) {
  return { ...scenario, balloons: cloneExtras(scenario.balloons || []) }
}

export function getStorage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}


export const DEFAULT_APP_STATE = {
  propertyValue: number.format(DEFAULT_PROPERTY),
  downPayment: number.format(DEFAULT_DOWN),
  months: DEFAULT_MONTHS,
  interest: DEFAULT_INTEREST,
  ratePeriod: 'am',
  mode: 'price',
  direction: 'forward',
  solveFor: 'principal',
  maxPayment: number.format(DEFAULT_MAX_PAYMENT),
  extraEffect: 'payment',
  balloonEnabled: false,
  balloons: [],
  activePreset: 'linear',
  curveControls: [...curvePresets.linear],
  costInputs: EMPTY_COST_INPUTS,
  sacre: false,
  trRate: ''
}

export function cloneExtras(extras) {
  return extras.map(b => ({
    id: extraSeq++,
    recurrence: b.recurrence || 'once',
    month: b.month,
    everyN: b.everyN ?? 6,
    amount: b.amount
  }))
}

export function defaultScenarioA() {
  return {
    downPayment: number.format(DEFAULT_DOWN),
    months: DEFAULT_MONTHS,
    interest: DEFAULT_INTEREST,
    ratePeriod: 'am',
    balloonEnabled: false,
    balloons: [],
    extraEffect: 'payment'
  }
}

export function defaultScenarioB() {
  return {
    downPayment: number.format(SCENARIO_B_DEFAULTS.down),
    months: SCENARIO_B_DEFAULTS.months,
    interest: SCENARIO_B_DEFAULTS.interest,
    ratePeriod: 'am',
    balloonEnabled: false,
    balloons: [],
    extraEffect: 'payment'
  }
}

/** Percent + period → monthly decimal for the engine. */
export function toMonthlyRate(interestPct, period) {
  if (interestPct === '' || interestPct == null) return Number.NaN
  const parsed = Number(interestPct)
  if (!Number.isFinite(parsed) || parsed < 0) return Number.NaN
  const i = parsed / 100
  return period === 'aa' ? annualToMonthly(i) : i
}

/** Round % for inputs (~4 decimals, no float noise). */
export function formatRatePct(decimal) {
  const pct = decimal * 100
  if (!Number.isFinite(pct) || pct === 0) return 0
  return Math.round(pct * 1e4) / 1e4
}

export function formatRatePctLabel(decimal) {
  return String(formatRatePct(decimal)).replace('.', ',')
}

export function prepareScheduleInputs(enabled, extras, monthsValue) {
  const months = Number(monthsValue)
  if (!Number.isInteger(months) || months < 1 || months > 600) {
    return { error: 'O prazo deve ser um número inteiro entre 1 e 600 meses.' }
  }

  const balloons = extrasToMap(enabled, extras, months)
  if (balloons?.error) return { error: balloons.error }
  return { months, balloons }
}

export function runScenario(property, scenario) {
  const prepared = prepareScheduleInputs(
    scenario.balloonEnabled,
    scenario.balloons,
    scenario.months
  )
  if (prepared.error) return prepared

  return simulateFinancing({
    property,
    down: parseMoney(scenario.downPayment),
    months: prepared.months,
    rate: toMonthlyRate(scenario.interest, scenario.ratePeriod || 'am'),
    mode: 'price',
    balloons: prepared.balloons,
    extraEffect: scenario.extraEffect || 'payment',
    curveControls: [...curvePresets.linear]
  })
}
