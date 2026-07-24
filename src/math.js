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
 * @param {{ property: number, down: number, months: number, rate: number, mode: 'price'|'growing'|'sac', balloons: Map<number, number>, curveControls: number[] }} input
 */
export function simulateFinancing({ property, down, months, rate, mode, balloons, curveControls }) {
  const principal = property - down

  if (property <= 0 || principal <= 0) {
    return { error: 'Informe um valor do imóvel maior que a entrada.' }
  }

  const totalBalloonsPlanned = [...balloons.values()].reduce((a, b) => a + b, 0)

  if (mode === 'sac') {
    return simulateSac({ property, down, principal, months, rate, balloons, totalBalloonsPlanned })
  }

  const schedule = []

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

  const closingBalance = factor => {
    let balance = principal
    for (let m = 1; m <= months; m++) {
      const interest = balance * rate
      const regular = base[m - 1] * factor
      const balloon = Math.min(balloons.get(m) || 0, Math.max(0, balance + interest - regular))
      balance = balance + interest - regular - balloon
    }
    return balance
  }

  let low = 0, high = 1
  while (closingBalance(high) > 0 && high < 1e8) high *= 2
  for (let i = 0; i < 120; i++) {
    const mid = (low + high) / 2
    if (closingBalance(mid) > 0) low = mid
    else high = mid
  }
  const factor = high

  let balance = principal, totalInterest = 0, totalRegular = 0, totalBalloon = 0
  for (let m = 1; m <= months; m++) {
    const interest = balance * rate
    let regular = base[m - 1] * factor
    let balloon = balloons.get(m) || 0
    const amountDue = balance + interest

    if (regular + balloon > amountDue) {
      if (balloon >= amountDue) { balloon = amountDue; regular = 0 }
      else regular = amountDue - balloon
    }

    const amortization = Math.max(0, regular - interest) + balloon
    balance = Math.max(0, amountDue - regular - balloon)
    totalInterest += interest
    totalRegular += regular
    totalBalloon += balloon
    schedule.push({ month: m, payment: regular, interest, amortization, balloon, balance })
  }

  return {
    property,
    down,
    principal,
    months,
    totalInterest,
    totalRegular,
    totalBalloon,
    totalBalloonsPlanned,
    schedule
  }
}

/** SAC: constant amortization (principal/n), declining interest + payment. */
function simulateSac({ property, down, principal, months, rate, balloons, totalBalloonsPlanned }) {
  const amortBase = principal / months
  const schedule = []
  let balance = principal
  let totalInterest = 0
  let totalRegular = 0
  let totalBalloon = 0

  for (let m = 1; m <= months; m++) {
    const interest = balance * rate
    const amountDue = balance + interest
    let amort = m === months ? balance : Math.min(amortBase, balance)
    let regular = amort + interest
    let balloon = balloons.get(m) || 0

    if (regular + balloon > amountDue) {
      if (balloon >= amountDue) {
        balloon = amountDue
        regular = 0
      } else {
        regular = amountDue - balloon
      }
    }

    const amortization = Math.max(0, regular - interest) + balloon
    balance = Math.max(0, amountDue - regular - balloon)
    totalInterest += interest
    totalRegular += regular
    totalBalloon += balloon
    schedule.push({ month: m, payment: regular, interest, amortization, balloon, balance })
  }

  return {
    property,
    down,
    principal,
    months,
    totalInterest,
    totalRegular,
    totalBalloon,
    totalBalloonsPlanned,
    schedule
  }
}
