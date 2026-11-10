export const curvePresets = {
  linear: [0.60, 0.85, 1.10, 1.35, 1.60, 1.85],
  hill: [0.65, 1.10, 1.75, 1.55, 1.05, 0.75],
  'fast-start': [0.55, 1.10, 1.50, 1.72, 1.86, 1.95],
  'fast-end': [0.55, 0.62, 0.78, 1.05, 1.48, 2.15]
}

export const CURVE_MIN = 0.25
export const CURVE_MAX = 2.5

const MAX_MONTHS = 600
const MONEY_ERROR = 'Os valores monetários devem ser finitos, não negativos e representáveis em centavos.'

function strictMoney(value) {
  if (typeof value === 'number') return value
  const normalized = String(value ?? '')
    .trim()
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '')
  if (!normalized) return Number.NaN
  return Number(normalized)
}

function toCents(value) {
  if (!Number.isFinite(value) || value < 0) return null
  const adjusted = value + Number.EPSILON * Math.max(1, Math.abs(value))
  const cents = Math.round(adjusted * 100)
  return Number.isSafeInteger(cents) ? cents : null
}

function fromCents(cents) {
  return cents / 100
}

function addSafe(left, right) {
  const sum = left + right
  return Number.isSafeInteger(sum) ? sum : null
}

