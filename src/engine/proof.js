// Prova real: confere as contas da tabela usando só as linhas do cronograma.
// Trabalha em centavos inteiros para não acumular ruído de ponto flutuante.

const TOLERANCE_CENTS = 1

const toCents = value => Math.round(Number(value || 0) * 100)
const fromCents = cents => cents / 100

function sumCents(rows, pick) {
  return rows.reduce((total, row) => total + toCents(pick(row)), 0)
}

function check(id, leftCents, rightCents) {
  const diff = leftCents - rightCents
  return {
    id,
    left: fromCents(leftCents),
    right: fromCents(rightCents),
    diff: fromCents(diff),
    ok: Math.abs(diff) <= TOLERANCE_CENTS
  }
}

/**
 * Confere as identidades do financiamento até um mês do cronograma.
 *
 * - amortizado + saldo devedor = principal + correção TR
 * - total pago + saldo devedor = principal + correção TR + juros
 * - quitado (saldo zero): juros = total pago − principal − correção TR, e os totais do resumo batem com a tabela
 *
 * @param {{ principal: number, schedule: Array<object>, totalInterest?: number, totalRegular?: number, totalBalloon?: number }} result
 * @param {number} [upToMonth] mês final da conferência (padrão: último mês)
 */
export function proofCheck(result, upToMonth) {
  const schedule = result?.schedule
  if (!schedule?.length) return null

  const total = schedule.length
  const requested = upToMonth == null || Number.isNaN(Number(upToMonth)) ? total : Math.trunc(Number(upToMonth))
  const upTo = Math.min(total, Math.max(1, requested))
  const rows = schedule.slice(0, upTo)
  const last = rows[rows.length - 1]

  const principal = toCents(result.principal)
  const correction = sumCents(rows, row => row.correction)
  const interest = sumCents(rows, row => row.interest)
  const amortized = sumCents(rows, row => row.amortization)
  const paid = sumCents(rows, row => row.payment) + sumCents(rows, row => row.balloon)
  const balance = toCents(last.balance)

  const checks = [
    check('amortization', amortized + balance, principal + correction),
    check('paid', paid + balance, principal + correction + interest)
  ]

  const settled = balance === 0 && upTo === total
  if (settled) {
    checks.push(check('interest', interest, paid - principal - correction))
    if (result.totalInterest !== undefined) {
      checks.push(check('totals', interest, toCents(result.totalInterest)))
    }
    if (result.totalRegular !== undefined && result.totalBalloon !== undefined) {
      checks.push(check('totals-paid', paid, toCents(result.totalRegular) + toCents(result.totalBalloon)))
    }
  }

  return {
    month: upTo,
    total,
    settled,
    principal: fromCents(principal),
    correction: fromCents(correction),
    interest: fromCents(interest),
    amortized: fromCents(amortized),
    paid: fromCents(paid),
    balance: fromCents(balance),
    totalFinancing: fromCents(principal + correction + interest),
    checks,
    ok: checks.every(item => item.ok)
  }
}
