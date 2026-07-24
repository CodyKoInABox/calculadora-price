import { useCallback, useEffect, useRef } from 'react'
import Chart from 'chart.js/auto'
import { brl } from '../format'
import { ChartExpandBackdrop, ChartExpandButton, useChartExpand } from './useChartExpand.jsx'

export default function ResultsPanel({ result, mode, onExport, onExportPdf }) {
  const paymentRef = useRef(null)
  const breakdownRef = useRef(null)
  const paymentChartRef = useRef(null)
  const breakdownChartRef = useRef(null)
  const getPaymentChart = useCallback(() => paymentChartRef.current, [])
  const paymentExpand = useChartExpand(getPaymentChart)

  useEffect(() => {
    if (!result || result.error) return

    if (paymentChartRef.current) paymentChartRef.current.destroy()
    paymentChartRef.current = new Chart(paymentRef.current, {
      type: 'line',
      data: {
        labels: result.schedule.map(r => `M${r.month}`),
        datasets: [
          {
            label: 'Parcela',
            data: result.schedule.map(r => r.payment + r.balloon),
            borderColor: '#524fa0',
            backgroundColor: 'rgba(82,79,160,.10)',
            fill: true,
            tension: .32,
            pointRadius: 0,
            borderWidth: 2.5,
            yAxisID: 'y'
          },
          {
            label: 'Saldo devedor',
            data: result.schedule.map(r => r.balance),
            borderColor: '#a7a9b9',
            backgroundColor: 'transparent',
            tension: .25,
            pointRadius: 0,
            borderDash: [5, 5],
            borderWidth: 1.8,
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

    if (breakdownChartRef.current) breakdownChartRef.current.destroy()
    breakdownChartRef.current = new Chart(breakdownRef.current, {
      type: 'doughnut',
      data: {
        labels: ['Principal', 'Juros', 'Entrada'],
        datasets: [{
          data: [result.principal, result.totalInterest, result.down],
          backgroundColor: ['#524fa0', '#8b85ff', '#d9d8f6'],
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `${ctx.label}: ${brl.format(ctx.raw)}` } }
        }
      }
    })

    return () => {
      paymentChartRef.current?.destroy()
      breakdownChartRef.current?.destroy()
      paymentChartRef.current = null
      breakdownChartRef.current = null
    }
  }, [result])

  if (!result || result.error) {
    return (
      <section className="panel empty">
        <div className="empty-icon">↗</div>
        <h2 className="panel-title">Sua simulação aparecerá aqui</h2>
        <p>Preencha os dados e clique em calcular para visualizar parcelas, juros, balões e evolução do saldo.</p>
      </section>
    )
  }

  const totalPaid = result.down + result.totalRegular + result.totalBalloon
  const termReduced = result.extraEffect === 'term' && result.effectiveMonths < result.months
  let inverseNote = null
  if (result.solved === 'principal') {
    inverseNote = `Ajustado para parcela máx. ≤ ${brl.format(result.targetPayment)} (quanto financiar).`
  } else if (result.solved === 'down') {
    inverseNote = `Ajustado para parcela máx. ≤ ${brl.format(result.targetPayment)} (entrada mínima).`
  }

  return (
    <>
      <section className="panel summary">
        <div className="summary-top">
          <div>
            <h2 className="panel-title">Resumo da simulação</h2>
            <p className="panel-subtitle tight">
              {inverseNote || 'Visão geral do fluxo de pagamento.'}
            </p>
          </div>
          <div className="status">Saldo liquidado</div>
        </div>
        <div className="cards">
          {result.solved === 'down' && (
            <div className="metric">
              <span>Entrada mínima</span>
              <strong>{brl.format(result.down)}</strong>
              <small>Para parcela ≤ {brl.format(result.targetPayment)}</small>
            </div>
          )}
          {result.solved === 'principal' && (
            <div className="metric">
              <span>Valor total</span>
              <strong>{brl.format(result.property)}</strong>
              <small>Entrada {brl.format(result.down)} + financiado</small>
            </div>
          )}
          <div className="metric">
            <span>Valor financiado</span>
            <strong>{brl.format(result.principal)}</strong>
            <small>{result.solved === 'down' ? 'Valor − entrada mínima' : 'Após entrada'}</small>
          </div>
          <div className="metric">
            <span>Primeira parcela</span>
            <strong>{brl.format(result.schedule[0]?.payment || 0)}</strong>
            <small>{mode === 'growing' ? 'Parcela inicial ajustada' : 'Parcela mensal Price'}</small>
          </div>
          <div className="metric">
            <span>Última parcela</span>
            <strong>{brl.format(result.schedule[result.schedule.length - 1]?.payment || 0)}</strong>
            <small>Sem considerar balão separado</small>
          </div>
          <div className="metric">
            <span>{termReduced ? 'Prazo efetivo' : 'Total pago'}</span>
            <strong>
              {termReduced
                ? `${result.months} → ${result.effectiveMonths} meses`
                : brl.format(totalPaid)}
            </strong>
            <small>{termReduced ? 'Contratado → liquidado' : 'Entrada + parcelas + balões'}</small>
          </div>
          {termReduced && (
            <div className="metric">
              <span>Total pago</span>
              <strong>{brl.format(totalPaid)}</strong>
              <small>Entrada + parcelas + balões</small>
            </div>
          )}
        </div>
      </section>

      <div className="visual-grid">
        {paymentExpand.expanded && <ChartExpandBackdrop onClose={paymentExpand.close} />}
        <section
          className={`panel chart-card${paymentExpand.expanded ? ' is-expanded' : ''}`}
          role={paymentExpand.expanded ? 'dialog' : undefined}
          aria-modal={paymentExpand.expanded || undefined}
          aria-labelledby={paymentExpand.expanded ? paymentExpand.titleId : undefined}
        >
          <div className="chart-card-head">
            <div>
              <h2 id={paymentExpand.titleId} className="panel-title">Evolução das parcelas</h2>
              <p className="panel-subtitle tight">Pagamento mensal e saldo devedor ao longo do contrato.</p>
            </div>
            <ChartExpandButton onClick={paymentExpand.toggle} expanded={paymentExpand.expanded} />
          </div>
          <div className="chart-wrap">
            <canvas ref={paymentRef} />
          </div>
        </section>
        <section className="panel breakdown">
          <h2 className="panel-title">Composição do pagamento</h2>
          <p className="panel-subtitle">Quanto vai para principal, juros e entrada.</p>
          <div className="donut-wrap"><canvas ref={breakdownRef} /></div>
          <div className="legend">
            <div className="legend-line"><span>Principal financiado</span><strong>{brl.format(result.principal)}</strong></div>
            <div className="legend-line"><span>Juros</span><strong>{brl.format(result.totalInterest)}</strong></div>
            <div className="legend-line"><span>Balões</span><strong>{brl.format(result.totalBalloon)}</strong></div>
          </div>
        </section>
      </div>

      <section className="panel table-card">
        <div className="table-head">
          <div>
            <h2 className="panel-title">Tabela de amortização</h2>
            <p className="panel-subtitle tight">Detalhamento mês a mês.</p>
          </div>
          <div className="table-actions">
            <button type="button" onClick={onExport}>Exportar CSV</button>
            {onExportPdf && <button type="button" onClick={onExportPdf}>Exportar PDF</button>}
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Mês</th>
                <th>Parcela</th>
                <th>Juros</th>
                <th>Amortização</th>
                <th>Balão</th>
                <th>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {result.schedule.map(row => (
                <tr key={row.month} className={row.balloon > 0 ? 'balloon-row' : undefined}>
                  <td>
                    {row.month}
                    {row.balloon > 0 && <span className="badge-balloon">BALÃO</span>}
                  </td>
                  <td>{brl.format(row.payment)}</td>
                  <td>{brl.format(row.interest)}</td>
                  <td>{brl.format(row.amortization)}</td>
                  <td>{brl.format(row.balloon)}</td>
                  <td>{brl.format(row.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
