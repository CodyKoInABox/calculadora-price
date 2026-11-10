import { useId, useState } from 'react'
import FinancingFields from './FinancingFields'
import { AuthorCredit, FeedbackLink, SiteFooter } from './SiteMeta'
import { brl } from '../format'
import {
  DEFAULT_FINANCING,
  PRORATA_HELP,
  PRORATA_OPTIONS,
  formatIsoBr,
  parseIntegerInput,
  parsePercentInput,
  readFinancing
} from '../calcShared'
import { contractInstallments } from '../engine/contract'
import {
  calculateCollection,
  DEFAULT_COLLECTION_RULES,
  FINE_CONSUMER_LIMIT_PCT
} from '../engine/collection'

const DEFAULT_CALC_DATE = '2027-04-25'
const DEFAULT_NOTICE_DATE = '2027-04-10'
const DEFAULT_UNPAID = [3, 4, 5]

function FineWarning({ role = 'status' }) {
  return (
    <div className="curve-warning fine-warning" role={role}>
      <strong>Multa acima de {FINE_CONSUMER_LIMIT_PCT}%</strong>
      <span>
        O CDC (art. 52, §1º) limita a multa moratória a {FINE_CONSUMER_LIMIT_PCT}% em contratos de consumo.
        O cálculo não foi bloqueado: confira o contrato antes de cobrar.
      </span>
    </div>
  )
}

