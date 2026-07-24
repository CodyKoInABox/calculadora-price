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
  return `${result.months} meses`
}

export default function ComparePanel({ price, sac, onExport, onExportPdf }) {
  const chartRef = useRef(null)
  const chartInstance = useRef(null)

  useEffect(() => {
    if (!price?.schedule || !sac?.schedule) return

    if (chartInstance.current) chartInstance.current.destroy()
    chartInstance.current = new Chart(chartRef.current, {
      type: 'line',
      data: {
        labels: price.schedule.map(r => `M${r.month}`),
        datasets: [
          {
            label: 'Parcela Price',
            data: price.schedule.map(r => r.payment + r.balloon),
            borderColor: '#524fa0',
            backgroundColor: 'rgba(82,79,160,.08)',
            fill: false,
            tension: .32,
            pointRadius: 0,
            borderWidth: 2.5,
            yAxisID: 'y'
          },
          {
            label: 'Parcela SAC',
            data: sac.schedule.map(r => r.payment + r.balloon),
            borderColor: '#0f8a65',
            backgroundColor: 'rgba(15,138,101,.08)',
            fill: false,
            tension: .32,
            pointRadius: 0,
            borderWidth: 2.5,
            yAxisID: 'y'
          },
          {
            label: 'Saldo Price',
            data: price.schedule.map(r => r.balance),
            borderColor: '#a7a9b9',
            backgroundColor: 'transparent',
            tension: .25,
            pointRadius: 0,
            borderDash: [5, 5],
            borderWidth: 1.6,
            yAxisID: 'y1'
          },
          {
            label: 'Saldo SAC',
            data: sac.schedule.map(r => r.balance),
            borderColor: '#7bc4a8',
            backgroundColor: 'transparent',
            tension: .25,
            pointRadius: 0,
            borderDash: [5, 5],
            borderWidth: 1.6,
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
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${brl.format(ctx.raw)}` } }
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
  const len = Math.min(price.schedule.length, sac.schedule.length)

  const inverseSolve = price.solved
  const inverseEyebrow = inverseSolve
    ? `Price × SAC · parcela máx. ≤ ${brl.format(price.targetPayment)} · ${
        inverseSolve === 'principal' ? 'quanto financiar' : 'entrada mínima'
      }`
    : null
  let verdictDetail
  if (inverseSolve) {
    verdictDetail = 'Cada modelo foi invertido com a mesma parcela máxima — principal/entrada podem diferir entre Price e SAC.'
  } else if (sacSaves) {
    verdictDetail = 'Amortização constante no SAC reduz o saldo mais cedo; a 1ª parcela fica maior e o total de juros menor.'
  } else {
    verdictDetail = 'Neste cenário o Price ficou com menos juros totais — confira parcelas e balões mês a mês.'
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
          <h2 className="panel-title">
            {sacSaves
              ? <>SAC economiza <span className="compare-save">{brl.format(interestDelta)}</span> em juros</>
              : <>Price economiza <span className="compare-save">{brl.format(-interestDelta)}</span> em juros</>}
          </h2>
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
          <p className="panel-subtitle tight">Parcelas fixas (sem balão).</p>
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

      <section className="panel chart-card">
        <h2 className="panel-title">Evolução lado a lado</h2>
        <p className="panel-subtitle">Parcelas e saldo devedor — Price vs SAC.</p>
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
            {onExportPdf && <button type="button" onClick={onExportPdf}>Exportar PDF</button>}
          </div>
        </div>
        <div className="table-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th>Mês</th>
                <th>Parcela Price</th>
                <th>Parcela SAC</th>
                <th>Δ</th>
                <th>Saldo Price</th>
                <th>Saldo SAC</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: len }, (_, i) => {
                const p = price.schedule[i]
                const s = sac.schedule[i]
                const delta = s.payment - p.payment
                const balloon = (p.balloon || 0) > 0 || (s.balloon || 0) > 0
                let deltaClass
                if (delta > 0) deltaClass = 'delta-pos'
                else if (delta < 0) deltaClass = 'delta-neg'
                const deltaLabel = delta === 0
                  ? '—'
                  : `${delta > 0 ? '+' : ''}${brl.format(delta)}`
                return (
                  <tr key={p.month} className={balloon ? 'balloon-row' : undefined}>
                    <td>
                      {p.month}
                      {balloon && <span className="badge-balloon">BALÃO</span>}
                    </td>
                    <td>{brl.format(p.payment)}</td>
                    <td>{brl.format(s.payment)}</td>
                    <td className={deltaClass}>{deltaLabel}</td>
                    <td>{brl.format(p.balance)}</td>
                    <td>{brl.format(s.balance)}</td>
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
