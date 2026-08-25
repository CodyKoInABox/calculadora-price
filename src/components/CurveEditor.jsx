import { useEffect, useRef, useState } from 'react'
import Chart from 'chart.js/auto'
import { clampCurveValue, curveWeightAt, CURVE_MIN, CURVE_MAX } from '../math'

const CURVE_SAMPLE_COUNT = 100

function curveSeries(controls) {
  return Array.from({ length: CURVE_SAMPLE_COUNT + 1 }, (_, index) => {
    const progress = index / CURVE_SAMPLE_COUNT
    return { x: progress, y: curveWeightAt(progress, controls) }
  })
}

function controlSeries(controls) {
  return controls.map((value, index) => ({
    x: index / (controls.length - 1),
    y: value
  }))
}

export default function CurveEditor({ controls, activePreset, onChange, onPreset }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const chartRef = useRef(null)
  const controlsRef = useRef(controls)
  const activePointRef = useRef(0)
  const draggingRef = useRef(false)
  const [activePoint, setActivePoint] = useState(0)
  const [dragging, setDragging] = useState(false)

  controlsRef.current = controls
  activePointRef.current = activePoint

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        datasets: [
          {
            id: 'curve',
            label: 'Curva calculada',
            data: curveSeries(controlsRef.current),
            parsing: false,
            borderColor: '#524fa0',
            backgroundColor: 'rgba(82,79,160,.12)',
            borderWidth: 3,
            fill: true,
            tension: 0,
            pointRadius: 0
          },
          {
            id: 'controls',
            label: 'Ponto de controle',
            data: controlSeries(controlsRef.current),
            parsing: false,
            borderColor: '#524fa0',
            showLine: false,
            pointRadius: 6,
            pointHoverRadius: 8,
            pointHitRadius: 18,
            pointBackgroundColor: ctx => ctx.dataIndex === activePointRef.current ? '#151728' : '#ffffff',
            pointBorderColor: '#524fa0',
            pointBorderWidth: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { intersect: false, mode: 'nearest' },
        layout: { padding: { top: 15, right: 14, bottom: 8, left: 4 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => `Peso relativo: ${Number(ctx.parsed.y).toFixed(2)}×`
            }
          }
        },
        scales: {
          x: { type: 'linear', display: false, min: 0, max: 1 },
          y: {
            min: CURVE_MIN,
            max: CURVE_MAX,
            border: { display: false },
            grid: { color: 'rgba(82,79,160,.08)' },
            ticks: { stepSize: .5, callback: v => `${Number(v).toFixed(1)}×`, font: { size: 9 } }
          }
        }
      }
    })
    chartRef.current = chart

    const updateData = next => {
      chart.data.datasets[0].data = curveSeries(next)
      chart.data.datasets[1].data = controlSeries(next)
    }

    const setFromPointer = event => {
      const value = chart.scales.y.getValueForPixel(event.offsetY)
      const next = [...controlsRef.current]
      next[activePointRef.current] = clampCurveValue(value, 0.05)
      updateData(next)
      chart.update('none')
      onChange(next, null)
    }

    const onPointerDown = event => {
      const points = chart.getDatasetMeta(1).data
      if (!points.length) return
      let pointIndex = 0
      let nearestDistance = Number.POSITIVE_INFINITY
      points.forEach((point, index) => {
        const distance = Math.hypot(point.x - event.offsetX, point.y - event.offsetY)
        if (distance < nearestDistance) {
          pointIndex = index
          nearestDistance = distance
        }
      })
      event.preventDefault()
      setActivePoint(pointIndex)
      activePointRef.current = pointIndex
      draggingRef.current = true
      setDragging(true)
      canvas.setPointerCapture(event.pointerId)
      setFromPointer(event)
    }

    const onPointerMove = event => {
      if (!draggingRef.current) return
      event.preventDefault()
      setFromPointer(event)
    }

    const onPointerUp = event => {
      if (!draggingRef.current) return
      draggingRef.current = false
      setDragging(false)
      if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    }

    const onKeyDown = event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        const next = Math.max(0, Math.min(controlsRef.current.length - 1, activePointRef.current + (event.key === 'ArrowRight' ? 1 : -1)))
        setActivePoint(next)
        activePointRef.current = next
        chart.update('none')
        return
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault()
        const direction = event.key === 'ArrowUp' ? 1 : -1
        const next = [...controlsRef.current]
        next[activePointRef.current] = clampCurveValue(next[activePointRef.current] + direction * .05, 0)
        updateData(next)
        chart.update('none')
        onChange(next, null)
      }
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('keydown', onKeyDown)

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('keydown', onKeyDown)
      chart.destroy()
      chartRef.current = null
    }
  }, [onChange])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.data.datasets[0].data = curveSeries(controls)
    chart.data.datasets[1].data = controlSeries(controls)
    chart.update('none')
  }, [controls, activePoint])

  const presets = [
    ['linear', 'Crescente'],
    ['hill', 'Sobe e desce'],
    ['fast-start', 'Rápido → suave'],
    ['fast-end', 'Suave → rápido']
  ]

  return (
    <div className="curve-builder">
      <div className="curve-builder-head">
        <div>
          <strong>Desenhe a evolução das parcelas</strong>
          <span>Arraste os pontos. A linha usa a mesma interpolação limitada do cálculo.</span>
        </div>
        <div className="curve-live">● RECÁLCULO AO VIVO</div>
      </div>
      <div className="curve-presets" aria-label="Formatos prontos de curva">
        {presets.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`curve-preset${activePreset === id ? ' active' : ''}`}
            onClick={() => onPreset(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={`curve-editor-wrap${dragging ? ' dragging' : ''}`} ref={wrapRef}>
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="img"
          aria-label="Editor da curva das parcelas. Arraste os seis pontos; use as setas esquerda e direita para selecionar e para cima e para baixo para ajustar."
        />
      </div>
      <div className="curve-axis"><span>Primeira parcela</span><span>Última parcela</span></div>
    </div>
  )
}
