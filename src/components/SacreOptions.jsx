import { useId } from 'react'

function sanitizePercent(raw) {
  return raw.replace(/[^0-9.,]/g, '')
}

export default function SacreOptions({ enabled, disabled, onToggle, trValue, onTrChange }) {
  const trId = useId()

  return (
    <div className="sacre-options">
      <div className="switch-line">
        <div className="switch-copy">
          <strong>SACRE</strong>
          <span>Parcela reajustada a cada 12 meses sobre o saldo corrigido</span>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={enabled}
            disabled={disabled}
            onChange={e => onToggle(e.target.checked)}
          />
          <span className="slider" />
        </label>
      </div>

      {disabled && (
        <p className="footnote">Disponível só no cálculo direto. O limite de renda usa Price.</p>
      )}

      {enabled && !disabled && (
        <div className="sacre-tr">
          <div className="field">
            <label htmlFor={trId}>Correção do saldo (TR)</label>
            <div className="input-wrap">
              <input
                id={trId}
                className="has-suffix"
                inputMode="decimal"
                placeholder="0,20"
                value={trValue}
                onChange={e => onTrChange(sanitizePercent(e.target.value))}
              />
              <span className="suffix">% a.m.</span>
            </div>
            <p className="footnote">Somada ao saldo todo mês. Sem TR, o SACRE é igual à Price.</p>
          </div>
        </div>
      )}
    </div>
  )
}
