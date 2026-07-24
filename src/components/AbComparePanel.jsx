import { useEffect, useRef } from 'react'
import Chart from 'chart.js/auto'
import { brl } from '../format'

function totalPaid(result) {
  return result.down + result.totalRegular + result.totalBalloon
}

function prazoLabel(result) {
  if (result.extraEffect === 'term' && result.effectiveMonths < result.months) {
    return `${result.months} → ${result.effectiveMonths} meses`
  }
  return `${result.months}×`
}

export default function AbComparePanel({ a, b, onExport }) {
  const chartRef = useRef(null)
  const chartInstance = useRef(null)

  useEffect(() => {
    if (!a?.schedule || !b?.schedule) return

    if (chartInstance.current) chartInstance.current.destroy()

    const len = Math.max(a.schedule.length, b.schedule.length)
    const labels = Array.from({ length: len }, (_, i) => `M${i + 1}`)
    const series = (schedule, pick) =>
      Array.from({ length: len }, (_, i) => {
        const row = schedule[i]
        return row ? pick(row) : null
      })

    chartInstance.current = new Chart(chartRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Parcela A',
            data: series(a.schedule, r => r.payment + r.balloon),
            borderColor: '#524fa0',
            backgroundColor: 'rgba(82,79,160,.08)',
            fill: false,
            tension: .32,
            pointRadius: 0,
            borderWidth: 2.5,
            spanGaps: false,
            yAxisID: 'y'
          },
          {
            label: 'Parcela B',
            data: series(b.schedule, r => r.payment + r.balloon),
            borderColor: '#0f8a65',
            backgroundColor: 'rgba(15,138,101,.08)',
            fill: false,
            tension: .32,
            pointRadius: 0,
            borderWidth: 2.5,
            spanGaps: false,
            yAxisID: 'y'
          },
          {
            label: 'Saldo A',
            data: series(a.schedule, r => r.balance),
            borderColor: '#a7a9b9',
            backgroundColor: 'transparent',
            tension: .25,
            pointRadius: 0,
            borderDash: [5, 5],
            borderWidth: 1.6,
            spanGaps: false,
            yAxisID: 'y1'
          },
          {
            label: 'Saldo B',
            data: series(b.schedule, r => r.balance),
            borderColor: '#7bc4a8',
            backgroundColor: 'transparent',
            tension: .25,
            pointRadius: 0,
            borderDash: [5, 5],
            borderWidth: 1.6,
            spanGaps: false,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { usePointStyle: true, boxWidth: 8, font: { family: 'Inter', size: 11 } } },
          tooltip: {
            callbacks: {
              label: ctx => {
                if (ctx.raw == null || Number.isNaN(ctx.raw)) return `${ctx.dataset.label}: —`
                return `${ctx.dataset.label}: ${brl.format(ctx.raw)}`
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 10, font: { size: 10 } } },
          y: {
            position: 'left',
            grid: { color: '#eff0f5' },
            ticks: { callback: v => 'R$ ' + Math.round(v / 1000) + 'k', font: { size: 10 } }
          },
          y1: {
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { callback: v => 'R$ ' + Math.round(v / 1000) + 'k', font: { size: 10 } }
          }
        }
      }
    })

    return () => {
      chartInstance.current?.destroy()
      chartInstance.current = null
    }
  }, [a, b])

  if (!a || !b || a.error || b.error) {
    return (
      <section className="panel empty">
        <div className="empty-icon">↗</div>
        <h2 className="panel-title">Sua comparação A vs B aparecerá aqui</h2>
        <p>Ajuste taxa, prazo, entrada e extras de cada cenário e clique em calcular.</p>
      </section>
    )
  }

  const interestDelta = a.totalInterest - b.totalInterest
  const bSavesInterest = interestDelta >= 0
  const paymentA = a.schedule[0]?.payment || 0
  const paymentB = b.schedule[0]?.payment || 0
  const paymentDelta = paymentA - paymentB
  const aPaid = totalPaid(a)
  const bPaid = totalPaid(b)
  const len = Math.max(a.schedule.length, b.schedule.length)

  return (
    <>
      <section className="panel compare-verdict">
        <div className="compare-verdict-copy">
          <p className="compare-eyebrow">A vs B · cenários Price independentes</p>
          <h2 className="panel-title">
            {bSavesInterest
              ? <>B economiza <span className="compare-save">{brl.format(interestDelta)}</span> em juros</>
              : <>A economiza <span className="compare-save">{brl.format(-interestDelta)}</span> em juros</>}
          </h2>
          <p className="panel-subtitle tight">
            {paymentDelta === 0
              ? '1ª parcela igual nos dois cenários.'
              : paymentDelta > 0
                ? <>1ª parcela de B é <span className="compare-save">{brl.format(paymentDelta)}</span> menor que A.</>
                : <>1ª parcela de A é <span className="compare-save">{brl.format(-paymentDelta)}</span> menor que B.</>}
          </p>
        </div>
        <div className="compare-totals">
          <div className="compare-total price">
            <span>Total pago A</span>
            <strong>{brl.format(aPaid)}</strong>
            <small>Juros {brl.format(a.totalInterest)}</small>
          </div>
          <div className="compare-total sac">
            <span>Total pago B</span>
            <strong>{brl.format(bPaid)}</strong>
            <small>Juros {brl.format(b.totalInterest)}</small>
          </div>
        </div>
      </section>

      <div className="compare-grid">
        <section className="panel compare-side a">
          <h3 className="compare-side-title">Cenário A</h3>
          <p className="panel-subtitle tight">
            {prazoLabel(a)} · {brl.format(a.down)} entrada
          </p>
          <div className="compare-metrics">
            <div className="metric">
              <span>1ª parcela</span>
              <strong>{brl.format(paymentA)}</strong>
            </div>
            <div className="metric">
              <span>Última parcela</span>
              <strong>{brl.format(a.schedule.at(-1)?.payment || 0)}</strong>
            </div>
            <div className="metric">
              <span>Total de juros</span>
              <strong>{brl.format(a.totalInterest)}</strong>
            </div>
            <div className="metric">
              <span>Total pago</span>
              <strong>{brl.format(aPaid)}</strong>
            </div>
          </div>
        </section>

        <section className="panel compare-side b">
          <h3 className="compare-side-title">Cenário B</h3>
          <p className="panel-subtitle tight">
            {prazoLabel(b)} · {brl.format(b.down)} entrada
          </p>
          <div className="compare-metrics">
            <div className="metric">
              <span>1ª parcela</span>
              <strong>{brl.format(paymentB)}</strong>
            </div>
            <div className="metric">
              <span>Última parcela</span>
              <strong>{brl.format(b.schedule.at(-1)?.payment || 0)}</strong>
            </div>
            <div className="metric">
              <span>Total de juros</span>
              <strong>{brl.format(b.totalInterest)}</strong>
            </div>
            <div className="metric">
              <span>Total pago</span>
              <strong>{brl.format(bPaid)}</strong>
            </div>
          </div>
        </section>
      </div>

      <section className="panel chart-card">
        <h2 className="panel-title">Evolução lado a lado</h2>
        <p className="panel-subtitle">Parcelas e saldo devedor — A vs B.</p>
        <div className="chart-wrap"><canvas ref={chartRef} /></div>
      </section>

      <section className="panel table-card">
        <div className="table-head">
          <div>
            <h2 className="panel-title">Tabela comparativa</h2>
            <p className="panel-subtitle tight">Mês a mês: parcela, diferença e saldo.</p>
          </div>
          <div className="table-actions">
            <button type="button" onClick={onExport}>Exportar CSV</button>
          </div>
        </div>
        <div className="table-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th>Mês</th>
                <th>Parcela A</th>
                <th>Parcela B</th>
                <th>Δ</th>
                <th>Saldo A</th>
                <th>Saldo B</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: len }, (_, i) => {
                const rowA = a.schedule[i]
                const rowB = b.schedule[i]
                const month = (rowA ?? rowB).month
                const balloon = (rowA?.balloon || 0) > 0 || (rowB?.balloon || 0) > 0
                let deltaClass
                let deltaLabel = '—'
                if (rowA && rowB) {
                  const delta = rowB.payment - rowA.payment
                  if (delta > 0) deltaClass = 'delta-pos'
                  else if (delta < 0) deltaClass = 'delta-neg'
                  deltaLabel = delta === 0
                    ? '—'
                    : `${delta > 0 ? '+' : ''}${brl.format(delta)}`
                }
                return (
                  <tr key={month} className={balloon ? 'balloon-row' : undefined}>
                    <td>
                      {month}
                      {balloon && <span className="badge-balloon">BALÃO</span>}
                    </td>
                    <td>{rowA ? brl.format(rowA.payment) : '—'}</td>
                    <td>{rowB ? brl.format(rowB.payment) : '—'}</td>
                    <td className={deltaClass}>{deltaLabel}</td>
                    <td>{rowA ? brl.format(rowA.balance) : '—'}</td>
                    <td>{rowB ? brl.format(rowB.balance) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
