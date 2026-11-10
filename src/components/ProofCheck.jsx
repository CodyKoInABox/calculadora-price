import { useId, useState } from 'react'
import { proofCheck } from '../engine/proof'
import { brl } from '../format'

function checkLabels(id, correction) {
  const withTr = correction > 0 ? ' + correção TR' : ''
  switch (id) {
    case 'amortization':
      return { left: 'Amortizado + saldo devedor', right: `Financiado${withTr}` }
    case 'paid':
      return { left: 'Total pago + saldo devedor', right: `Financiado + juros${withTr}` }
    case 'interest':
      return { left: 'Juros somados na tabela', right: correction > 0 ? 'Total pago − financiado − correção TR' : 'Total pago − financiado' }
    case 'totals':
      return { left: 'Juros somados na tabela', right: 'Juros do resumo' }
    case 'totals-paid':
      return { left: 'Pagamentos somados na tabela', right: 'Pagamentos do resumo' }
    default:
      return { left: id, right: id }
  }
}

export default function ProofCheck({ result }) {
  const [monthInput, setMonthInput] = useState('')
  const titleId = useId()
  const monthId = useId()
  const total = result.schedule.length
  const proof = proofCheck(result, monthInput === '' ? total : Number(monthInput))
  if (!proof) return null

  return (
    <section className="panel proof-card" aria-labelledby={titleId}>
      <div className="proof-head">
        <div>
          <h2 id={titleId} className="panel-title">Prova real</h2>
          <p className="panel-subtitle tight">
            Confere se as contas da tabela fecham, sem usar os totais do resumo como base.
          </p>
        </div>
        <span className={`proof-status ${proof.ok ? 'ok' : 'fail'}`} role="status">
          {proof.ok ? '✓ Contas conferem' : 'Divergência encontrada'}
        </span>
      </div>

      <div className="proof-controls">
        <label htmlFor={monthId}>Conferir até o mês</label>
        <input
          id={monthId}
          type="number"
          min={1}
          max={total}
          value={monthInput}
          placeholder={String(total)}
          onChange={e => setMonthInput(e.target.value)}
        />
        <span>de {total}</span>
      </div>

      <div className="proof-summary">
        <div className="metric">
          <span>Financiado</span>
          <strong>{brl.format(proof.principal)}</strong>
        </div>
        <div className="metric">
          <span>Juros até o mês {proof.month}</span>
          <strong>{brl.format(proof.interest)}</strong>
        </div>
        <div className="metric">
          <span>Saldo devedor</span>
          <strong>{brl.format(proof.balance)}</strong>
          <small>{proof.settled ? 'Quitado no fim do prazo' : 'Ainda em aberto neste mês'}</small>
        </div>
      </div>

      <ul className="proof-checks">
        {proof.checks.map(item => {
          const labels = checkLabels(item.id, proof.correction)
          return (
            <li key={item.id} className={item.ok ? 'ok' : 'fail'}>
              <span className="proof-check-mark" aria-hidden="true">{item.ok ? '✓' : '!'}</span>
              <div className="proof-check-body">
                <span>{labels.left} = {labels.right}</span>
                <strong>
                  {brl.format(item.left)} = {brl.format(item.right)}
                  {!item.ok && <> · diferença {brl.format(item.diff)}</>}
                </strong>
              </div>
            </li>
          )
        })}
      </ul>

      <p className="footnote">Diferenças de até 1 centavo são arredondamentos da tabela.</p>
    </section>
  )
}
