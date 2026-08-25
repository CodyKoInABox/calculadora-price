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

function csvMoney(value) {
  return Number(value).toFixed(2).replace('.', ',')
}

function scheduleMoney(row, key) {
  return row ? csvMoney(row[key] || 0) : ''
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
  return csv
}

export function exportScheduleCsv(schedule, startMonth) {
  if (!schedule?.length) return
  const start = startMonth ?? currentYearMonth()
  return downloadCsv([
    ['Mês', 'Calendário', 'Parcela regular', 'Juros', 'Amortização', 'Extra/Balão', 'Total no mês', 'Saldo'],
    ...schedule.map(r => [
      r.month,
      formatInstallmentMonth(start, r.month),
      csvMoney(r.payment),
      csvMoney(r.interest),
      csvMoney(r.amortization),
      csvMoney(r.balloon),
      csvMoney(monthCashOut(r)),
      csvMoney(r.balance)
    ])
  ], 'simulacao-financiamento.csv')
}

export function exportCompareCsv(priceSchedule, sacSchedule, startMonth) {
  if (!priceSchedule?.length || !sacSchedule?.length) return
  const start = startMonth ?? currentYearMonth()
  const len = Math.max(priceSchedule.length, sacSchedule.length)
  return downloadCsv([
    [
      'Mês', 'Calendário',
      'Parcela regular Price', 'Juros Price', 'Amortização Price', 'Extra/Balão Price', 'Total no mês Price', 'Saldo Price',
      'Parcela regular SAC', 'Juros SAC', 'Amortização SAC', 'Extra/Balão SAC', 'Total no mês SAC', 'Saldo SAC',
      'Δ Parcela regular', 'Δ Total no mês'
    ],
    ...Array.from({ length: len }, (_, i) => {
      const p = priceSchedule[i]
      const s = sacSchedule[i]
      const month = (p ?? s).month
      return [
        month,
        formatInstallmentMonth(start, month),
        scheduleMoney(p, 'payment'), scheduleMoney(p, 'interest'), scheduleMoney(p, 'amortization'),
        scheduleMoney(p, 'balloon'), p ? csvMoney(monthCashOut(p)) : '', scheduleMoney(p, 'balance'),
        scheduleMoney(s, 'payment'), scheduleMoney(s, 'interest'), scheduleMoney(s, 'amortization'),
        scheduleMoney(s, 'balloon'), s ? csvMoney(monthCashOut(s)) : '', scheduleMoney(s, 'balance'),
        csvMoney((s?.payment || 0) - (p?.payment || 0)),
        csvMoney((s ? monthCashOut(s) : 0) - (p ? monthCashOut(p) : 0))
      ]
    })
  ], 'comparacao-price-sac.csv')
}

export function exportAbCompareCsv(aSchedule, bSchedule, startMonth) {
  if (!aSchedule?.length || !bSchedule?.length) return
  const start = startMonth ?? currentYearMonth()
  const len = Math.max(aSchedule.length, bSchedule.length)
  return downloadCsv([
    [
      'Mês', 'Calendário',
      'Parcela regular A', 'Juros A', 'Amortização A', 'Extra/Balão A', 'Total no mês A', 'Saldo A',
      'Parcela regular B', 'Juros B', 'Amortização B', 'Extra/Balão B', 'Total no mês B', 'Saldo B',
      'Δ Parcela regular', 'Δ Total no mês'
    ],
    ...Array.from({ length: len }, (_, i) => {
      const a = aSchedule[i]
      const b = bSchedule[i]
      const month = (a ?? b).month
      return [
        month,
        formatInstallmentMonth(start, month),
        scheduleMoney(a, 'payment'), scheduleMoney(a, 'interest'), scheduleMoney(a, 'amortization'),
        scheduleMoney(a, 'balloon'), a ? csvMoney(monthCashOut(a)) : '', scheduleMoney(a, 'balance'),
        scheduleMoney(b, 'payment'), scheduleMoney(b, 'interest'), scheduleMoney(b, 'amortization'),
        scheduleMoney(b, 'balloon'), b ? csvMoney(monthCashOut(b)) : '', scheduleMoney(b, 'balance'),
        csvMoney((b?.payment || 0) - (a?.payment || 0)),
        csvMoney((b ? monthCashOut(b) : 0) - (a ? monthCashOut(a) : 0))
      ]
    })
  ], 'comparacao-a-b.csv')
}
