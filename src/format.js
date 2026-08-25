export const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const number = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const PT_SHORT_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function currentYearMonth() {
  if (typeof Temporal !== 'undefined') {
    const ym = Temporal.Now.plainDateISO().toPlainYearMonth()
    return { year: ym.year, month: ym.month }
  }
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

export function shiftYearMonth(ym, offset) {
  const months = Number(offset) || 0
  if (typeof Temporal !== 'undefined') {
    const next = Temporal.PlainYearMonth.from({
      year: ym.year,
      month: ym.month,
      calendar: 'iso8601'
    }).add({ months })
    return { year: next.year, month: next.month }
  }
  const idx = ym.year * 12 + (ym.month - 1) + months
  return {
    year: Math.floor(idx / 12),
    month: (idx % 12) + 1
  }
}

export function yearMonthInputValue(ym) {
  return `${ym.year}-${String(ym.month).padStart(2, '0')}`
}

export function parseYearMonthInput(value) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(value ?? ''))
  if (!m) return null
  return { year: Number(m[1]), month: Number(m[2]) }
}

export function formatYearMonth(ym) {
  return `${PT_SHORT_MONTHS[ym.month - 1]}/${ym.year}`
}

export function formatInstallmentMonth(start, installment) {
  return formatYearMonth(shiftYearMonth(start ?? currentYearMonth(), (Number(installment) || 1) - 1))
}

export function monthCashOut(row) {
  return (row.payment || 0) + (row.balloon || 0)
}

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

export function exportScheduleCsv(schedule, startMonth) {
  if (!schedule?.length) return
  const start = startMonth ?? currentYearMonth()
  downloadCsv([
    ['Mês', 'Calendário', 'Parcela', 'Juros', 'Amortização', 'Balão', 'Total no mês', 'Saldo'],
    ...schedule.map(r => [
      r.month,
      formatInstallmentMonth(start, r.month),
      r.payment,
      r.interest,
      r.amortization,
      r.balloon,
      monthCashOut(r),
      r.balance
    ])
  ], 'simulacao-financiamento.csv')
}

export function exportCompareCsv(priceSchedule, sacSchedule, startMonth) {
  if (!priceSchedule?.length || !sacSchedule?.length) return
  const start = startMonth ?? currentYearMonth()
  const len = Math.min(priceSchedule.length, sacSchedule.length)
  downloadCsv([
    [
      'Mês', 'Calendário',
      'Parcela Price', 'Juros Price', 'Amortização Price', 'Balão Price', 'Total Price', 'Saldo Price',
      'Parcela SAC', 'Juros SAC', 'Amortização SAC', 'Balão SAC', 'Total SAC', 'Saldo SAC',
      'Δ Parcela'
    ],
    ...Array.from({ length: len }, (_, i) => {
      const p = priceSchedule[i]
      const s = sacSchedule[i]
      return [
        p.month,
        formatInstallmentMonth(start, p.month),
        p.payment, p.interest, p.amortization, p.balloon, monthCashOut(p), p.balance,
        s.payment, s.interest, s.amortization, s.balloon, monthCashOut(s), s.balance,
        s.payment - p.payment
      ]
    })
  ], 'comparacao-price-sac.csv')
}

export function exportAbCompareCsv(aSchedule, bSchedule, startMonth) {
  if (!aSchedule?.length || !bSchedule?.length) return
  const start = startMonth ?? currentYearMonth()
  const len = Math.max(aSchedule.length, bSchedule.length)
  downloadCsv([
    [
      'Mês', 'Calendário',
      'Parcela A', 'Juros A', 'Amortização A', 'Balão A', 'Total A', 'Saldo A',
      'Parcela B', 'Juros B', 'Amortização B', 'Balão B', 'Total B', 'Saldo B',
      'Δ Parcela'
    ],
    ...Array.from({ length: len }, (_, i) => {
      const a = aSchedule[i]
      const b = bSchedule[i]
      const month = (a ?? b).month
      return [
        month,
        formatInstallmentMonth(start, month),
        a?.payment ?? '', a?.interest ?? '', a?.amortization ?? '', a?.balloon ?? '', a ? monthCashOut(a) : '', a?.balance ?? '',
        b?.payment ?? '', b?.interest ?? '', b?.amortization ?? '', b?.balloon ?? '', b ? monthCashOut(b) : '', b?.balance ?? '',
        a && b ? b.payment - a.payment : ''
      ]
    })
  ], 'comparacao-a-b.csv')
}
