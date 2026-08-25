import { useCallback, useEffect, useRef } from 'react'
import Chart from 'chart.js/auto'
import { brl, formatInstallmentMonth, monthCashOut } from '../format'
import { ChartExpandBackdrop, ChartExpandButton, useChartExpand } from './useChartExpand.jsx'
import StartMonthPicker from './StartMonthPicker.jsx'

function totalPaid(result) {
  return result.down + result.totalRegular + result.totalBalloon
}

function prazoLabel(result) {
  if (result.extraEffect === 'term' && result.effectiveMonths < result.months) {
    return `${result.months} → ${result.effectiveMonths} meses`
  }
  return `${result.months} meses`
}

export default function ComparePanel({ price, sac, startMonth, onStartMonthChange, onExport, onExportPdf }) {
  const chartRef = useRef(null)
  const chartInstance = useRef(null)
  const getChart = useCallback(() => chartInstance.current, [])
  const expand = useChartExpand(getChart)

  useEffect(() => {
    if (!price?.schedule || !sac?.schedule) return

    if (chartInstance.current) chartInstance.current.destroy()
    const len = Math.max(price.schedule.length, sac.schedule.length)
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
            label: 'Desembolso total Price',
            data: series(price.schedule, monthCashOut),
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
            label: 'Desembolso total SAC',
            data: series(sac.schedule, monthCashOut),
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
            label: 'Saldo Price',
            data: series(price.schedule, r => r.balance),
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
            label: 'Saldo SAC',
            data: series(sac.schedule, r => r.balance),
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
              label: ctx => ctx.raw == null
                ? `${ctx.dataset.label}: —`
                : `${ctx.dataset.label}: ${brl.format(ctx.raw)}`
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
  }, [price, sac])

  if (!price || !sac || price.error || sac.error) {
    return (
      <section className="panel empty">
        <div className="empty-icon">↗</div>
        <h2 className="panel-title">Sua comparação aparecerá aqui</h2>
        <p>Preencha os dados e clique em calcular para ver Price e SAC lado a lado.</p>
      </section>
    )
  }

  const interestDelta = price.totalInterest - sac.totalInterest
  const sacSaves = interestDelta >= 0
  const pricePaid = totalPaid(price)
  const sacPaid = totalPaid(sac)
  const len = Math.max(price.schedule.length, sac.schedule.length)

  const inverseSolve = price.solved
  const inverseEyebrow = inverseSolve
    ? `Price × SAC · parcela regular máx. ≤ ${brl.format(price.targetPayment)} · ${
        inverseSolve === 'principal' ? 'quanto financiar' : 'entrada mínima'
      }`
    : null
  let verdictTitle
  let verdictDetail
  if (inverseSolve) {
    if (inverseSolve === 'principal') {
      const principalDelta = price.principal - sac.principal
      if (principalDelta === 0) {
        verdictTitle = 'Price e SAC financiam o mesmo principal'
      } else if (principalDelta > 0) {
        verdictTitle = <>Price financia <span className="compare-save">{brl.format(principalDelta)}</span> a mais</>
      } else {
        verdictTitle = <>SAC financia <span className="compare-save">{brl.format(-principalDelta)}</span> a mais</>
      }
      verdictDetail = 'Comparação pelo principal financiável. Os juros totais não indicam economia porque os principais são diferentes.'
    } else {
      const downDelta = price.down - sac.down
      if (downDelta === 0) {
        verdictTitle = 'Price e SAC exigem a mesma entrada'
      } else if (downDelta < 0) {
        verdictTitle = <>Price exige <span className="compare-save">{brl.format(-downDelta)}</span> a menos de entrada</>
      } else {
        verdictTitle = <>SAC exige <span className="compare-save">{brl.format(downDelta)}</span> a menos de entrada</>
      }
      verdictDetail = 'Comparação pela entrada exigida. Os juros totais não indicam economia porque os principais são diferentes.'
    }
  } else if (sacSaves) {
    verdictTitle = <>SAC economiza <span className="compare-save">{brl.format(interestDelta)}</span> em juros</>
    verdictDetail = 'Amortização constante no SAC reduz o saldo mais cedo; a 1ª parcela fica maior e o total de juros menor.'
  } else {
    verdictTitle = <>Price economiza <span className="compare-save">{brl.format(-interestDelta)}</span> em juros</>
    verdictDetail = 'Neste cenário o Price ficou com menos juros totais — confira parcelas regulares e extras mês a mês.'
  }

  return (
    <>
      <section className="panel compare-verdict">
        <div className="compare-verdict-copy">
          <p className="compare-eyebrow">
            {inverseEyebrow || (
              <>
                Price × SAC · mesmo principal, taxa e prazo
                {(price.extraEffect === 'term' && price.effectiveMonths < price.months) ||
                (sac.extraEffect === 'term' && sac.effectiveMonths < sac.months)
                  ? ` · efetivo Price ${prazoLabel(price)} / SAC ${prazoLabel(sac)}`
                  : ''}
              </>
            )}
          </p>
          <h2 className="panel-title">{verdictTitle}</h2>
          <p className="panel-subtitle tight">{verdictDetail}</p>
        </div>
        <div className="compare-totals">
          <div className="compare-total price">
            <span>Total pago Price</span>
            <strong>{brl.format(pricePaid)}</strong>
            <small>Juros {brl.format(price.totalInterest)}</small>
          </div>
          <div className="compare-total sac">
            <span>Total pago SAC</span>
            <strong>{brl.format(sacPaid)}</strong>
            <small>Juros {brl.format(sac.totalInterest)}</small>
          </div>
        </div>
      </section>

      <div className="compare-grid">
        <section className="panel compare-side price">
          <h3 className="compare-side-title">Tabela Price</h3>
          <p className="panel-subtitle tight">Parcelas regulares fixas, sem incluir extras.</p>
          <div className="compare-metrics">
            {price.solved === 'down' && (
              <div className="metric">
                <span>Entrada mínima</span>
                <strong>{brl.format(price.down)}</strong>
              </div>
            )}
            <div className="metric">
              <span>Valor financiado</span>
              <strong>{brl.format(price.principal)}</strong>
            </div>
            <div className="metric">
              <span>1ª parcela</span>
              <strong>{brl.format(price.schedule[0]?.payment || 0)}</strong>
            </div>
            <div className="metric">
              <span>Última parcela</span>
              <strong>{brl.format(price.schedule.at(-1)?.payment || 0)}</strong>
            </div>
            <div className="metric">
              <span>Total de juros</span>
              <strong>{brl.format(price.totalInterest)}</strong>
            </div>
            <div className="metric">
              <span>Total pago</span>
              <strong>{brl.format(pricePaid)}</strong>
            </div>
          </div>
        </section>

        <section className="panel compare-side sac">
          <h3 className="compare-side-title">SAC</h3>
          <p className="panel-subtitle tight">Amortização constante, parcela decrescente.</p>
          <div className="compare-metrics">
            {sac.solved === 'down' && (
              <div className="metric">
                <span>Entrada mínima</span>
                <strong>{brl.format(sac.down)}</strong>
              </div>
            )}
            <div className="metric">
              <span>Valor financiado</span>
              <strong>{brl.format(sac.principal)}</strong>
            </div>
            <div className="metric">
              <span>1ª parcela</span>
              <strong>{brl.format(sac.schedule[0]?.payment || 0)}</strong>
            </div>
            <div className="metric">
              <span>Última parcela</span>
              <strong>{brl.format(sac.schedule.at(-1)?.payment || 0)}</strong>
            </div>
            <div className="metric">
              <span>Total de juros</span>
              <strong>{brl.format(sac.totalInterest)}</strong>
            </div>
            <div className="metric">
              <span>Total pago</span>
              <strong>{brl.format(sacPaid)}</strong>
            </div>
          </div>
        </section>
      </div>

      {expand.expanded && <ChartExpandBackdrop onClose={expand.close} />}
      <section
        className={`panel chart-card${expand.expanded ? ' is-expanded' : ''}`}
        role={expand.expanded ? 'dialog' : undefined}
        aria-modal={expand.expanded || undefined}
        aria-labelledby={expand.expanded ? expand.titleId : undefined}
      >
        <div className="chart-card-head">
          <div>
            <h2 id={expand.titleId} className="panel-title">Evolução lado a lado</h2>
            <p className="panel-subtitle tight">Desembolso total e saldo devedor — Price vs SAC.</p>
          </div>
          <ChartExpandButton onClick={expand.toggle} expanded={expand.expanded} />
        </div>
        <div className="chart-wrap">
          <canvas ref={chartRef} />
        </div>
      </section>

      <section className="panel table-card">
        <div className="table-head">
          <div>
            <h2 className="panel-title">Tabela comparativa</h2>
            <p className="panel-subtitle tight">Deltas calculados como SAC menos Price.</p>
          </div>
          <div className="table-actions">
            <StartMonthPicker value={startMonth} onChange={onStartMonthChange} />
            <button type="button" onClick={onExport}>Exportar CSV</button>
            {onExportPdf && <button type="button" onClick={onExportPdf}>Exportar PDF</button>}
          </div>
        </div>
        <div className="table-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th>Mês</th>
                <th>Regular Price</th>
                <th>Regular SAC</th>
                <th>Δ regular</th>
                <th>Total Price</th>
                <th>Total SAC</th>
                <th>Δ total no mês</th>
                <th>Saldo Price</th>
                <th>Saldo SAC</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: len }, (_, i) => {
                const p = price.schedule[i]
                const s = sac.schedule[i]
                const month = (p ?? s).month
                const regularDelta = (s?.payment || 0) - (p?.payment || 0)
                const totalDelta = (s ? monthCashOut(s) : 0) - (p ? monthCashOut(p) : 0)
                const extra = (p?.balloon || 0) > 0 || (s?.balloon || 0) > 0
                const regularDeltaClass = regularDelta > 0
                  ? 'delta-pos'
                  : regularDelta < 0 ? 'delta-neg' : undefined
                const totalDeltaClass = totalDelta > 0
                  ? 'delta-pos'
                  : totalDelta < 0 ? 'delta-neg' : undefined
                const regularDeltaLabel = regularDelta === 0
                  ? '—'
                  : `${regularDelta > 0 ? '+' : ''}${brl.format(regularDelta)}`
                const totalDeltaLabel = totalDelta === 0
                  ? '—'
                  : `${totalDelta > 0 ? '+' : ''}${brl.format(totalDelta)}`
                return (
                  <tr key={month} className={extra ? 'balloon-row' : undefined}>
                    <td>
                      {month}
                      {extra && <span className="badge-balloon">EXTRA</span>}
                      <span className="month-cal">{formatInstallmentMonth(startMonth, month)}</span>
                    </td>
                    <td>{p ? brl.format(p.payment) : '—'}</td>
                    <td>{s ? brl.format(s.payment) : '—'}</td>
                    <td className={regularDeltaClass}>{regularDeltaLabel}</td>
                    <td>{p ? brl.format(monthCashOut(p)) : '—'}</td>
                    <td>{s ? brl.format(monthCashOut(s)) : '—'}</td>
                    <td className={totalDeltaClass}>{totalDeltaLabel}</td>
                    <td>{p ? brl.format(p.balance) : '—'}</td>
                    <td>{s ? brl.format(s.balance) : '—'}</td>
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
