export const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const number = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatMoneyInput(rawDigits) {
  const digits = String(rawDigits).replace(/\D/g, '')
  return number.format((Number(digits) || 0) / 100)
}

function downloadCsv(rows, filename) {
  const csv = '\ufeff' + rows.map(row => row.map(v => typeof v === 'number' ? String(v).replace('.', ',') : v).join(';')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export function exportScheduleCsv(schedule) {
  if (!schedule?.length) return
  downloadCsv([
    ['Mês', 'Parcela', 'Juros', 'Amortização', 'Balão', 'Saldo'],
    ...schedule.map(r => [r.month, r.payment, r.interest, r.amortization, r.balloon, r.balance])
  ], 'simulacao-financiamento.csv')
}

export function exportCompareCsv(priceSchedule, sacSchedule) {
  if (!priceSchedule?.length || !sacSchedule?.length) return
  const len = Math.min(priceSchedule.length, sacSchedule.length)
  downloadCsv([
    [
      'Mês',
      'Parcela Price', 'Juros Price', 'Amortização Price', 'Balão Price', 'Saldo Price',
      'Parcela SAC', 'Juros SAC', 'Amortização SAC', 'Balão SAC', 'Saldo SAC',
      'Δ Parcela'
    ],
    ...Array.from({ length: len }, (_, i) => {
      const p = priceSchedule[i]
      const s = sacSchedule[i]
      return [
        p.month,
        p.payment, p.interest, p.amortization, p.balloon, p.balance,
        s.payment, s.interest, s.amortization, s.balloon, s.balance,
        s.payment - p.payment
      ]
    })
  ], 'comparacao-price-sac.csv')
}
