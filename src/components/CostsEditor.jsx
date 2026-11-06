import { useId } from 'react'
import { formatMoneyInput } from '../format'

function sanitizePercent(raw) {
  return raw.replace(/[^0-9.,]/g, '')
}

export default function CostsEditor({ values, onChange }) {
  const upfrontId = useId()
  const adminId = useId()
  const mipId = useId()
  const dfiId = useId()

  return (
    <details className="costs-editor">
      <summary>
        <span>
          Seguros e taxas
          <small>Entram só no CET. A parcela não muda.</small>
        </span>
      </summary>
      <div className="costs-editor-grid">
        <div className="field">
          <label htmlFor={upfrontId}>Tarifas iniciais</label>
          <div className="input-wrap">
            <span className="prefix">R$</span>
            <input
              id={upfrontId}
              className="has-prefix"
              inputMode="decimal"
              placeholder="0,00"
              value={values.upfront}
              onChange={e => onChange({ upfront: formatMoneyInput(e.target.value) })}
            />
          </div>
          <p className="footnote">Avaliação, registro e cartório. Pagas uma vez.</p>
        </div>

        <div className="field">
          <label htmlFor={adminId}>Taxa de administração</label>
          <div className="input-wrap">
            <span className="prefix">R$</span>
            <input
              id={adminId}
              className="has-prefix"
              inputMode="decimal"
              placeholder="0,00"
              value={values.monthlyAdmin}
              onChange={e => onChange({ monthlyAdmin: formatMoneyInput(e.target.value) })}
            />
            <span className="suffix">/mês</span>
          </div>
        </div>

        <div className="field">
          <label htmlFor={mipId}>MIP</label>
          <div className="input-wrap">
            <input
              id={mipId}
              className="has-suffix"
              inputMode="decimal"
              placeholder="0"
              value={values.mipMonthly}
              onChange={e => onChange({ mipMonthly: sanitizePercent(e.target.value) })}
            />
            <span className="suffix">% a.m.</span>
          </div>
          <p className="footnote">Sobre o saldo devedor. Diminui com as amortizações.</p>
        </div>

        <div className="field">
          <label htmlFor={dfiId}>DFI</label>
          <div className="input-wrap">
            <input
              id={dfiId}
              className="has-suffix"
              inputMode="decimal"
              placeholder="0"
              value={values.dfiAnnual}
              onChange={e => onChange({ dfiAnnual: sanitizePercent(e.target.value) })}
            />
            <span className="suffix">% a.a.</span>
          </div>
          <p className="footnote">Sobre o valor do imóvel.</p>
        </div>
      </div>
    </details>
  )
}
