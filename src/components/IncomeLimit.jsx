import { useId, useState } from 'react'
import { brl, formatMoneyInput, number } from '../format'
import { parseMoney } from '../engine/math'

const SHARES = [25, 30, 35]

export default function IncomeLimit({ onApply }) {
  const [income, setIncome] = useState('')
  const [share, setShare] = useState(30)
  const incomeId = useId()

  const incomeValue = parseMoney(income)
  const limit = incomeValue * share / 100

  return (
    <details className="soft-details">
      <summary>
        <span>
          Calcular pela renda
          <small>A parcela máxima vira uma fração da sua renda bruta.</small>
        </span>
      </summary>
      <div className="soft-details-stack">
        <div className="field">
          <label htmlFor={incomeId}>Renda bruta mensal</label>
          <div className="input-wrap">
            <span className="prefix">R$</span>
            <input
              id={incomeId}
              className="has-prefix"
              inputMode="decimal"
              placeholder="0,00"
              value={income}
              onChange={e => setIncome(formatMoneyInput(e.target.value))}
            />
          </div>
        </div>
        <div className="field">
          <span className="field-label">Comprometimento da renda</span>
          <div className="segmented segmented-3">
            {SHARES.map(option => (
              <button
                key={option}
                type="button"
                className={share === option ? 'active' : ''}
                onClick={() => setShare(option)}
              >
                {option}%
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="btn-small income-apply"
          disabled={incomeValue <= 0}
          onClick={() => onApply(number.format(limit))}
        >
          Usar {brl.format(limit)} como parcela máxima
        </button>
      </div>
    </details>
  )
}
