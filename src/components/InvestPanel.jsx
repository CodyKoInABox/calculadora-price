import { useId } from 'react'
import { brl, percentAa } from '../format'

function sanitizePercent(raw) {
  return raw.replace(/[^0-9.,]/g, '')
}

function breakEvenText(invest) {
  if (Number.isNaN(invest.breakEvenAnnual)) {
    return 'Nenhuma taxa até 100% a.a. faz o investimento superar a amortização.'
  }
  if (invest.breakEvenAnnual === 0) {
    return 'Qualquer rendimento positivo supera os juros economizados.'
  }
  const taxNote = invest.taxed ? ' líquido de IR' : ''
  return `Investir só compensa com rendimento acima de ${percentAa(invest.breakEvenAnnual)} bruto${taxNote}.`
}

export default function InvestPanel({ invest, inputs, onChange }) {
  const rateId = useId()
  const exemptId = useId()
  const amortizeWins = invest.interestSaved >= invest.invested.net
  const difference = Math.abs(invest.interestSaved - invest.invested.net)

  return (
    <section className="panel invest-panel">
      <div className="invest-head">
        <div>
          <h2 className="panel-title">Amortizar ou investir?</h2>
          <p className="panel-subtitle tight">
            Mesmo dinheiro dos extras, comparado com aplicá-lo até o fim do contrato.
          </p>
        </div>
        <div className="invest-input">
          <label htmlFor={rateId}>Rendimento do investimento</label>
          <div className="input-wrap">
            <input
              id={rateId}
              className="has-suffix"
              inputMode="decimal"
              value={inputs.rate}
              onChange={e => onChange({ rate: sanitizePercent(e.target.value) })}
            />
            <span className="suffix">% a.a.</span>
          </div>
          <label className="invest-exempt" htmlFor={exemptId}>
            <input
              id={exemptId}
              type="checkbox"
              checked={!inputs.taxed}
              onChange={e => onChange({ taxed: !e.target.checked })}
            />
            Isento de IR (LCI, LCA)
          </label>
        </div>
      </div>

      <div className="invest-compare">
        <div className="metric">
          <span>Juros economizados ao amortizar</span>
          <strong>{brl.format(invest.interestSaved)}</strong>
        </div>
        <div className="metric">
          <span>Rendimento líquido investindo</span>
          <strong>{brl.format(invest.invested.net)}</strong>
          <small>
            Bruto {brl.format(invest.invested.gross)}
            {invest.taxed ? ` · IR ${brl.format(invest.invested.ir)}` : ' · isento'}
          </small>
        </div>
      </div>

      <p className={`invest-verdict ${amortizeWins ? 'amortize' : 'invest'}`}>
        {amortizeWins
          ? <>Amortizar rende <strong>{brl.format(difference)}</strong> a mais.</>
          : <>Investir rende <strong>{brl.format(difference)}</strong> a mais.</>}
      </p>
      <p className="footnote">{breakEvenText(invest)}</p>
      <p className="footnote">Simulação simplificada: não considera reinvestimento de parcelas economizadas nem variação da taxa.</p>
    </section>
  )
}
