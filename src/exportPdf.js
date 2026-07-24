/** Trigger native print dialog (Save as PDF). */
export function exportPdf() {
  if (typeof window === 'undefined') return
  window.print()
}
