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

export function exportAbCompareCsv(aSchedule, bSchedule) {
  if (!aSchedule?.length || !bSchedule?.length) return
  const len = Math.max(aSchedule.length, bSchedule.length)
  downloadCsv([
    [
      'Mês',
      'Parcela A', 'Juros A', 'Amortização A', 'Balão A', 'Saldo A',
      'Parcela B', 'Juros B', 'Amortização B', 'Balão B', 'Saldo B',
      'Δ Parcela'
    ],
    ...Array.from({ length: len }, (_, i) => {
      const a = aSchedule[i]
      const b = bSchedule[i]
      const month = (a ?? b).month
      return [
        month,
        a?.payment ?? '', a?.interest ?? '', a?.amortization ?? '', a?.balloon ?? '', a?.balance ?? '',
        b?.payment ?? '', b?.interest ?? '', b?.amortization ?? '', b?.balloon ?? '', b?.balance ?? '',
        a && b ? b.payment - a.payment : ''
      ]
    })
  ], 'comparacao-a-b.csv')
}
