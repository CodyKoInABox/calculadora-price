import { addMonths, daysBetween } from './dates'
import {
  CONTRACT_SYSTEMS,
  PRORATA_BASES,
  buildContractTable,
  fromCents,
  locatePeriod,
  periodsAhead,
  presentValueCents,
  roundCents
} from './contract'

export const DEFAULT_COLLECTION_RULES = {
  minOverdue: 3,
  noticeDays: 10,
  moraDaysPerMonth: 30
}
export const FINE_CONSUMER_LIMIT_PCT = 2

/**
 * Cobrança e vencimento antecipado do saldo.
 *
 * - Saldo devedor na data = parcelas vencidas e não pagas (valor nominal) + parcelas a vencer (valor nominal).
 * - Juros futuros abatidos = nominal das parcelas a vencer − valor presente delas na data, à taxa do contrato.
 *   Pró-rata 'dias' (padrão): a parcela corrente entra com a fração decorrida em dias.
 *   Pró-rata 'parcelas': a parcela corrente conta inteira; o saldo é o da tabela no último vencimento.
 * - Encargos moratórios = multa sobre as vencidas não pagas + juros de mora pro-rata por dias de atraso
 *   (taxa mensal × dias / base de dias da mora, simples).
 * - Total exigível = saldo devedor − juros futuros abatidos + encargos moratórios.
 *
 * `overdue` lists the installments due on or before the calculation date, with paid: true/false.
 * `minOverdue`, `noticeDays` e `moraDaysPerMonth` são regras configuráveis (ver DEFAULT_COLLECTION_RULES).
 * `warnings` sinaliza, sem bloquear, multa acima de FINE_CONSUMER_LIMIT_PCT.
 */
export function calculateCollection({
  principal,
  rate,
  months,
  system = 'price',
  curveControls,
  firstDueIso,
  calcDateIso,
  noticeDateIso = null,
  overdue = [],
  finePct = 0,
  moraMonthlyPct = 0,
  proRata = 'dias',
  minOverdue = DEFAULT_COLLECTION_RULES.minOverdue,
  noticeDays: noticeDaysRule = DEFAULT_COLLECTION_RULES.noticeDays,
  moraDaysPerMonth = DEFAULT_COLLECTION_RULES.moraDaysPerMonth
}) {
  if (!CONTRACT_SYSTEMS.includes(system)) return { error: 'O sistema de amortização é inválido.' }
  if (!PRORATA_BASES.includes(proRata)) return { error: 'A base do pró-rata é inválida.' }
  if (!Number.isFinite(finePct) || finePct < 0) return { error: 'A multa deve ser um percentual não negativo.' }
  if (!Number.isFinite(moraMonthlyPct) || moraMonthlyPct < 0) {
    return { error: 'Os juros de mora devem ser um percentual mensal não negativo.' }
  }
  if (!Number.isInteger(minOverdue) || minOverdue < 1) {
    return { error: 'O mínimo de parcelas vencidas deve ser um número inteiro maior que zero.' }
  }
  if (!Number.isInteger(noticeDaysRule) || noticeDaysRule < 0) {
    return { error: 'O prazo de notificação deve ser um número inteiro de dias, zero ou mais.' }
  }
  if (!Number.isFinite(moraDaysPerMonth) || moraDaysPerMonth <= 0) {
    return { error: 'A base de dias da mora deve ser maior que zero.' }
  }

  const table = buildContractTable({ principal, rate, months, system, curveControls })
  if (table.error) return { error: table.error }

  const position = locatePeriod({ firstDueIso, months, dateIso: calcDateIso })
  if (position.error) return position

  const rowsByMonth = new Map(table.rows.map(row => [row.month, row]))
  const dueOf = month => addMonths(firstDueIso, month - 1)

  const seen = new Set()
  for (const item of overdue) {
    const month = Number(item.month)
    if (!Number.isInteger(month) || month < 1 || month > months) {
      return { error: 'Número de parcela em atraso inválido.' }
    }
    if (seen.has(month)) return { error: 'Cada parcela só pode aparecer uma vez na lista de atraso.' }
    seen.add(month)
    if (!item.paid && month >= position.k) {
      return { error: `A parcela ${month} ainda não venceu na data do cálculo.` }
    }
  }

  const unpaid = overdue
    .filter(item => !item.paid)
    .map(item => {
      const month = Number(item.month)
      const row = rowsByMonth.get(month)
      const dueIso = dueOf(month)
      const daysLate = daysBetween(dueIso, calcDateIso)
      const mora = roundCents(row.payment * (moraMonthlyPct / 100) * daysLate / moraDaysPerMonth)
      return { month, dueIso, nominal: row.payment, daysLate, mora }
    })
    .sort((a, b) => a.month - b.month)

  const overdueNominal = unpaid.reduce((total, item) => total + item.nominal, 0)
  const fine = roundCents(overdueNominal * (finePct / 100))
  const moraTotal = unpaid.reduce((total, item) => total + item.mora, 0)
  const charges = fine + moraTotal

  const future = position.pastMaturity
    ? []
    : table.rows
      .filter(row => row.month >= position.k)
      .map(row => {
        const periods = periodsAhead(position, row.month, proRata)
        return {
          month: row.month,
          dueIso: dueOf(row.month),
          nominal: row.payment,
          presentValue: presentValueCents(row.payment, rate, periods)
        }
      })

  const futureNominal = future.reduce((total, row) => total + row.nominal, 0)
  const futurePresentValue = future.reduce((total, row) => total + row.presentValue, 0)
  const abated = futureNominal - futurePresentValue

  const debtBalance = overdueNominal + futureNominal
  const demandAmount = debtBalance - abated + charges
  const independentDemand = overdueNominal + futurePresentValue + charges
  const noticeDays = noticeDateIso ? daysBetween(noticeDateIso, calcDateIso) : null

  const checks = {
    overdueCount: unpaid.length,
    overdueOk: unpaid.length >= minOverdue,
    noticeDays,
    noticeOk: noticeDays != null && noticeDays >= noticeDaysRule
  }

  return {
    proRata,
    rules: { minOverdue, noticeDays: noticeDaysRule, moraDaysPerMonth },
    checks: {
      ...checks,
      eligible: checks.overdueOk && checks.noticeOk
    },
    warnings: {
      fineAboveConsumerLimit: finePct > FINE_CONSUMER_LIMIT_PCT
    },
    unpaid: unpaid.map(item => ({
      month: item.month,
      dueIso: item.dueIso,
      nominal: fromCents(item.nominal),
      daysLate: item.daysLate,
      mora: fromCents(item.mora)
    })),
    future: {
      installments: future.length,
      nominal: fromCents(futureNominal),
      presentValue: fromCents(futurePresentValue),
      firstDueIso: future.length ? future[0].dueIso : null,
      lastDueIso: future.length ? future[future.length - 1].dueIso : null
    },
    balance: fromCents(debtBalance),
    abated: fromCents(abated),
    charges: { fine: fromCents(fine), mora: fromCents(moraTotal), total: fromCents(charges) },
    demand: fromCents(demandAmount),
    proof: {
      demand: fromCents(demandAmount),
      independentDemand: fromCents(independentDemand),
      difference: fromCents(demandAmount - independentDemand)
    }
  }
}
