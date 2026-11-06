import { annualToMonthly } from './math'

export const IR_BRACKETS = [
  { maxDays: 180, rate: 0.225 },
  { maxDays: 360, rate: 0.2 },
  { maxDays: 720, rate: 0.175 },
  { maxDays: Infinity, rate: 0.15 }
]

export function irRateForDays(days) {
  return IR_BRACKETS.find(bracket => days <= bracket.maxDays).rate
}

/**
 * Rendimento de cada aporte (extra pago no mês m) até o fim do contrato.
 * O aporte começa a render no mês seguinte ao pagamento.
 *
 * @param {{ contributions: Map<number, number>, months: number, annualRate: number, taxed?: boolean }} input
 */
export function investedGain({ contributions, months, annualRate, taxed = true }) {
  const monthly = annualToMonthly(annualRate)
  let contributed = 0
  let gross = 0
  let ir = 0

  for (const [month, amount] of contributions) {
    const heldMonths = months - month
    const gain = amount * ((1 + monthly) ** heldMonths - 1)
    contributed += amount
    gross += gain
    ir += taxed ? gain * irRateForDays(heldMonths * 30) : 0
  }

  return {
    contributed,
    gross,
    ir,
    net: gross - ir
  }
}

/**
 * Menor taxa anual bruta cujo rendimento líquido iguala os juros economizados.
 * Retorna NaN se nenhuma taxa até 100% a.a. for suficiente.
 */
export function breakEvenAnnualRate({ contributions, months, interestSaved, taxed = true }) {
  if (!(interestSaved > 0)) return 0
  const netAt = annualRate => investedGain({ contributions, months, annualRate, taxed }).net
  if (netAt(1) < interestSaved) return Number.NaN

  let low = 0
  let high = 1
  for (let i = 0; i < 100; i++) {
    const middle = (low + high) / 2
    if (netAt(middle) < interestSaved) low = middle
    else high = middle
  }
  return (low + high) / 2
}

/**
 * Compara amortizar (juros economizados) com investir os mesmos extras.
 * baseResult é o mesmo cenário sem extras.
 */
export function compareAmortizeInvest({ result, baseResult, contributions, months, annualRate, taxed = true }) {
  if (!result || result.error || !baseResult || baseResult.error) return null
  const interestSaved = baseResult.totalInterest - result.totalInterest
  const invested = investedGain({ contributions, months, annualRate, taxed })
  return {
    interestSaved,
    invested,
    annualRate,
    taxed,
    breakEvenAnnual: breakEvenAnnualRate({ contributions, months, interestSaved, taxed })
  }
}

export const DEFAULT_INVEST_INPUTS = {
  rate: '10',
  taxed: true
}

/** Converte o campo de rendimento (% a.a., bruto) para decimal. */
export function parseInvestRate(raw) {
  const parsed = Number(String(raw ?? '').trim().replace(',', '.'))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed / 100 : 0
}
