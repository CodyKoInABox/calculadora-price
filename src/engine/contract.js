import { curvePresets, curveWeightAt, simulateFinancing } from './math'
import { addMonths, dueDates, toDayNumber } from './dates'

export const CONTRACT_SYSTEMS = ['price', 'sac', 'growing']

export const SYSTEM_LABELS = {
  price: 'Price',
  sac: 'SAC',
  growing: 'Curva'
}

/** Rounds half away from zero, tolerating float noise such as 6454.4999999999 at a cent boundary. */
export const roundCents = value => Math.round(value + Math.sign(value) * 1e-6)
export const toCents = value => roundCents(value * 100)
export const fromCents = cents => cents / 100

/**
 * Contract table in cents, built with the same engine as the main calculator.
 * Installment n is due n months after the first due date (see dueDates).
 */
export function buildContractTable({ principal, rate, months, system = 'price', curveControls = curvePresets.linear }) {
  const result = simulateFinancing({
    property: principal,
    down: 0,
    months,
    rate,
    mode: system,
    balloons: new Map(),
    curveControls: [...curveControls],
    extraEffect: 'payment'
  })
  if (result.error) return { error: result.error }
  return {
    principal: toCents(result.principal),
    rows: result.schedule.map(row => ({
      month: row.month,
      payment: toCents(row.payment),
      interest: toCents(row.interest),
      amortization: toCents(row.amortization),
      balance: toCents(row.balance)
    }))
  }
}

/**
 * Locates a date inside the contract's periods. The period before installment k
 * runs from due date k-1 (or one month before the first due date) to due date k.
 * Installments with due date <= the date are treated as already due; k is the next one.
 * f is the fraction of period k already elapsed, counted in calendar days.
 */
export function locatePeriod({ firstDueIso, months, dateIso }) {
  const dayNumber = toDayNumber(dateIso)
  if (dayNumber == null || toDayNumber(firstDueIso) == null) {
    return { error: 'Informe datas válidas.' }
  }
  const boundaries = [
    toDayNumber(addMonths(firstDueIso, -1)),
    ...dueDates(firstDueIso, months).map(toDayNumber)
  ]
  if (dayNumber < boundaries[0]) {
    return { error: 'A data é anterior ao início do contrato (um mês antes da primeira parcela).' }
  }

  let k = 1
  while (k <= months && boundaries[k] <= dayNumber) k++

  if (k > months) {
    return { k, f: 0, pastMaturity: true, periodStart: boundaries[months], periodDays: 0 }
  }
  const periodDays = boundaries[k] - boundaries[k - 1]
  return {
    k,
    f: (dayNumber - boundaries[k - 1]) / periodDays,
    pastMaturity: false,
    periodStart: boundaries[k - 1],
    periodDays
  }
}

export const PRORATA_BASES = ['dias', 'parcelas']

/**
 * Periods from the reference date to installment `month`.
 * - 'dias': the current period is fractional, (1 - f), with f counted in calendar days.
 * - 'parcelas': the current period counts as a whole installment. The balance then equals the
 *   table balance at the last due date, and no interest accrues inside the period.
 */
export function periodsAhead(position, month, proRata = 'dias') {
  const elapsed = proRata === 'parcelas' ? 0 : position.f
  return (1 - elapsed) + (month - position.k)
}

export function growthFactor(rate, periods) {
  if (periods === 0) return 0
  if (periods === 1) return rate
  return Math.expm1(periods * Math.log1p(rate))
}

export function discountFactor(rate, periods) {
  if (periods === 0) return 1
  return Math.pow(1 + rate, -periods)
}

export function presentValueCents(amountCents, rate, periods) {
  return roundCents(amountCents * discountFactor(rate, periods))
}

/**
 * Walks a balance forward through the given steps. Each step has `t`, the periods from the
 * reference date, and `month`. Interest is compounded at the contract rate over the elapsed
 * periods. paymentFor(index, interest) returns the requested payment; the last step absorbs
 * the cent residual so the balance closes at zero.
 */
export function walkBalance({ start, rate, steps, paymentFor }) {
  const rows = []
  let balance = start
  let previousT = 0
  for (let index = 0; index < steps.length && balance > 0; index++) {
    const step = steps[index]
    const interest = roundCents(balance * growthFactor(rate, step.t - previousT))
    previousT = step.t
    const due = balance + interest
    const isLast = index === steps.length - 1
    const requested = paymentFor(index, interest)
    if (!isLast && (requested == null || requested < interest)) {
      return { error: 'A parcela recalculada não cobre os juros do período.' }
    }
    const payment = isLast ? due : Math.min(requested, due)
    const nextBalance = due - payment
    rows.push({
      month: step.month,
      payment,
      interest,
      amortization: payment - interest,
      balance: nextBalance
    })
    balance = nextBalance
  }
  return { rows, finalBalance: balance }
}

/**
 * Re-amortizes `startCents` over the given steps with the contract system.
 * Price and SAC use the same term; Curva reuses the contract's curve shape on the remaining installments.
 */
export function recastBalance({ startCents, rate, steps, system, curveControls }) {
  if (startCents <= 0 || steps.length === 0) return { rows: [], finalBalance: 0 }

  if (system === 'sac') {
    const amortization = roundCents(startCents / steps.length)
    return walkBalance({ start: startCents, rate, steps, paymentFor: (_index, interest) => interest + amortization })
  }

  if (system === 'growing') {
    const weights = steps.map((_, index) => curveWeightAt(
      steps.length === 1 ? 0 : index / (steps.length - 1),
      curveControls
    ))
    const denominator = steps.reduce((sum, step, index) => sum + weights[index] * discountFactor(rate, step.t), 0)
    const scale = startCents / denominator
    return walkBalance({
      start: startCents,
      rate,
      steps,
      paymentFor: index => roundCents(weights[index] * scale)
    })
  }

  const denominator = steps.reduce((sum, step) => sum + discountFactor(rate, step.t), 0)
  const payment = roundCents(startCents / denominator)
  return walkBalance({ start: startCents, rate, steps, paymentFor: () => payment })
}

/**
 * Installment list for the calculator screens. `due` marks installments whose due date is on or
 * before the reference date (they are treated as paid or overdue, never as open).
 */
export function contractInstallments({ principal, rate, months, system = 'price', curveControls, firstDueIso, dateIso }) {
  const table = buildContractTable({ principal, rate, months, system, curveControls })
  if (table.error) return { error: table.error }
  const position = locatePeriod({ firstDueIso, months, dateIso })
  if (position.error) return position
  return {
    position,
    rows: table.rows.map(row => ({
      month: row.month,
      dueIso: addMonths(firstDueIso, row.month - 1),
      payment: fromCents(row.payment),
      interest: fromCents(row.interest),
      due: row.month < position.k
    }))
  }
}
