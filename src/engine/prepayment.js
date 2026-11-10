import { addMonths } from './dates'
import {
  CONTRACT_SYSTEMS,
  buildContractTable,
  contractInstallments,
  fromCents,
  locatePeriod,
  PRORATA_BASES,
  periodsAhead,
  presentValueCents,
  recastBalance,
  toCents,
  walkBalance
} from './contract'

export const PREPAY_MODES = ['parcelas', 'valor']
export const PREPAY_EFFECTS = ['prazo', 'parcela']

const sum = (items, key) => items.reduce((total, item) => total + item[key], 0)

/**
 * Antecipação de parcelas ou de saldo, em uma data.
 *
 * Convenções (documentadas na memória de cálculo):
 * - Saldo devedor na data = valor presente, à taxa do contrato, das parcelas a vencer.
 *   Pró-rata 'dias': a fração já decorrida da parcela corrente entra por dias corridos, com juros
 *   compostos proporcionais: o período restante tem peso (1 - f), com f = dias decorridos / dias do período.
 *   Pró-rata 'parcelas': a parcela corrente conta inteira; o saldo é o da tabela na última data de vencimento.
 * - Antecipar uma parcela = pagar na data o seu valor presente. A diferença para o valor
 *   nominal são os juros economizados.
 * - Amortização por valor reduz o saldo presente. O efeito "prazo" mantém o valor das parcelas
 *   e encurta o contrato; "parcela" recalcula as parcelas restantes pelo sistema do contrato.
 *
 * Valores de entrada em reais; cálculos em centavos inteiros.
 */