export default function CollectionPage() {
  const [fin, setFin] = useState(DEFAULT_FINANCING)
  const [calcDate, setCalcDate] = useState(DEFAULT_CALC_DATE)
  const [noticeDate, setNoticeDate] = useState(DEFAULT_NOTICE_DATE)
  const [finePct, setFinePct] = useState('')
  const [moraPct, setMoraPct] = useState('')
  const [unpaid, setUnpaid] = useState(DEFAULT_UNPAID)
  const [proRata, setProRata] = useState('dias')
  const [minOverdue, setMinOverdue] = useState(String(DEFAULT_COLLECTION_RULES.minOverdue))
  const [noticeRule, setNoticeRule] = useState(String(DEFAULT_COLLECTION_RULES.noticeDays))
  const [moraDays, setMoraDays] = useState(String(DEFAULT_COLLECTION_RULES.moraDaysPerMonth))
  const calcId = useId()
  const noticeId = useId()
  const fineId = useId()
  const moraId = useId()
  const minOverdueId = useId()
  const noticeRuleId = useId()
  const moraDaysId = useId()

  const fineValue = parsePercentInput(finePct)

  const patchFin = patch => setFin(prev => ({ ...prev, ...patch }))

  const terms = readFinancing(fin)
  const schedule = terms.error || !calcDate
    ? null
    : contractInstallments({ ...terms, dateIso: calcDate })
  const dueRows = schedule && !schedule.error ? schedule.rows.filter(row => row.due) : []

  let result
  if (terms.error) result = { error: terms.error }
  else if (!calcDate) result = { error: 'Informe a data do cálculo.' }
  else {
    result = calculateCollection({
      ...terms,
      calcDateIso: calcDate,
      noticeDateIso: noticeDate || null,
      overdue: dueRows.map(row => ({ month: row.month, paid: !unpaid.includes(row.month) })),
      finePct: fineValue,
      moraMonthlyPct: parsePercentInput(moraPct),
      proRata,
      minOverdue: parseIntegerInput(minOverdue),
      noticeDays: parseIntegerInput(noticeRule),
      moraDaysPerMonth: Number(moraDays)
    })
  }

  const toggleUnpaid = month => {
    setUnpaid(prev => (prev.includes(month) ? prev.filter(item => item !== month) : [...prev, month]))
  }

  const ready = !result.error

  return (
    <main className="page">
      <header className="hero">
        <div className="hero-copy">
          <h1>Cobrança e vencimento antecipado</h1>
          <p className="hero-lead">
            Calcule o total exigível do saldo após parcelas vencidas e não pagas, com o abatimento dos juros futuros e os encargos.
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
          <p className="panel-subtitle">Dados do financiamento em cobrança.</p>

          <FinancingFields value={fin} onChange={patchFin} />

          <h2 className="panel-title antecipation-title">Cobrança</h2>
          <p className="panel-subtitle">Data do cálculo, notificação e encargos.</p>

          <div className="field">
            <label htmlFor={calcId}>Data do cálculo</label>
            <input id={calcId} type="date" value={calcDate} onChange={e => setCalcDate(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor={noticeId}>Data da notificação</label>
            <input id={noticeId} type="date" value={noticeDate} onChange={e => setNoticeDate(e.target.value)} />
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor={minOverdueId}>Mínimo de vencidas</label>
              <input
                id={minOverdueId}
                type="number"
                min="1"
                inputMode="numeric"
                value={minOverdue}
                onChange={e => setMinOverdue(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={noticeRuleId}>Prazo de notificação</label>
              <div className="input-wrap">
                <input
                  id={noticeRuleId}
                  type="number"
                  min="0"
                  inputMode="numeric"
                  className="has-suffix"
                  value={noticeRule}
                  onChange={e => setNoticeRule(e.target.value)}
                />
                <span className="suffix">dias</span>
              </div>
            </div>
          </div>
          <p className="footnote">Requisitos checados para o vencimento antecipado. Informativos: o cálculo sai mesmo se não forem atendidos.</p>

          <div className="field-row">
            <div className="field">
              <label htmlFor={fineId}>Multa</label>
              <div className="input-wrap">
                <input
                  id={fineId}
                  inputMode="decimal"
                  value={finePct}
                  placeholder="0"
                  className="has-suffix"
                  onChange={e => setFinePct(e.target.value.replace(/[^0-9.,]/g, ''))}
                />
                <span className="suffix">%</span>
              </div>
              {fineValue > FINE_CONSUMER_LIMIT_PCT && <FineWarning />}
            </div>
            <div className="field">
              <label htmlFor={moraId}>Juros de mora</label>
              <div className="input-wrap">
                <input
                  id={moraId}
                  inputMode="decimal"
                  value={moraPct}
                  placeholder="0"
                  className="has-suffix"
                  onChange={e => setMoraPct(e.target.value.replace(/[^0-9.,]/g, ''))}
                />
                <span className="suffix">% a.m.</span>
              </div>
            </div>
          </div>
          <div className="field">
            <label htmlFor={moraDaysId}>Dias por mês na mora</label>
            <input
              id={moraDaysId}
              type="number"
              min="1"
              inputMode="numeric"
              value={moraDays}
              onChange={e => setMoraDays(e.target.value)}
            />
            <p className="footnote">Mora pro-rata: taxa mensal × dias de atraso / dias por mês. Multa incide sobre as vencidas não pagas.</p>
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

          {schedule && !schedule.error && (
            <div className="field">
              <label>Parcelas vencidas até a data</label>
              <div className="inst-list" role="group" aria-label="Parcelas vencidas">
                {dueRows.length === 0 && <p className="footnote">Nenhuma parcela venceu até a data.</p>}
                {dueRows.map(row => {
                  const isUnpaid = unpaid.includes(row.month)
                  return (
                    <div key={row.month} className="inst-row">
                      <span className="inst-number">{row.month}ª</span>
                      <span className="inst-date">{formatIsoBr(row.dueIso)}</span>
                      <span className="inst-amount">{brl.format(row.payment)}</span>
                      <label className={`inst-status${isUnpaid ? ' overdue' : ' paid'}`}>
                        <input type="checkbox" checked={!isUnpaid} onChange={() => toggleUnpaid(row.month)} />
                        {isUnpaid ? 'Em atraso' : 'Paga'}
                      </label>
                    </div>
                  )
                })}
              </div>
              <p className="footnote">Desmarque as parcelas que não foram pagas.</p>
            </div>
          )}

          {result.error && <p className="form-error" role="alert">{result.error}</p>}
          <p className="footnote">Simulação estimativa, para conferência do cálculo. Não substitui análise jurídica nem a notificação formal do vencimento antecipado.</p>
        </aside>

        <div className="results">
          {!ready ? (
            <section className="panel empty">
              <div className="empty-icon">↗</div>
              <h2 className="panel-title">O total exigível aparecerá aqui</h2>
              <p>Preencha o contrato, a data do cálculo e marque as parcelas em atraso.</p>
            </section>
          ) : (
            <CollectionResults result={result} />
          )}
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}

function CollectionResults({ result }) {
  const { checks, unpaid, future, balance, abated, charges, demand, rules, warnings } = result
  const unpaidNominal = unpaid.reduce((total, item) => total + item.nominal, 0)

  return (
    <>
      <section className="panel summary">
        <div className="summary-top">
          <div>
            <h2 className="panel-title">Total exigível</h2>
            <p className="panel-subtitle tight">
              {checks.eligible
                ? 'Requisitos atendidos para declarar o vencimento antecipado.'
                : 'Requisitos pendentes: o valor é calculado, mas a declaração ainda não está apta.'}
            </p>
          </div>
          <div className={`status${checks.eligible ? '' : ' status-pending'}`}>
            {checks.eligible ? 'Apto' : 'Pendente'}
          </div>
        </div>

        <ul className="check-list">
          <li className={checks.overdueOk ? 'ok' : 'fail'}>
            <span aria-hidden="true">{checks.overdueOk ? '✓' : '✗'}</span>
            {`Parcelas vencidas e não pagas: ${checks.overdueCount} (mínimo ${rules.minOverdue})`}
          </li>
          <li className={checks.noticeOk ? 'ok' : 'fail'}>
            <span aria-hidden="true">{checks.noticeOk ? '✓' : '✗'}</span>
            {checks.noticeDays == null
              ? 'Notificação: informe a data da notificação'
              : `Notificação: ${checks.noticeDays} dias corridos antes do cálculo (mínimo ${rules.noticeDays})`}
          </li>
        </ul>

        {warnings.fineAboveConsumerLimit && <FineWarning role="alert" />}

        <div className="cards">
          <div className="metric">
            <span>Saldo devedor na data</span>
            <strong>{brl.format(balance)}</strong>
            <small>Vencidas não pagas + parcelas a vencer</small>
          </div>
          <div className="metric">
            <span>Juros futuros abatidos</span>
            <strong>− {brl.format(abated)}</strong>
            <small>Juros que ainda não incorreram</small>
          </div>
          <div className="metric">
            <span>Encargos moratórios</span>
            <strong>+ {brl.format(charges.total)}</strong>
            <small>Multa {brl.format(charges.fine)} · mora {brl.format(charges.mora)}</small>
          </div>
          <div className="metric metric-cet">
            <span>Total exigível</span>
            <strong>{brl.format(demand)}</strong>
            <small>Saldo − juros abatidos + encargos</small>
          </div>
        </div>
      </section>

      <section className="panel memo-card">
        <h2 className="panel-title">Memória de cálculo</h2>
        <p className="panel-subtitle tight">Cada linha do total exigível.</p>
        <div className="table-scroll">
          <table className="memo-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Referência</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {unpaid.map(item => (
                <tr key={item.month}>
                  <td>Parcela {item.month}ª vencida e não paga</td>
                  <td>{formatIsoBr(item.dueIso)} · {item.daysLate} dias de atraso</td>
                  <td>{brl.format(item.nominal)}</td>
                </tr>
              ))}
              {unpaid.map(item => (
                <tr key={`mora-${item.month}`}>
                  <td>Mora da parcela {item.month}ª</td>
                  <td>pro-rata por dias / 30</td>
                  <td>{brl.format(item.mora)}</td>
                </tr>
              ))}
              <tr>
                <td>Multa sobre vencidas</td>
                <td>{brl.format(unpaidNominal)} de base</td>
                <td>{brl.format(charges.fine)}</td>
              </tr>
              <tr>
                <td>Parcelas a vencer (valor nominal)</td>
                <td>
                  {future.installments
                    ? `${future.installments} parcela(s), de ${formatIsoBr(future.firstDueIso)} a ${formatIsoBr(future.lastDueIso)}`
                    : 'Nenhuma'}
                </td>
                <td>{brl.format(future.nominal)}</td>
              </tr>
              <tr className="memo-subtotal">
                <td>Saldo devedor na data</td>
                <td>vencidas + a vencer</td>
                <td>{brl.format(balance)}</td>
              </tr>
              <tr>
                <td>Juros futuros abatidos</td>
                <td>a vencer nominal − valor presente à taxa do contrato ({result.proRata === 'parcelas' ? 'pró-rata por parcelas' : 'pró-rata por dias'})</td>
                <td>− {brl.format(abated)}</td>
              </tr>
              <tr>
                <td>Encargos moratórios</td>
                <td>multa + mora ({rules.moraDaysPerMonth} dias por mês)</td>
                <td>+ {brl.format(charges.total)}</td>
              </tr>
              <tr className="memo-total">
                <td>Total exigível</td>
                <td>saldo − juros abatidos + encargos</td>
                <td>{brl.format(demand)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

    </>
  )
}
