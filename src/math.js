export const curvePresets = {
  linear: [0.60, 0.85, 1.10, 1.35, 1.60, 1.85],
  hill: [0.65, 1.10, 1.75, 1.55, 1.05, 0.75],
  'fast-start': [0.55, 1.10, 1.50, 1.72, 1.86, 1.95],
  'fast-end': [0.55, 0.62, 0.78, 1.05, 1.48, 2.15]
}

export const CURVE_MIN = 0.25
export const CURVE_MAX = 2.5

export function parseMoney(value) {
  return Number(String(value).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')) || 0
}

export function pricePayment(principal, rate, months) {
  if (rate === 0) return principal / months
  return principal * rate * Math.pow(1 + rate, months) / (Math.pow(1 + rate, months) - 1)
}

/** Effective a.a. → a.m.: (1+i)^(1/12)-1 (not i/12). */
export function annualToMonthly(iAa) {
  return Math.pow(1 + iAa, 1 / 12) - 1
}

/** Effective a.m. → a.a.: (1+i)^12-1. */
export function monthlyToAnnual(iAm) {
  return Math.pow(1 + iAm, 12) - 1
}

export function clampCurveValue(value, step = 0.05) {
  const rounded = step ? Math.round(value / step) * step : value
  return Math.max(CURVE_MIN, Math.min(CURVE_MAX, rounded))
}

/** Catmull-Rom style interpolation across control points → relative installment weight. */
export function curveWeightAt(progress, curveControls) {
  const scaled = Math.max(0, Math.min(1, progress)) * (curveControls.length - 1)
  const index = Math.min(curveControls.length - 2, Math.floor(scaled))
  const t = scaled - index
  const p0 = curveControls[Math.max(0, index - 1)]
  const p1 = curveControls[index]
  const p2 = curveControls[Math.min(curveControls.length - 1, index + 1)]
  const p3 = curveControls[Math.min(curveControls.length - 1, index + 2)]
  const value = .5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t)
  return Math.max(.1, value)
}

/**
 * Expand extra-payment rows (once / monthly / yearly / every N) into month → amount map.
 * @param {boolean} enabled
 * @param {Array<{ recurrence?: string, month?: number|string, everyN?: number|string, amount?: string|number }>} extras
 * @param {number} months
 */
export function extrasToMap(enabled, extras, months) {
  if (!enabled) return new Map()
  const map = new Map()
  const horizon = Math.max(1, months)

  const add = (month, value) => {
    if (value <= 0) return
    const m = Math.max(1, Math.min(horizon, month))
    map.set(m, (map.get(m) || 0) + value)
  }

  for (const item of extras) {
    const value = Math.max(0, parseMoney(item.amount))
    const start = Math.max(1, Math.min(horizon, Number(item.month) || 1))
    const recurrence = item.recurrence || 'once'

    if (recurrence === 'once') {
      add(start, value)
      continue
    }

    let step
    if (recurrence === 'yearly') step = 12
    else if (recurrence === 'every') step = Math.max(2, Number(item.everyN) || 2)
    else if (recurrence === 'monthly') step = 1
    else {
      add(start, value)
      continue
    }

    for (let m = start; m <= horizon; m += step) add(m, value)
  }

  return map
}

function binarySearchScale(closingBalance) {
  let low = 0
  let high = 1
  while (closingBalance(high) > 0 && high < 1e8) high *= 2
  for (let i = 0; i < 120; i++) {
    const mid = (low + high) / 2
    if (closingBalance(mid) > 0) low = mid
    else high = mid
  }
  return high
}

/** Largest x ≥ 0 such that isFeasible(x) is true (assumes feasibility is monotone decreasing in x). */
function binarySearchMaxFeasible(isFeasible) {
  if (!isFeasible(0)) return 0
  let low = 0
  let high = 1
  while (isFeasible(high) && high < 1e12) high *= 2
  for (let i = 0; i < 120; i++) {
    const mid = (low + high) / 2
    if (isFeasible(mid)) low = mid
    else high = mid
  }
  return low
}

export function maxRegularPayment(schedule) {
  if (!schedule?.length) return 0
  let max = 0
  for (const row of schedule) {
    if (row.payment > max) max = row.payment
  }
  return max
}

/**
 * Invert financing: find max principal or min down so that max regular installment ≤ targetPayment.
 * @param {{ targetPayment: number, solveFor: 'principal'|'down', property: number, down: number, months: number, rate: number, mode: 'price'|'growing'|'sac', balloons: Map<number, number>, curveControls: number[], extraEffect?: 'payment'|'term' }} input
 */
export function solveFromMaxPayment({
  targetPayment,
  solveFor = 'principal',
  property,
  down,
  months,
  rate,
  mode,
  balloons,
  curveControls,
  extraEffect = 'payment'
}) {
  if (targetPayment <= 0) {
    return { error: 'Informe uma parcela máxima maior que zero.' }
  }
  if (solveFor === 'down' && property <= 0) {
    return { error: 'Informe um valor do imóvel válido.' }
  }
  if (solveFor === 'principal' && down < 0) {
    return { error: 'Informe uma entrada válida.' }
  }

  const shared = { months, rate, mode, balloons, curveControls, extraEffect }
  const principalCap = solveFor === 'down' ? property * (1 - 1e-12) : Infinity

  const probe = principal => {
    if (principal <= 0) return { schedule: [], principal: 0 }
    if (solveFor === 'down') {
      if (principal >= property) return { error: 'Principal excede o imóvel.' }
      return simulateFinancing({ ...shared, property, down: property - principal })
    }
    const fixedDown = Math.max(0, down)
    return simulateFinancing({ ...shared, property: fixedDown + principal, down: fixedDown })
  }

  const isFeasible = principal => {
    if (principal <= 0) return true
    if (principal > principalCap) return false
    const out = probe(principal)
    if (out.error) return false
    return maxRegularPayment(out.schedule) <= targetPayment + 1e-6
  }

  if (!isFeasible(0)) {
    return { error: 'Parcela máxima abaixo do mínimo possível.' }
  }

  const principal = binarySearchMaxFeasible(isFeasible)
  if (principal <= 1e-6) {
    return { error: 'Com essa parcela máxima o valor financiável fica zerado.' }
  }

  const result = probe(principal)
  if (result.error) return result

  return {
    ...result,
    solved: solveFor,
    targetPayment,
    maxPayment: maxRegularPayment(result.schedule)
  }
}

