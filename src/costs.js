export const DEFAULT_COSTS = {
  upfront: 0,
  monthlyAdmin: 0,
  mipMonthly: 0,
  dfiAnnual: 0
}

const round2 = value => Math.round(value * 100) / 100

/**
 * Taxa mensal que iguala o valor líquido recebido às parcelas descontadas.
 * Bisseção: pv(r) = Σ pagamento_t/(1+r)^t − líquido é decrescente em r.
 */
export function monthlyIrr(netPrincipal, payments) {
  const pv = rate => {
    let factor = 1
    let sum = 0
    for (const payment of payments) {
      factor /= 1 + rate
      sum += payment * factor
    }
    return sum - netPrincipal
  }

  let low = -0.5
  let high = 1
  if (pv(high) > 0 || pv(low) < 0) return Number.NaN

  for (let i = 0; i < 200; i++) {
    const middle = (low + high) / 2
    if (pv(middle) > 0) low = middle
    else high = middle
  }
  return (low + high) / 2
}

/**
 * Custo efetivo total (CET) a partir do resultado do motor.
 * Seguros e taxas não entram no solver: são somados aos fluxos mensais só para o CET.
 *
 * @param {{ principal: number, property: number, schedule: Array<{ payment: number, balloon: number, balance: number }>, costs?: typeof DEFAULT_COSTS }} input
 */
export function computeCost({ principal, property, schedule, costs = DEFAULT_COSTS }) {
  const upfront = Math.max(0, Number(costs.upfront) || 0)
  const monthlyAdmin = Math.max(0, Number(costs.monthlyAdmin) || 0)
  const mipRate = Math.max(0, Number(costs.mipMonthly) || 0) / 100
  const dfiMonthly = (Math.max(0, Number(costs.dfiAnnual) || 0) / 100) * property / 12

  let balanceBefore = principal
  let totalMip = 0
  let totalDfi = 0
  let totalAdmin = 0

  const rows = schedule.map(row => {
    const mip = round2(balanceBefore * mipRate)
    const dfi = round2(dfiMonthly)
    const admin = round2(monthlyAdmin)
    balanceBefore = row.balance
    totalMip += mip
    totalDfi += dfi
    totalAdmin += admin
    const cashOut = row.payment + row.balloon + mip + dfi + admin
    return { cashOut, mip, dfi, admin }
  })

  const payments = rows.map(row => row.cashOut)
  const netPrincipal = principal - upfront
  const cetMonthly = monthlyIrr(netPrincipal, payments)
  const cetAnnual = Number.isFinite(cetMonthly) ? Math.expm1(12 * Math.log1p(cetMonthly)) : Number.NaN

  return {
    cetAnnual,
    cetMonthly,
    upfront: round2(upfront),
    totalMip: round2(totalMip),
    totalDfi: round2(totalDfi),
    totalAdmin: round2(totalAdmin),
    totalInsurance: round2(totalMip + totalDfi),
    totalCost: round2(upfront + totalMip + totalDfi + totalAdmin),
    rows
  }
}
