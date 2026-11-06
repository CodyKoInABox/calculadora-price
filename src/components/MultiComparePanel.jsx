import { useEffect, useRef } from 'react'
import Chart from '../charts'
import { brl, percentAa } from '../format'

export const SERIES_COLORS = ['#524fa0', '#e07a5f', '#2a9d8f', '#e9a03b']

const INDICATORS = [
  ['Sistema', item => item.modeLabel],
  ['Taxa contratual', item => item.rateLabel],
  ['Valor financiado', item => brl.format(item.result.principal)],
  ['Prazo efetivo', item => `${item.result.effectiveMonths} meses`],
  ['Primeira parcela', item => brl.format(item.result.schedule[0]?.payment || 0)],
  ['Última parcela', item => brl.format(item.result.schedule.at(-1)?.payment || 0)],
  ['Juros totais', item => brl.format(item.result.totalInterest)],
  ['Total pago', item => brl.format(item.result.down + item.result.totalRegular + item.result.totalBalloon)],
  ['CET (a.a.)', item => (Number.isFinite(item.cost?.cetAnnual) ? percentAa(item.cost.cetAnnual) : '—')],
  ['Seguros e taxas', item => (item.cost ? brl.format(item.cost.totalCost) : '—')]
]

export default function MultiComparePanel({ items, onClose }) {
  const canvasRef = useRef(null)
  const ok = items.filter(item => item.result)
  const failed = items.filter(item => item.error)

  useEffect(() => {
    const calculated = items.filter(item => item.result)
    const canvas = canvasRef.current
    if (!canvas || !calculated.length) return undefined
    const length = Math.max(...calculated.map(item => item.result.schedule.length + 1))

    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: Array.from({ length }, (_, i) => i),
        datasets: calculated.map((item, i) => {
          const balances = [item.result.principal, ...item.result.schedule.map(row => row.balance)]
          while (balances.length < length) balances.push(0)
          return {
            label: item.name,
            data: balances,
            borderColor: SERIES_COLORS[i % SERIES_COLORS.length],
            backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length],
            pointRadius: 0,
            borderWidth: 2,
            tension: 0.2
          }
        })
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { title: { display: true, text: 'Mês' }, ticks: { maxTicksLimit: 10 } },
          y: { ticks: { callback: value => brl.format(value) } }
        },
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${brl.format(ctx.parsed.y)}` } }
        }
      }
    })
    return () => chart.destroy()
  }, [items])

  return (
    <section className="panel multi-compare">
      <div className="chart-card-head">
        <div>
          <h2 className="panel-title">Comparação de cenários</h2>
          <p className="panel-subtitle tight">
            {ok.length} de {items.length} cenário{items.length > 1 ? 's' : ''} calculado{ok.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button type="button" className="btn-small btn-ghost" onClick={onClose}>Fechar</button>
      </div>

      {failed.length > 0 && (
        <ul className="multi-errors" role="status">
          {failed.map(item => (
            <li key={item.id}><strong>{item.name}:</strong> {item.error}</li>
          ))}
        </ul>
      )}

      {ok.length > 0 && (
        <>
          <div className="table-scroll">
            <table className="multi-table">
              <thead>
                <tr>
                  <th>Indicador</th>
                  {ok.map((item, i) => (
                    <th key={item.id} style={{ color: SERIES_COLORS[i % SERIES_COLORS.length] }}>{item.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {INDICATORS.map(([label, read]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    {ok.map(item => (
                      <td key={item.id}>{read(item)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="multi-chart">
            <canvas ref={canvasRef} />
          </div>
        </>
      )}
    </section>
  )
}
