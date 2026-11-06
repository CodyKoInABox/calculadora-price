import { annualToMonthly, monthlyToAnnual } from '../engine/math'
import { formatRatePct, formatRatePctLabel } from '../appState'

export default function InterestField({ id, interest, ratePeriod, onInterestChange, onPeriodChange }) {
  const period = ratePeriod === 'aa' ? 'aa' : 'am'
  const i = Math.max(0, Number(interest) || 0) / 100
  const equiv = period === 'aa' ? annualToMonthly(i) : monthlyToAnnual(i)
  const equivUnit = period === 'aa' ? 'mês' : 'ano'

  return (
    <div className="field">
      <label htmlFor={id}>Juros</label>
      <div className="segmented rate-period">
        <button
          type="button"
          className={period === 'am' ? 'active' : ''}
          onClick={() => {
            if (period === 'am') return
            onPeriodChange('am', formatRatePct(annualToMonthly(i)))
          }}
        >
          Mês
        </button>
        <button
          type="button"
          className={period === 'aa' ? 'active' : ''}
          onClick={() => {
            if (period === 'aa') return
            onPeriodChange('aa', formatRatePct(monthlyToAnnual(i)))
          }}
        >
          Ano
        </button>
      </div>
      <div className="input-wrap">
        <input
          id={id}
          type="number"
          value={interest}
          min={0}
          step={0.01}
          className="has-suffix"
          onChange={e => onInterestChange(e.target.value)}
        />
        <span className="suffix">%</span>
      </div>
      <p className="footnote rate-equiv">≈ {formatRatePctLabel(equiv)}% ao {equivUnit} (efetivo)</p>
    </div>
  )
}
