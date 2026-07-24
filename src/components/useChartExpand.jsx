import { useCallback, useEffect, useId, useState } from 'react'

function resizeSoon(getChart) {
  requestAnimationFrame(() => {
    const chart = getChart()
    if (!chart?.canvas) return
    // Chart.js keeps last pixel size inline — clear so grid can shrink after collapse
    chart.canvas.style.width = '100%'
    chart.canvas.style.height = '100%'
    chart.resize()
    requestAnimationFrame(() => chart.resize())
  })
}

export function useChartExpand(getChart) {
  const [expanded, setExpanded] = useState(false)
  const titleId = useId()

  const open = useCallback(() => setExpanded(true), [])
  const close = useCallback(() => setExpanded(false), [])
  const toggle = useCallback(() => setExpanded(v => !v), [])

  useEffect(() => {
    resizeSoon(getChart)
  }, [expanded, getChart])

  useEffect(() => {
    if (!expanded) return

    const onKey = (event) => {
      if (event.key === 'Escape') setExpanded(false)
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [expanded])

  return { expanded, titleId, open, close, toggle }
}

export function ChartExpandButton({ onClick, expanded }) {
  return (
    <button
      type="button"
      className="chart-expand-btn"
      onClick={onClick}
      aria-label={expanded ? 'Fechar gráfico ampliado' : 'Ampliar gráfico'}
      title={expanded ? 'Fechar' : 'Ampliar gráfico'}
    >
      {expanded ? (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none">
          <path
            d="M4 4l8 8M12 4L4 12"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none">
          <path
            d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  )
}

export function ChartExpandBackdrop({ onClose }) {
  return (
    <button
      type="button"
      className="chart-expand-backdrop"
      aria-label="Fechar gráfico ampliado"
      onClick={onClose}
    />
  )
}