export function parseMoney(value) {
  const parsed = strictMoney(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function pricePayment(principal, rate, months) {
  if (
    !Number.isFinite(principal) ||
    principal < 0 ||
    !Number.isFinite(rate) ||
    rate < 0 ||
    !Number.isInteger(months) ||
    months < 1
  ) {
    return Number.NaN
  }
  if (rate === 0) return principal / months

  const exponent = -months * Math.log1p(rate)
  const denominator = -Math.expm1(exponent)
  const payment = principal * rate / denominator
  return Number.isFinite(payment) ? payment : Number.NaN
}

/** Effective a.a. -> a.m.: (1+i)^(1/12)-1 (not i/12). */
export function annualToMonthly(iAa) {
  if (!Number.isFinite(iAa) || iAa < 0) return Number.NaN
  return Math.expm1(Math.log1p(iAa) / 12)
}

/** Effective a.m. -> a.a.: (1+i)^12-1. */
export function monthlyToAnnual(iAm) {
  if (!Number.isFinite(iAm) || iAm < 0) return Number.NaN
  return Math.expm1(12 * Math.log1p(iAm))
}

export function clampCurveValue(value, step = 0.05) {
  const rounded = step ? Math.round(value / step) * step : value
  return Math.max(CURVE_MIN, Math.min(CURVE_MAX, rounded))
}

/**
 * Bounded cubic interpolation between adjacent controls.
 * Smoothstep cannot overshoot either endpoint.
 */
export function curveWeightAt(progress, curveControls) {
  if (
    !Number.isFinite(progress) ||
    !Array.isArray(curveControls) ||
    curveControls.length < 2 ||
    curveControls.some(value => !Number.isFinite(value))
  ) {
    return Number.NaN
  }

  const clampedProgress = Math.max(0, Math.min(1, progress))
  const scaled = clampedProgress * (curveControls.length - 1)
  const index = Math.min(curveControls.length - 2, Math.floor(scaled))
  const t = scaled - index
  const eased = t * t * (3 - 2 * t)
  const value = curveControls[index] + (curveControls[index + 1] - curveControls[index]) * eased
  return Math.max(CURVE_MIN, Math.min(CURVE_MAX, value))
}

function extrasError(message) {
  return { error: message }
}

/**
 * Expand extra-payment rows (once / monthly / yearly / every N) into month -> amount map.
 * Valid calls still return a Map. Invalid calls return { error } so simulateFinancing can
 * propagate the validation failure without moving an extra to another month.
 *
 * @param {boolean} enabled
 * @param {Array<{ recurrence?: string, month?: number|string, everyN?: number|string, amount?: string|number }>} extras
 * @param {number} months
 */
export function extrasToMap(enabled, extras, months) {
  if (!enabled) return new Map()
  if (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS) {
    return extrasError(`O prazo deve ser um número inteiro entre 1 e ${MAX_MONTHS} meses.`)
  }
  if (!Array.isArray(extras)) return extrasError('A lista de pagamentos extras é inválida.')

  const map = new Map()
  const add = (month, value) => {
    if (value === 0) return true
    const next = (map.get(month) || 0) + value
    if (!Number.isFinite(next) || toCents(next) === null) return false
    map.set(month, next)
    return true
  }

  for (const item of extras) {
    if (!item || typeof item !== 'object') return extrasError('Pagamento extra inválido.')

    const value = strictMoney(item.amount)
    if (!Number.isFinite(value) || value < 0 || toCents(value) === null) {
      return extrasError(MONEY_ERROR)
    }

    const start = Number(item.month)
    if (!Number.isInteger(start) || start < 1 || start > months) {
      return extrasError(`O mês do pagamento extra deve ser um inteiro entre 1 e ${months}.`)
    }

    const recurrence = item.recurrence || 'once'
    let step
    if (recurrence === 'once') step = null
    else if (recurrence === 'monthly') step = 1
    else if (recurrence === 'yearly') step = 12
    else if (recurrence === 'every') {
      step = Number(item.everyN)
      if (!Number.isInteger(step) || step < 2) {
        return extrasError('O intervalo do pagamento extra deve ser um inteiro de pelo menos 2 meses.')
      }
    } else {
      return extrasError('A recorrência do pagamento extra é inválida.')
    }

    if (step === null) {
      if (!add(start, value)) return extrasError(MONEY_ERROR)
      continue
    }
    for (let month = start; month <= months; month += step) {
      if (!add(month, value)) return extrasError(MONEY_ERROR)
    }
  }

  return map
}

function validateCurveControls(curveControls) {
  return (
    Array.isArray(curveControls) &&
    curveControls.length === 6 &&
    curveControls.every(
      value => Number.isFinite(value) && value >= CURVE_MIN && value <= CURVE_MAX
    )
  )
}

function normalizeBalloons(balloons, months) {
  if (balloons?.error) return { error: balloons.error }
  if (!(balloons instanceof Map)) return { error: 'Os pagamentos extras são inválidos.' }

  const normalized = new Map()
  let total = 0
  for (const [month, amount] of balloons) {
    if (!Number.isInteger(month) || month < 1 || month > months) {
      return { error: `O mês do pagamento extra deve ser um inteiro entre 1 e ${months}.` }
    }
    const cents = toCents(amount)
    if (cents === null) return { error: MONEY_ERROR }
    const previous = normalized.get(month) || 0
    const combined = addSafe(previous, cents)
    if (combined === null) return { error: MONEY_ERROR }
    normalized.set(month, combined)
    total = addSafe(total, cents)
    if (total === null) return { error: MONEY_ERROR }
  }
  return { balloons: normalized, total }
}

function validateCommon({ months, rate, mode, balloons, curveControls, extraEffect }) {
  if (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS) {
    return { error: `O prazo deve ser um número inteiro entre 1 e ${MAX_MONTHS} meses.` }
  }
  if (!Number.isFinite(rate) || rate < 0) return { error: 'A taxa de juros deve ser finita e não negativa.' }
  if (!['price', 'growing', 'sac', 'sacre'].includes(mode)) return { error: 'O sistema de amortização é inválido.' }
  if (!validateCurveControls(curveControls)) {
    return {
      error: `A curva deve ter seis controles finitos entre ${CURVE_MIN} e ${CURVE_MAX}.`
    }
  }
  if (!['payment', 'term'].includes(extraEffect)) {
    return { error: 'O efeito do pagamento extra é inválido.' }
  }
  return normalizeBalloons(balloons, months)
}

function roundedInterest(balance, rate) {
  const interest = Math.round(balance * rate)
  return Number.isSafeInteger(interest) && interest >= 0 ? interest : null
}

function pricePaymentInCents(principal, rate, months) {
  const payment = pricePayment(fromCents(principal), rate, months)
  if (!Number.isFinite(payment)) return null
  return toCents(payment)
}

function roundedRatio(value, divisor) {
  const result = Math.round(value / divisor)
  return Number.isSafeInteger(result) && result >= 0 ? result : null
}

function curveWeights(months, controls) {
  return Array.from(
    { length: months },
    (_, index) => curveWeightAt(months === 1 ? 0 : index / (months - 1), controls)
  )
}

function evaluateCurvePlan(balanceAtStart, startMonth, endMonth, rate, weights, scale) {
  const plan = new Map()
  let balance = balanceAtStart

  for (let month = startMonth; month <= endMonth && balance > 0; month++) {
    const interest = roundedInterest(balance, rate)
    const weighted = Math.round(weights[month - 1] * scale)
    if (
      interest === null ||
      !Number.isSafeInteger(weighted) ||
      weighted < 0
    ) {
      return { error: 'O cálculo da curva excedeu o limite numérico.' }
    }

    const floorApplied = weighted < interest
    const due = addSafe(balance, interest)
    if (due === null) return { error: 'O cálculo da curva excedeu o limite numérico.' }
    const payment = Math.min(due, Math.max(weighted, interest))
    plan.set(month, { payment, floorApplied })
    balance = due - payment
  }

  return { plan, balance }
}

const MAX_CURVE_SCALE = Math.floor(Number.MAX_SAFE_INTEGER / 2)

/**
 * Leftover balance after the curve, without building the plan. Same checks and
 * arithmetic as evaluateCurvePlan, so the two always agree on balance and errors.
 */
function curveResidual(balanceAtStart, startMonth, endMonth, rate, weights, scale) {
  let balance = balanceAtStart

  for (let month = startMonth; month <= endMonth && balance > 0; month++) {
    const interest = roundedInterest(balance, rate)
    const weighted = Math.round(weights[month - 1] * scale)
    if (interest === null || !Number.isSafeInteger(weighted) || weighted < 0) {
      return { error: 'O cálculo da curva excedeu o limite numérico.' }
    }
    const due = addSafe(balance, interest)
    if (due === null) return { error: 'O cálculo da curva excedeu o limite numérico.' }
    balance = due - Math.min(due, Math.max(weighted, interest))
  }

  return { balance }
}

/**
 * Smallest integer scale >= lowerBound whose residual is <= 0, found by galloping
 * from lowerBound and then bisecting. The residual is nonincreasing in scale, so this
 * is the same scale the doubling search returns whenever lowerBound does not exceed it.
 * Returns null if any evaluation fails, so the caller can fall back to the full search.
 */
function minimalCurveScale(balance, startMonth, endMonth, rate, weights, lowerBound) {
  const residualAt = scale => curveResidual(balance, startMonth, endMonth, rate, weights, scale)

  let low = lowerBound
  let probe = residualAt(low)
  if (probe.error) return null
  if (probe.balance <= 0) return low

  let step = 1
  let high
  for (;;) {
    const candidate = low + step
    if (candidate > MAX_CURVE_SCALE) return null
    probe = residualAt(candidate)
    if (probe.error) return null
    if (probe.balance <= 0) {
      high = candidate
      break
    }
    low = candidate
    step *= 2
  }

  while (low + 1 < high) {
    const middle = low + Math.floor((high - low) / 2)
    probe = residualAt(middle)
    if (probe.error) return null
    if (probe.balance > 0) low = middle
    else high = middle
  }

  return high
}

/**
 * The doubling search only evaluates scales up to the next power of two above the answer.
 * If the principal's interest and that largest scale's weighted payments are safe integers,
 * none of those evaluations can fail, so the fast result equals the doubling search's result.
 */
function curveSearchIsSafe(balance, rate, scale) {
  const interest = roundedInterest(balance, rate)
  if (interest === null || addSafe(balance, interest) === null) return false

  let high = 1
  while (high < scale) high *= 2
  return (
    high <= MAX_CURVE_SCALE &&
    Number.isSafeInteger(Math.round(CURVE_MAX * high))
  )
}

function searchCurveScaleByDoubling(balance, startMonth, endMonth, rate, weights) {
  let low = 0
  let high = 1
  let evaluated = evaluateCurvePlan(balance, startMonth, endMonth, rate, weights, high)
  if (evaluated.error) return evaluated

  while (evaluated.balance > 0) {
    if (high > MAX_CURVE_SCALE) {
      return { error: 'Não foi possível calcular uma curva financeira finita.' }
    }
    high *= 2
    evaluated = evaluateCurvePlan(balance, startMonth, endMonth, rate, weights, high)
    if (evaluated.error) return evaluated
  }

  while (low + 1 < high) {
    const middle = low + Math.floor((high - low) / 2)
    const candidate = evaluateCurvePlan(balance, startMonth, endMonth, rate, weights, middle)
    if (candidate.error) return candidate
    if (candidate.balance > 0) low = middle
    else high = middle
  }

  const final = evaluateCurvePlan(balance, startMonth, endMonth, rate, weights, high)
  if (final.error) return final
  return { plan: final.plan, scale: high }
}

function buildCurvePlan(balance, startMonth, endMonth, rate, weights, lowerBound = 1) {
  const scale = minimalCurveScale(balance, startMonth, endMonth, rate, weights, lowerBound)
  if (scale !== null && curveSearchIsSafe(balance, rate, scale)) {
    const final = evaluateCurvePlan(balance, startMonth, endMonth, rate, weights, scale)
    if (!final.error) return { plan: final.plan, scale }
  }
  return searchCurveScaleByDoubling(balance, startMonth, endMonth, rate, weights)
}

/**
 * For a fixed term, rate and curve, the minimal curve scale never decreases as the
 * principal grows. A scale recorded for a smaller principal is therefore a valid lower
 * bound for a larger one. Hints must not be shared across different terms, rates or curves.
 */
function createCurveHints() {
  return { principals: [], scales: [] }
}

function curveHintFloor(hints, principal) {
  let low = 0
  let high = hints.principals.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (hints.principals[middle] <= principal) low = middle + 1
    else high = middle
  }
  return low === 0 ? 1 : hints.scales[low - 1]
}

function recordCurveHint(hints, principal, scale) {
  let index = hints.principals.length
  while (index > 0 && hints.principals[index - 1] > principal) index--
  if (index > 0 && hints.principals[index - 1] === principal) return
  hints.principals.splice(index, 0, principal)
  hints.scales.splice(index, 0, scale)
}

function capMonthPayments(regular, balloon, amountDue) {
  const paidRegular = Math.min(Math.max(0, regular), amountDue)
  const paidBalloon = Math.min(Math.max(0, balloon), amountDue - paidRegular)
  return { regular: paidRegular, balloon: paidBalloon }
}

function publicSchedule(schedule) {
  return schedule.map(row => ({
    month: row.month,
    payment: fromCents(row.payment),
    interest: fromCents(row.interest),
    amortization: fromCents(row.amortization),
    balloon: fromCents(row.balloon),
    balance: fromCents(row.balance),
    ...(row.correction ? { correction: fromCents(row.correction) } : {}),
    ...(row.interestFloorApplied ? { interestFloorApplied: true } : {})
  }))
}

function buildResult({
  property,
  down,
  principal,
  months,
  extraEffect,
  totalInterest,
  totalRegular,
  totalBalloon,
  totalBalloonsPlanned,
  totalCorrection = 0,
  curveFloorApplied,
  schedule
}) {
  return {
    property: fromCents(property),
    down: fromCents(down),
    principal: fromCents(principal),
    months,
    effectiveMonths: schedule.length,
    extraEffect,
    totalInterest: fromCents(totalInterest),
    totalRegular: fromCents(totalRegular),
    totalBalloon: fromCents(totalBalloon),
    totalBalloonsPlanned: fromCents(totalBalloonsPlanned),
    totalCorrection: fromCents(totalCorrection),
    curveFloorApplied,
    schedule: publicSchedule(schedule)
  }
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
 * @param {{ property: number, down: number, months: number, rate: number, mode: 'price'|'growing'|'sac', balloons: Map<number, number>, curveControls: number[], extraEffect?: 'payment'|'term' }} input
 */
export function simulateFinancing(input) {
  return runSimulation(input, null)
}

function runSimulation({
  property,
  down,
  months,
  rate,
  mode,
  balloons,
  curveControls,
  extraEffect = 'payment',
  correctionRate = 0
}, curveHints) {
  const propertyCents = toCents(property)
  const downCents = toCents(down)
  if (propertyCents === null || downCents === null) return { error: MONEY_ERROR }
  if (propertyCents <= 0 || downCents >= propertyCents) {
    return { error: 'Informe um valor a financiar maior que a entrada.' }
  }

  const common = validateCommon({
    months,
    rate,
    mode,
    balloons,
    curveControls,
    extraEffect
  })
  if (common.error) return { error: common.error }
  if (!Number.isFinite(correctionRate) || correctionRate < 0 || (correctionRate > 0 && mode !== 'sacre')) {
    return { error: 'A correção TR só está disponível no sistema SACRE e deve ser um percentual não negativo.' }
  }

  const principal = propertyCents - downCents
  const weights = mode === 'growing' ? curveWeights(months, curveControls) : null
  let priceContract = mode === 'price' || mode === 'sacre' ? pricePaymentInCents(principal, rate, months) : null
  let sacAmortization = mode === 'sac' ? roundedRatio(principal, months) : null
  let curveContract = null

  if ((mode === 'price' || mode === 'sacre') && priceContract === null) {
    return { error: 'Não foi possível calcular uma parcela PRICE finita.' }
  }
  if (mode === 'sac' && sacAmortization === null) {
    return { error: 'Não foi possível calcular uma amortização SAC finita.' }
  }
  if (mode === 'growing') {
    const lowerBound = curveHints ? curveHintFloor(curveHints, principal) : 1
    const built = buildCurvePlan(principal, 1, months, rate, weights, lowerBound)
    if (built.error) return { error: built.error }
    curveContract = built.plan
    if (curveHints) recordCurveHint(curveHints, principal, built.scale)
  }

  const schedule = []
  let balance = principal
  let totalInterest = 0
  let totalRegular = 0
  let totalBalloon = 0
  let curveFloorApplied = false
  let totalCorrection = 0

  for (let month = 1; month <= months && balance > 0; month++) {
    let correction = 0
    if (mode === 'sacre' && correctionRate > 0) {
      correction = roundedInterest(balance, correctionRate)
      if (correction === null) return { error: 'A correção TR excedeu o limite numérico.' }
      balance = addSafe(balance, correction)
      if (balance === null) return { error: 'O saldo excedeu o limite numérico.' }
      totalCorrection = addSafe(totalCorrection, correction)
      if (totalCorrection === null) return { error: 'Os totais excederam o limite numérico.' }
    }
    // SACRE: installment is recalculated at each anniversary over the TR-corrected balance.
    if (mode === 'sacre' && (month - 1) % 12 === 0) {
      priceContract = pricePaymentInCents(balance, rate, months - month + 1)
      if (priceContract === null) return { error: 'Não foi possível recalcular a parcela SACRE.' }
    }
    const interest = roundedInterest(balance, rate)
    if (interest === null) return { error: 'O cálculo dos juros excedeu o limite numérico.' }

    let regular
    let rowFloorApplied = false
    if (mode === 'price' || mode === 'sacre') {
      regular = priceContract
    } else if (mode === 'sac') {
      regular = addSafe(interest, sacAmortization)
      if (regular === null) return { error: 'O cálculo SAC excedeu o limite numérico.' }
    } else {
      const curveMonth = curveContract.get(month)
      if (!curveMonth) return { error: 'A curva não conseguiu cobrir o prazo restante.' }
      regular = curveMonth.payment
      rowFloorApplied = curveMonth.floorApplied
    }

    const plannedBalloon = common.balloons.get(month) || 0
    const amountDue = addSafe(balance, interest)
    if (amountDue === null) return { error: 'O saldo excedeu o limite numérico.' }
    if (month === months) {
      regular = amountDue - Math.min(plannedBalloon, amountDue)
    }
    const paid = capMonthPayments(regular, plannedBalloon, amountDue)
    const amortization = paid.regular + paid.balloon - interest
    const nextBalance = amountDue - paid.regular - paid.balloon

    totalInterest = addSafe(totalInterest, interest)
    totalRegular = addSafe(totalRegular, paid.regular)
    totalBalloon = addSafe(totalBalloon, paid.balloon)
    if (totalInterest === null || totalRegular === null || totalBalloon === null) {
      return { error: 'Os totais excederam o limite numérico.' }
    }

    schedule.push({
      month,
      payment: paid.regular,
      interest,
      amortization,
      balloon: paid.balloon,
      balance: nextBalance,
      correction,
      interestFloorApplied: rowFloorApplied
    })
    curveFloorApplied ||= rowFloorApplied
    balance = nextBalance

    if (balance === 0) break
    if (extraEffect !== 'payment' || paid.balloon === 0 || month === months) continue

    const remainingMonths = months - month
    if (mode === 'price' || mode === 'sacre') {
      priceContract = pricePaymentInCents(balance, rate, remainingMonths)
      if (priceContract === null) {
        return { error: 'Não foi possível recalcular uma parcela PRICE finita.' }
      }
    } else if (mode === 'sac') {
      sacAmortization = roundedRatio(balance, remainingMonths)
      if (sacAmortization === null) {
        return { error: 'Não foi possível recalcular uma amortização SAC finita.' }
      }
    } else {
      const built = buildCurvePlan(balance, month + 1, months, rate, weights)
      if (built.error) return { error: built.error }
      curveContract = built.plan
    }
  }

  if (balance !== 0) return { error: 'Não foi possível liquidar o saldo no prazo informado.' }

  return buildResult({
    property: propertyCents,
    down: downCents,
    principal,
    months,
    extraEffect,
    totalInterest,
    totalRegular,
    totalBalloon,
    totalBalloonsPlanned: common.total,
    totalCorrection,
    curveFloorApplied,
    schedule
  })
}

function binarySearchMaxPrincipal(isFeasible, maximum) {
  if (maximum !== null) {
    if (isFeasible(maximum)) return maximum
    let low = 0
    let high = maximum
    while (low + 1 < high) {
      const middle = low + Math.floor((high - low) / 2)
      if (isFeasible(middle)) low = middle
      else high = middle
    }
    return low
  }

  let low = 0
  let high = 1
  while (isFeasible(high)) {
    low = high
    if (high > Math.floor(Number.MAX_SAFE_INTEGER / 2)) return low
    high *= 2
  }
  while (low + 1 < high) {
    const middle = low + Math.floor((high - low) / 2)
    if (isFeasible(middle)) low = middle
    else high = middle
  }
  return low
}

/**
 * Invert financing by searching principal in whole cents. Extras do not count
 * toward targetPayment; only schedule[].payment is constrained.
 *
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
  extraEffect = 'payment',
  correctionRate = 0
}) {
  if (!Number.isFinite(targetPayment) || targetPayment <= 0) {
    return { error: 'Informe uma parcela regular máxima maior que zero.' }
  }
  const targetCents = Math.floor(
    (targetPayment + Number.EPSILON * Math.max(1, Math.abs(targetPayment))) * 100
  )
  if (!Number.isSafeInteger(targetCents) || targetCents <= 0) return { error: MONEY_ERROR }
  if (!['principal', 'down'].includes(solveFor)) return { error: 'A variável inversa é inválida.' }

  const common = validateCommon({
    months,
    rate,
    mode,
    balloons,
    curveControls,
    extraEffect
  })
  if (common.error) return { error: common.error }

  const propertyCents = toCents(property)
  const downCents = toCents(down)
  if (solveFor === 'down' && (propertyCents === null || propertyCents <= 0)) {
    return { error: 'Informe um valor total do bem válido.' }
  }
  if (solveFor === 'principal' && downCents === null) {
    return { error: 'Informe uma entrada válida.' }
  }

  const normalizedBalloons = new Map(
    [...common.balloons].map(([month, cents]) => [month, fromCents(cents)])
  )
  const shared = {
    months,
    rate,
    mode,
    balloons: normalizedBalloons,
    curveControls,
    extraEffect,
    correctionRate
  }

  const curveHints = createCurveHints()
  const probe = principalCents => {
    if (principalCents <= 0) return { schedule: [], principal: 0 }
    if (solveFor === 'down') {
      return runSimulation({
        ...shared,
        property: fromCents(propertyCents),
        down: fromCents(propertyCents - principalCents)
      }, curveHints)
    }

    const totalProperty = addSafe(downCents, principalCents)
    if (totalProperty === null) return { error: MONEY_ERROR }
    return runSimulation({
      ...shared,
      property: fromCents(totalProperty),
      down: fromCents(downCents)
    }, curveHints)
  }

  const isFeasible = principalCents => {
    if (principalCents === 0) return true
    const result = probe(principalCents)
    if (result.error) return false
    const maxPaymentCents = toCents(maxRegularPayment(result.schedule))
    return maxPaymentCents !== null && maxPaymentCents <= targetCents
  }

  const maximum = solveFor === 'down' ? propertyCents : null
  let principalCents = binarySearchMaxPrincipal(isFeasible, maximum)

  // Cent rounding makes the custom curve locally non-monotone near a scale
  // boundary. Scan past that bounded rounding noise after the fast binary search.
  if (mode === 'growing') {
    const maxInfeasibleGap = 1_000 + months * 5
    let candidate = principalCents + 1
    let infeasibleGap = 0
    while (
      (maximum === null || candidate <= maximum) &&
      infeasibleGap < maxInfeasibleGap
    ) {
      if (isFeasible(candidate)) {
        principalCents = candidate
        infeasibleGap = 0
      } else {
        infeasibleGap++
      }
      candidate++
    }
  }

  if (principalCents <= 0) {
    return { error: 'Com essa parcela regular máxima o valor financiável fica zerado.' }
  }

  const result = probe(principalCents)
  if (result.error) return result

  return {
    ...result,
    solved: solveFor,
    targetPayment: fromCents(targetCents),
    maxPayment: maxRegularPayment(result.schedule)
  }
}
