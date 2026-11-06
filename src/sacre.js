/**
 * Parses the TR input typed as percent a.m. ("0,20") into a monthly decimal (0.002).
 * Empty or invalid input means no correction.
 */
export function parseTrInput(raw) {
  if (raw == null || raw === '') return 0
  const n = Number(String(raw).replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n / 100 : 0
}
