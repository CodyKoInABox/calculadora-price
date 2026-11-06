import { annualToMonthly, curvePresets, extrasToMap, monthlyToAnnual, parseMoney, simulateFinancing } from './engine/math'
import { computeCost, EMPTY_COST_INPUTS, parseCostInputs } from './engine/costs'
import { DEFAULT_DOWN, DEFAULT_INTEREST, DEFAULT_MONTHS, DEFAULT_PROPERTY } from './defaults'
import { number } from './format'
import { parseTrInput } from './engine/sacre'
import { decodeState } from './urlState'

export const MAX_COMPARE = 4

function monthlyRate(interestPct, period) {
  if (interestPct === '' || interestPct == null) return Number.NaN
  const parsed = Number(interestPct)
  if (!Number.isFinite(parsed) || parsed < 0) return Number.NaN
  const i = parsed / 100
  return period === 'aa' ? annualToMonthly(i) : i
}

const modeLabel = mode => (mode === 'growing' ? 'Curva' : mode === 'sacre' ? 'SACRE' : 'Price')

/**
 * Runs one saved scenario (a share-link query) through the same engine path as the screen.
 * Returns { result, cost, modeLabel, rateLabel } or { error }.
 */
export function runSavedScenario(query) {
  const decoded = decodeState(query) ?? {}
  const sc = decoded.mode === 'ab' && decoded.scenarioA ? { ...decoded, ...decoded.scenarioA } : decoded

  const months = sc.months ?? DEFAULT_MONTHS
  const ratePeriod = sc.ratePeriod ?? 'am'
  const interest = sc.interest ?? DEFAULT_INTEREST
  const rate = monthlyRate(interest, ratePeriod)
  const balloons = extrasToMap(Boolean(sc.balloonEnabled), sc.balloons ?? [], months)
  if (balloons?.error) return { error: balloons.error }

  // encodeState omits m=price, so an absent mode means price
  const sourceMode = decoded.mode ?? 'price'
  let mode = sourceMode === 'growing' ? 'growing' : 'price'
  if (mode === 'price' && sourceMode === 'price' && decoded.sacre) mode = 'sacre'
  const correctionRate = mode === 'sacre' ? parseTrInput(decoded.trRate) : 0

  const result = simulateFinancing({
    property: parseMoney(decoded.propertyValue ?? number.format(DEFAULT_PROPERTY)),
    down: parseMoney(sc.downPayment ?? number.format(DEFAULT_DOWN)),
    months,
    rate,
    mode,
    balloons,
    curveControls: decoded.curveControls ?? [...curvePresets.linear],
    extraEffect: sc.extraEffect ?? 'payment',
    correctionRate
  })
  if (result.error) return { error: result.error }

  const cost = computeCost({
    principal: result.principal,
    property: result.property,
    schedule: result.schedule,
    costs: parseCostInputs(decoded.costInputs ?? EMPTY_COST_INPUTS)
  })

  return {
    result,
    cost: { ...cost, contractAnnual: monthlyToAnnual(rate) },
    modeLabel: modeLabel(mode),
    rateLabel: `${String(interest).replace('.', ',')}% ${ratePeriod === 'aa' ? 'a.a.' : 'a.m.'}`
  }
}

/** Runs up to MAX_COMPARE saved scenarios. Each entry keeps its own error if it cannot be computed. */
export function compareSavedScenarios(items) {
  return items.slice(0, MAX_COMPARE).map(item => ({
    id: item.id,
    name: item.name,
    ...runSavedScenario(item.query)
  }))
}