export function simulatePrepayment({
  principal,
  rate,
  months,
  system = 'price',
  curveControls,
  firstDueIso,
  dateIso,
  mode = 'parcelas',
  marked = [],
  amount = 0,
  effect = 'prazo',
  proRata = 'dias'
}) {
  if (!CONTRACT_SYSTEMS.includes(system)) return { error: 'O sistema de amortização é inválido.' }
  if (!PREPAY_MODES.includes(mode)) return { error: 'O modo de antecipação é inválido.' }
  if (!PREPAY_EFFECTS.includes(effect)) return { error: 'O efeito da antecipação é inválido.' }
  if (!PRORATA_BASES.includes(proRata)) return { error: 'A base do pró-rata é inválida.' }

  const table = buildContractTable({ principal, rate, months, system, curveControls })
  if (table.error) return { error: table.error }

  const position = locatePeriod({ firstDueIso, months, dateIso })
  if (position.error) return position
  if (position.pastMaturity) {
    return { error: 'A data é posterior ao último vencimento; não há parcelas a antecipar.' }
  }

  const open = table.rows
    .filter(row => row.month >= position.k)
    .map(row => {
      const periods = periodsAhead(position, row.month, proRata)
      return {
        month: row.month,
        dueIso: addMonths(firstDueIso, row.month - 1),
        nominal: row.payment,
        interest: row.interest,
        periods,
        presentValue: presentValueCents(row.payment, rate, periods)
      }
    })

  const presentValueBefore = sum(open, 'presentValue')
  const nominalBefore = sum(open, 'nominal')
  const interestBefore = nominalBefore - presentValueBefore

  let anticipated = []
  let remaining = open
  let amortized

  if (mode === 'parcelas') {
    const markedMonths = [...marked]
    if (markedMonths.length === 0) return { error: 'Marque ao menos uma parcela para antecipar.' }
    if (new Set(markedMonths).size !== markedMonths.length) {
      return { error: 'Cada parcela só pode ser marcada uma vez.' }
    }
    const openMonths = new Set(open.map(row => row.month))
    if (markedMonths.some(month => !openMonths.has(month))) {
      return { error: 'Só é possível antecipar parcelas que ainda vão vencer na data escolhida.' }
    }
    const markSet = new Set(markedMonths)
    anticipated = open.filter(row => markSet.has(row.month))
    remaining = open.filter(row => !markSet.has(row.month))
    amortized = sum(anticipated, 'presentValue')
  } else {
    const amountCents = toCents(amount)
    if (!Number.isFinite(amount) || amountCents <= 0) {
      return { error: 'Informe um valor a amortizar maior que zero.' }
    }
    amortized = Math.min(amountCents, presentValueBefore)
  }

  const startCents = presentValueBefore - amortized
  const steps = remaining.map(row => ({ month: row.month, t: row.periods, nominal: row.nominal }))
  const rebuilt = effect === 'prazo'
    ? walkBalance({ start: startCents, rate, steps, paymentFor: index => steps[index].nominal })
    : recastBalance({ startCents, rate, steps, system, curveControls })
  if (rebuilt.error) return { error: rebuilt.error }

  const after = rebuilt.rows.map(row => ({
    ...row,
    dueIso: addMonths(firstDueIso, row.month - 1)
  }))
  const nominalAfter = sum(after, 'payment')
  const interestAfter = sum(after, 'interest')
  const saved = interestBefore - interestAfter

  const proofDifference = nominalBefore - (amortized + saved + nominalAfter)
  const balanceDifference = presentValueBefore - amortized - startCents

  return {
    mode,
    effect,
    system,
    proRata,
    position: {
      installment: position.k,
      fraction: position.f,
      dueIso: addMonths(firstDueIso, position.k - 1),
      periodStartIso: addMonths(firstDueIso, position.k - 2),
      periodDays: position.periodDays
    },
    before: {
      installments: open.length,
      nominal: fromCents(nominalBefore),
      presentValue: fromCents(presentValueBefore),
      interest: fromCents(interestBefore),
      schedule: open.map(toPublicRow)
    },
    anticipated: anticipated.map(row => ({
      month: row.month,
      dueIso: row.dueIso,
      nominal: fromCents(row.nominal),
      presentValue: fromCents(row.presentValue),
      discount: fromCents(row.nominal - row.presentValue)
    })),
    amortized: fromCents(amortized),
    total: remaining.length === 0 || startCents === 0,
    after: {
      installments: after.length,
      nominal: fromCents(nominalAfter),
      presentValue: fromCents(startCents),
      interest: fromCents(interestAfter),
      schedule: after.map(toPublicRow),
      termMonths: position.k - 1 + after.length
    },
    saved: fromCents(saved),
    proof: {
      original: fromCents(nominalBefore),
      amortized: fromCents(amortized),
      saved: fromCents(saved),
      remaining: fromCents(nominalAfter),
      difference: fromCents(proofDifference),
      balanceDifference: fromCents(balanceDifference)
    }
  }
}

function toPublicRow(row) {
  return {
    month: row.month,
    dueIso: row.dueIso,
    payment: fromCents(row.payment ?? row.nominal),
    interest: fromCents(row.interest),
    amortization: row.amortization == null ? undefined : fromCents(row.amortization),
    balance: row.balance == null ? undefined : fromCents(row.balance),
    presentValue: row.presentValue == null ? undefined : fromCents(row.presentValue)
  }
}

/** Saldo devedor na data: valor presente, à taxa do contrato, das parcelas que ainda vão vencer. */
export function balanceOnDate({
  principal,
  rate,
  months,
  system = 'price',
  curveControls,
  firstDueIso,
  dateIso,
  proRata = 'dias'
}) {
  if (!PRORATA_BASES.includes(proRata)) return { error: 'A base do pró-rata é inválida.' }
  const contract = contractInstallments({ principal, rate, months, system, curveControls, firstDueIso, dateIso })
  if (contract.error) return { error: contract.error }
  if (contract.position.pastMaturity) return { presentValue: 0 }
  const presentValue = contract.rows
    .filter(row => !row.due)
    .reduce((total, row) => total + presentValueCents(toCents(row.payment), rate, periodsAhead(contract.position, row.month, proRata)), 0)
  return { presentValue: fromCents(presentValue) }
}
