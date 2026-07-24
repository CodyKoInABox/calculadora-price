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
