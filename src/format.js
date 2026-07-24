export const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const number = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatMoneyInput(rawDigits) {
  const digits = String(rawDigits).replace(/\D/g, '')
  return number.format((Number(digits) || 0) / 100)
}

export function exportScheduleCsv(schedule) {
  if (!schedule?.length) return
  const rows = [
    ['Mês', 'Parcela', 'Juros', 'Amortização', 'Balão', 'Saldo'],
    ...schedule.map(r => [r.month, r.payment, r.interest, r.amortization, r.balloon, r.balance])
  ]
  const csv = '\ufeff' + rows.map(row => row.map(v => typeof v === 'number' ? String(v).replace('.', ',') : v).join(';')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'simulacao-financiamento.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}
