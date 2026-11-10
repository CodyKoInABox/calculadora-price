import { toMonthlyRate } from './appState'
import { parseIsoDate } from './engine/dates'
import { curvePresets, parseMoney } from './engine/math'

export const DEFAULT_FINANCING = {
  propertyValue: '300.000,00',
  downPayment: '60.000,00',
  months: 36,
  interest: '1',
  ratePeriod: 'am',
  system: 'price',
  firstDue: '2026-12-10',
  activePreset: 'linear',
  curveControls: [...curvePresets.linear]
}

/** Validates the shared financing fields and returns engine-ready terms. */
export function readFinancing(fin) {
  const principal = parseMoney(fin.propertyValue) - parseMoney(fin.downPayment)
  if (!(principal > 0)) return { error: 'Informe um valor do bem maior que a entrada.' }

  const months = Number(fin.months)
  if (!Number.isInteger(months) || months < 1 || months > 600) {
    return { error: 'O prazo deve ser um número inteiro entre 1 e 600 meses.' }
  }

  const rate = toMonthlyRate(fin.interest, fin.ratePeriod)
  if (!Number.isFinite(rate)) return { error: 'Informe uma taxa de juros válida.' }

  if (!parseIsoDate(fin.firstDue)) return { error: 'Informe a data da primeira parcela.' }

  return {
    principal,
    rate,
    months,
    system: fin.system,
    curveControls: [...fin.curveControls],
    firstDueIso: fin.firstDue
  }
}

export const PRORATA_OPTIONS = [
  { id: 'dias', label: 'Dias corridos' },
  { id: 'parcelas', label: 'Parcelas' }
]

export const PRORATA_HELP = {
  dias: 'Juros do período corrente proporcionais aos dias decorridos.',
  parcelas: 'O período corrente conta como uma parcela inteira; o saldo é o da tabela no último vencimento.'
}

/** Whole number typed by the user; anything else becomes NaN, which the engine rejects with a message. */
export function parseIntegerInput(raw) {
  const parsed = Number(String(raw ?? '').trim())
  return Number.isInteger(parsed) ? parsed : NaN
}

/** Percent typed by the user ("0,5") as a number; blank or invalid means zero. */
export function parsePercentInput(raw) {
  const parsed = Number(String(raw ?? '').trim().replace(',', '.'))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

export function formatIsoBr(iso) {
  const parsed = parseIsoDate(iso)
  if (!parsed) return '—'
  const day = String(parsed.day).padStart(2, '0')
  const month = String(parsed.month).padStart(2, '0')
  return `${day}/${month}/${parsed.year}`
}
