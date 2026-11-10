const DAY_MS = 86_400_000
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseIsoDate(iso) {
  const match = ISO_DATE.exec(String(iso ?? ''))
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null
  }
  return { year, month, day }
}

export function toDayNumber(iso) {
  const parsed = parseIsoDate(iso)
  if (!parsed) return null
  return Math.round(Date.UTC(parsed.year, parsed.month - 1, parsed.day) / DAY_MS)
}

export function fromDayNumber(dayNumber) {
  const date = new Date(dayNumber * DAY_MS)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Adds calendar months, keeping the day and clamping to the end of shorter months. */
export function addMonths(iso, months) {
  const parsed = parseIsoDate(iso)
  if (!parsed) return null
  const index = parsed.year * 12 + (parsed.month - 1) + months
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  const day = Math.min(parsed.day, daysInMonth(year, month))
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Due dates of installments 1..count, starting at firstDueIso. */
export function dueDates(firstDueIso, count) {
  return Array.from({ length: count }, (_, index) => addMonths(firstDueIso, index))
}

export function daysBetween(fromIso, toIso) {
  const from = toDayNumber(fromIso)
  const to = toDayNumber(toIso)
  if (from == null || to == null) return null
  return to - from
}
