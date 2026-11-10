import { useId, useState } from 'react'
import FinancingFields from './FinancingFields'
import { AuthorCredit, FeedbackLink, SiteFooter } from './SiteMeta'
import { brl, formatMoneyInput } from '../format'
import { DEFAULT_FINANCING, PRORATA_HELP, PRORATA_OPTIONS, formatIsoBr, readFinancing } from '../calcShared'
import { parseMoney } from '../engine/math'
import { contractInstallments } from '../engine/contract'
import { balanceOnDate, simulatePrepayment } from '../engine/prepayment'

const DEFAULT_DATE = '2027-03-10'
const DEFAULT_AMOUNT = '10.000,00'
const EFFECTS = [
  { id: 'prazo', label: 'Reduzir prazo' },
  { id: 'parcela', label: 'Reduzir parcela' }
]

export default function PrepaymentPage() {
  const [fin, setFin] = useState(DEFAULT_FINANCING)
  const [dateIso, setDateIso] = useState(DEFAULT_DATE)
  const [mode, setMode] = useState('parcelas')
  const [marked, setMarked] = useState([])
  const [amount, setAmount] = useState(DEFAULT_AMOUNT)
  const [effect, setEffect] = useState('prazo')
  const [proRata, setProRata] = useState('dias')
  const dateId = useId()
  const amountId = useId()

  const patchFin = patch => setFin(prev => ({ ...prev, ...patch }))

  const terms = readFinancing(fin)
  const installments = terms.error || !dateIso
    ? null
    : contractInstallments({ ...terms, dateIso })
  const openMonths = new Set(
    installments && !installments.error ? installments.rows.filter(row => !row.due).map(row => row.month) : []
  )
  const selected = marked.filter(month => openMonths.has(month))

  const saldo = terms.error || !dateIso ? null : balanceOnDate({ ...terms, dateIso, proRata })

  let result
  if (terms.error) result = { error: terms.error }
  else if (!dateIso) result = { error: 'Informe a data da antecipação.' }
  else if (mode === 'valor') {
    result = simulatePrepayment({ ...terms, dateIso, mode, amount: parseMoney(amount), effect, proRata })
  } else {
    result = simulatePrepayment({ ...terms, dateIso, mode, marked: selected, effect, proRata })
  }

  const toggleMonth = month => {
    setMarked(prev => (prev.includes(month) ? prev.filter(item => item !== month) : [...prev, month]))
  }

  const payoffAmount = () => {
    if (saldo?.presentValue == null) return
    setAmount(formatMoneyInput(String(Math.round(saldo.presentValue * 100))))
  }

  const ready = !result.error

  return (
    <main className="page">
      <header className="hero">
        <div className="hero-copy">
          <h1>Antecipação de parcelas</h1>
          <p className="hero-lead">
            Antecipe parcelas ou amortize o saldo devedor em uma data. Veja os juros economizados, o novo saldo e a nova tabela.
          </p>
        </div>
        <div className="hero-meta">
          <AuthorCredit />
          <FeedbackLink />
        </div>
      </header>

      <section className="workspace">
        <aside className="panel form-panel">
          <h2 className="panel-title">Contrato</h2>
          <p className="panel-subtitle">Dados do financiamento que será antecipado.</p>

          <FinancingFields value={fin} onChange={patchFin} />

          <h2 className="panel-title antecipation-title">Antecipação</h2>
          <p className="panel-subtitle">Escolha a data e o que será pago antes do vencimento.</p>

          <div className="field">
            <label htmlFor={dateId}>Data da antecipação</label>
            <input id={dateId} type="date" value={dateIso} onChange={e => setDateIso(e.target.value)} />
            {saldo && !saldo.error && (
              <p className="footnote">Saldo devedor nesta data: <strong>{brl.format(saldo.presentValue)}</strong></p>
            )}
          </div>

          <div className="field">
            <label>Forma</label>
            <div className="segmented">
              <button type="button" className={mode === 'parcelas' ? 'active' : ''} onClick={() => setMode('parcelas')}>
                Escolher parcelas
              </button>
              <button type="button" className={mode === 'valor' ? 'active' : ''} onClick={() => setMode('valor')}>
                Valor do saldo
              </button>
            </div>
          </div>

          {mode === 'parcelas' && installments && !installments.error && (
            <div className="field">
              <div className="inst-list" role="group" aria-label="Parcelas">
                {installments.rows.map(row => {
                  const isMarked = selected.includes(row.month)
                  return (
                    <div key={row.month} className={`inst-row${row.due ? ' is-paid' : ''}`}>
                      <span className="inst-number">{row.month}ª</span>
                      <span className="inst-date">{formatIsoBr(row.dueIso)}</span>
                      <span className="inst-amount">{brl.format(row.payment)}</span>
                      {row.due ? (
                        <span className="inst-status paid">Paga</span>
                      ) : (
                        <label className={`inst-status${isMarked ? ' anticipate' : ' open'}`}>
                          <input
                            type="checkbox"
                            checked={isMarked}
                            onChange={() => toggleMonth(row.month)}
                          />
                          {isMarked ? 'A antecipar' : 'Em aberto'}
                        </label>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="footnote">Parcelas com vencimento até a data escolhida são consideradas pagas.</p>
            </div>
          )}

          {mode === 'valor' && (
            <div className="field">
              <label htmlFor={amountId}>Valor a amortizar</label>
              <div className="input-wrap">
                <span className="prefix">R$</span>
                <input
                  id={amountId}
                  className="has-prefix"
                  value={amount}
                  inputMode="decimal"
                  onChange={e => setAmount(formatMoneyInput(e.target.value))}
                />
              </div>
              <button type="button" className="btn-small payoff-button" onClick={payoffAmount}>
                Quitar saldo nesta data
              </button>
              <p className="footnote">Valor acima do saldo é limitado ao saldo, e a amortização vira liquidação total.</p>
            </div>
          )}

          <div className="field">
            <label>Efeito na tabela</label>
            <div className="segmented">
              {EFFECTS.map(option => (
                <button
                  key={option.id}
                  type="button"
                  className={effect === option.id ? 'active' : ''}
                  onClick={() => setEffect(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="footnote">
              {effect === 'prazo'
                ? 'Mantém o valor de cada parcela e reduz o número de parcelas.'
                : 'Mantém o prazo e recalcula as parcelas restantes pelo sistema do contrato.'}
            </p>
          </div>

          <div className="field">
            <label>Pró-rata dos juros</label>
            <div className="segmented">
              {PRORATA_OPTIONS.map(option => (
                <button
                  key={option.id}
                  type="button"
                  className={proRata === option.id ? 'active' : ''}
                  onClick={() => setProRata(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="footnote">{PRORATA_HELP[proRata]}</p>
          </div>

          {result.error && <p className="form-error" role="alert">{result.error}</p>}
          <p className="footnote">Simulação estimativa. Seguros, tarifas e correções não estão incluídos. Juros proporcionais seguem a convenção escolhida acima e descrita na memória de cálculo.</p>
        </aside>

        <div className="results">
          {!ready ? (
            <section className="panel empty">
              <div className="empty-icon">↗</div>
              <h2 className="panel-title">Sua antecipação aparecerá aqui</h2>
              <p>Preencha o contrato, escolha a data e as parcelas ou o valor a amortizar.</p>
            </section>
          ) : (
            <PrepaymentResults result={result} dateIso={dateIso} months={terms.months} />
          )}
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}

function PrepaymentResults({ result, dateIso, months }) {
  const { before, after, anticipated, position } = result
  const afterByMonth = new Map(after.schedule.map(row => [row.month, row]))
  const anticipatedMonths = new Set(anticipated.map(row => row.month))
  const elapsedDays = Math.round(position.fraction * position.periodDays)
  const elapsedPct = Math.round(position.fraction * 100)

  return (
    <>
      <section className="panel summary">
        <div className="summary-top">
          <div>
            <h2 className="panel-title">Resumo da antecipação</h2>
            <p className="panel-subtitle tight">
              {result.total
                ? 'Liquidação total do saldo devedor nesta data.'
                : result.mode === 'parcelas'
                  ? `${anticipated.length} parcela(s) antecipada(s) nesta data.`
                  : 'Amortização parcial do saldo devedor nesta data.'}
            </p>
          </div>
          <div className="status">{result.total ? 'Quitado' : 'Em andamento'}</div>
        </div>
        <div className="cards">
          <div className="metric">
            <span>Saldo devedor na data</span>
            <strong>{brl.format(before.presentValue)}</strong>
            <small>Valor presente das parcelas a vencer</small>
          </div>
          <div className="metric">
            <span>Valor amortizado</span>
            <strong>{brl.format(result.amortized)}</strong>
            <small>Pago na data</small>
          </div>
          <div className="metric metric-cet">
            <span>Juros economizados</span>
            <strong>{brl.format(result.saved)}</strong>
            <small>{brl.format(before.interest)} → {brl.format(after.interest)} de juros a partir da data</small>
          </div>
          <div className="metric">
            <span>Novo saldo devedor</span>
            <strong>{brl.format(after.presentValue)}</strong>
            <small>{result.total ? 'Nenhum saldo remanescente' : 'Após a amortização'}</small>
          </div>
          <div className="metric">
            <span>Primeira parcela depois</span>
            <strong>{after.schedule[0] ? brl.format(after.schedule[0].payment) : '—'}</strong>
            <small>{before.schedule[0] ? `Antes: ${brl.format(before.schedule[0].payment)}` : 'Sem parcelas restantes'}</small>
          </div>
          <div className="metric">
            <span>Prazo</span>
            <strong>{months} → {after.termMonths} meses</strong>
            <small>{after.installments} parcela(s) restante(s)</small>
          </div>
        </div>
      </section>

      <section className="panel memo-card">
        <h2 className="panel-title">Memória de cálculo</h2>
        <p className="panel-subtitle tight">Como cada número foi obtido.</p>
        <ul className="memo-list">
          <li>
            Data da antecipação: {formatIsoBr(dateIso)}, dentro da {position.installment}ª parcela, que vence em {formatIsoBr(position.dueIso)}.
          </li>
          {result.proRata === 'parcelas' ? (
            <li>
              Pró-rata por parcelas: a parcela corrente conta inteira. O saldo é o da tabela em{' '}
              {position.installment === 1 ? 'início do contrato' : 'último vencimento'} ({formatIsoBr(position.periodStartIso)}),
              sem juros acumulados no período.
            </li>
          ) : (
            <li>
              Pró-rata por dias: fração decorrida do período {elapsedPct}% ({elapsedDays} de {position.periodDays} dias).
              Os juros do período restante ({100 - elapsedPct}%) não são cobrados sobre o valor antecipado.
            </li>
          )}
          <li>
            Saldo devedor na data = valor presente das parcelas a vencer, descontadas à taxa do contrato:
            {' '}{brl.format(before.presentValue)}.
          </li>
          <li>
            Cada parcela antecipada é paga pelo seu valor presente na data. A diferença para o valor nominal são juros economizados.
          </li>
          <li>
            Juros a partir da data: {brl.format(before.interest)} antes, {brl.format(after.interest)} depois.
            Economia: {brl.format(result.saved)}.
          </li>
          <li>
            Sistema: {result.system === 'growing' ? 'Curva' : result.system.toUpperCase()}. Pró-rata: {result.proRata === 'parcelas' ? 'parcelas' : 'dias corridos'}.
            {' '}{result.effect === 'prazo'
              ? 'Efeito prazo: parcelas mantidas, contrato encurtado.'
              : 'Efeito parcela: prazo mantido e parcelas recalculadas pelo sistema.'}
          </li>
        </ul>
      </section>

      <section className="panel table-card">
        <div className="table-head">
          <div>
            <h2 className="panel-title">Nova tabela de parcelas</h2>
            <p className="panel-subtitle tight">Parcelas originais, antecipadas e as que restam depois da data.</p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Parcela</th>
                <th>Vencimento</th>
                <th>Situação</th>
                <th>Valor antes</th>
                <th>Valor depois</th>
                <th>Juros depois</th>
                <th>Saldo depois</th>
              </tr>
            </thead>
            <tbody>
              {before.schedule.map(row => {
                const next = afterByMonth.get(row.month)
                const isAnticipated = anticipatedMonths.has(row.month)
                let status = 'Em aberto'
                if (isAnticipated) status = 'Antecipada'
                else if (!next) status = result.total ? 'Quitada na data' : 'Quitada antes'
                return (
                  <tr key={row.month}>
                    <td>{row.month}</td>
                    <td>{formatIsoBr(row.dueIso)}</td>
                    <td>{status}</td>
                    <td>{brl.format(row.payment)}</td>
                    <td>{next ? brl.format(next.payment) : '—'}</td>
                    <td>{next ? brl.format(next.interest) : '—'}</td>
                    <td>{next ? brl.format(next.balance) : '—'}</td>
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
