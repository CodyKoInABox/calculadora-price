import { brl, formatInstallmentMonth, percentAa } from './format'
import { buildReportPdf } from './pdfReport'

function download(filename, bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const today = () => new Date().toLocaleDateString('pt-BR')
const FOOTER = 'Calculadora PRICE × SAC · simulação, não é oferta de crédito'
const hasCost = result => Boolean(result?.cost && Number.isFinite(result.cost.cetAnnual))

function totalPaid(result) {
  return result.down + result.totalRegular + result.totalBalloon
}

/** Single schedule: summary block plus the full month-by-month table. */
export function exportScheduleReport(result, { startMonth, modeLabel, rateLabel } = {}) {
  if (!result || result.error) return
  const withCorrection = result.totalCorrection > 0
  const summary = [
    ['Valor do imóvel', brl.format(result.property)],
    ['Entrada', brl.format(result.down)],
    ['Valor financiado', brl.format(result.principal)],
    ['Prazo', result.effectiveMonths !== result.months ? `${result.months} → ${result.effectiveMonths} meses` : `${result.months} meses`],
    ['Taxa', rateLabel || '—'],
    ['Sistema', modeLabel || 'Price'],
    ['Juros totais', brl.format(result.totalInterest)],
    ['Total pago', brl.format(totalPaid(result))],
    ['CET (custo efetivo total)', hasCost(result) ? percentAa(result.cost.cetAnnual) : '—'],
    ['Seguros e taxas', result.cost ? brl.format(result.cost.totalCost) : '—'],
    ...(withCorrection ? [['Correção TR acumulada', brl.format(result.totalCorrection)]] : [])
  ]
  const headers = ['Mês', 'Data', 'Parcela', 'Juros', ...(withCorrection ? ['Correção TR'] : []), 'Amortização', 'Extra', 'Saldo']
  const rows = result.schedule.map(row => {
    const cells = [
      String(row.month),
      formatInstallmentMonth(startMonth, row.month) || '',
      brl.format(row.payment),
      brl.format(row.interest),
      ...(withCorrection ? [brl.format(row.correction || 0)] : []),
      brl.format(row.amortization),
      row.balloon > 0 ? brl.format(row.balloon) : '',
      brl.format(row.balance)
    ]
    return { cells }
  })
  const bytes = buildReportPdf({
    title: 'Simulação de financiamento',
    subtitle: `Gerado em ${today()}`,
    summary,
    table: { title: 'Tabela de amortização', headers, rows },
    footerNote: FOOTER
  })
  download('simulacao-financiamento.pdf', bytes)
}

const SIDE_METRICS = [
  ['Primeira parcela', r => brl.format(r.schedule[0]?.payment || 0)],
  ['Última parcela', r => brl.format(r.schedule.at(-1)?.payment || 0)],
  ['Juros totais', r => brl.format(r.totalInterest)],
  ['Total pago', r => brl.format(totalPaid(r))],
  ['CET (a.a.)', r => (hasCost(r) ? percentAa(r.cost.cetAnnual) : '—')],
  ['Seguros e taxas', r => (r.cost ? brl.format(r.cost.totalCost) : '—')]
]

function sideBySide(left, right, leftLabel, rightLabel, rateLabel) {
  const bytes = buildReportPdf({
    title: 'Comparação de financiamentos',
    subtitle: `Gerado em ${today()}${rateLabel ? ` · taxa ${rateLabel}` : ''}`,
    table: {
      title: 'Indicadores lado a lado',
      headers: ['Indicador', leftLabel, rightLabel],
      rows: SIDE_METRICS.map(([label, fn]) => ({ cells: [label, fn(left), fn(right)] }))
    },
    footerNote: FOOTER
  })
  download('comparacao-financiamento.pdf', bytes)
}

/** Price × SAC comparison: side-by-side indicators (full schedules stay in CSV). */
export function exportCompareReport(compareResult, { rateLabel } = {}) {
  if (!compareResult?.price || !compareResult?.sac) return
  sideBySide(compareResult.price, compareResult.sac, 'Price', 'SAC', rateLabel)
}

/** A vs B comparison: same indicators for the two scenarios. */
export function exportAbReport(abResult) {
  if (!abResult?.a || !abResult?.b) return
  sideBySide(abResult.a, abResult.b, 'Cenário A', 'Cenário B')
}