function applyOverflowCap(regular, balloon, amountDue) {
  let nextRegular = regular
  let nextBalloon = balloon
  if (nextRegular + nextBalloon > amountDue) {
    if (nextBalloon >= amountDue) {
      nextBalloon = amountDue
      nextRegular = 0
    } else {
      nextRegular = amountDue - nextBalloon
    }
  }
  return { regular: nextRegular, balloon: nextBalloon }
}

function walkSchedule({ principal, months, rate, balloons, regularForMonth, truncate }) {
  const schedule = []
  let balance = principal
  let totalInterest = 0
  let totalRegular = 0
  let totalBalloon = 0

  for (let m = 1; m <= months; m++) {
    if (truncate && balance <= 1e-9) break

    const interest = balance * rate
    const amountDue = balance + interest
    let regular = regularForMonth(m, balance, interest)
    let balloon = balloons.get(m) || 0
    ;({ regular, balloon } = applyOverflowCap(regular, balloon, amountDue))

    const amortization = Math.max(0, regular - interest) + balloon
    balance = Math.max(0, amountDue - regular - balloon)
    totalInterest += interest
    totalRegular += regular
    totalBalloon += balloon
    schedule.push({ month: m, payment: regular, interest, amortization, balloon, balance })

    if (truncate && balance <= 1e-9) break
  }

  return { schedule, totalInterest, totalRegular, totalBalloon }
}

/**
 * @param {{ property: number, down: number, months: number, rate: number, mode: 'price'|'growing'|'sac', balloons: Map<number, number>, curveControls: number[], extraEffect?: 'payment'|'term' }} input
 */
export function simulateFinancing({
  property,
  down,
  months,
  rate,
  mode,
  balloons,
  curveControls,
  extraEffect = 'payment'
}) {
  const principal = property - down

  if (property <= 0 || principal <= 0) {
    return { error: 'Informe um valor do imóvel maior que a entrada.' }
  }

  const effect = extraEffect === 'term' ? 'term' : 'payment'
  const totalBalloonsPlanned = [...balloons.values()].reduce((a, b) => a + b, 0)

  if (mode === 'sac') {
    return simulateSac({
      property,
      down,
      principal,
      months,
      rate,
      balloons,
      totalBalloonsPlanned,
      extraEffect: effect
    })
  }

  let base = []
  if (mode === 'price') {
    const p = pricePayment(principal, rate, months)
    base = Array(months).fill(p)
  } else {
    base = Array.from(
      { length: months },
      (_, i) => curveWeightAt(months === 1 ? 0 : i / (months - 1), curveControls)
    )
  }

  const balloonsForScale = effect === 'term' ? new Map() : balloons
  const closingBalance = factor => {
    let balance = principal
    for (let m = 1; m <= months; m++) {
      const interest = balance * rate
      const regular = base[m - 1] * factor
      const balloon = Math.min(
        balloonsForScale.get(m) || 0,
        Math.max(0, balance + interest - regular)
      )
      balance = balance + interest - regular - balloon
    }
    return balance
  }

  const factor = binarySearchScale(closingBalance)
  const truncate = effect === 'term'
  const { schedule, totalInterest, totalRegular, totalBalloon } = walkSchedule({
    principal,
    months,
    rate,
    balloons,
    truncate,
    regularForMonth: m => base[m - 1] * factor
  })

  return {
    property,
    down,
    principal,
    months,
    effectiveMonths: schedule.length,
    extraEffect: effect,
    totalInterest,
    totalRegular,
    totalBalloon,
    totalBalloonsPlanned,
    schedule
  }
}

/** SAC: constant amortization; payment mode re-scales amort so extras keep contracted term. */
function simulateSac({
  property,
  down,
  principal,
  months,
  rate,
  balloons,
  totalBalloonsPlanned,
  extraEffect
}) {
  let amortBase = principal / months

  if (extraEffect === 'payment' && balloons.size > 0) {
    const closingBalance = candidate => {
      let balance = principal
      for (let m = 1; m <= months; m++) {
        const interest = balance * rate
        const amort = Math.min(candidate, balance)
        const regular = amort + interest
        const balloon = Math.min(
          balloons.get(m) || 0,
          Math.max(0, balance + interest - regular)
        )
        balance = balance + interest - regular - balloon
      }
      return balance
    }
    amortBase = binarySearchScale(closingBalance)
  }

  const truncate = extraEffect === 'term'
  const { schedule, totalInterest, totalRegular, totalBalloon } = walkSchedule({
    principal,
    months,
    rate,
    balloons,
    truncate,
    regularForMonth: (m, balance, interest) => {
      const amort = (!truncate && m === months) ? balance : Math.min(amortBase, balance)
      return amort + interest
    }
  })

  return {
    property,
    down,
    principal,
    months,
    effectiveMonths: schedule.length,
    extraEffect,
    totalInterest,
    totalRegular,
    totalBalloon,
    totalBalloonsPlanned,
    schedule
  }
}
