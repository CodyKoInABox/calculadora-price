import { useId } from 'react'
import CurveEditor from './CurveEditor'
import InterestField from './InterestField'
import { formatMoneyInput } from '../format'
import { curvePresets } from '../engine/math'

const SYSTEM_OPTIONS = [
  { id: 'price', label: 'Price' },
  { id: 'sac', label: 'SAC' },
  { id: 'growing', label: 'Curva' }
]

export default function FinancingFields({ value, onChange }) {
  const propertyId = useId()
  const downId = useId()
  const monthsId = useId()
  const interestId = useId()
  const firstDueId = useId()

  return (
    <>
      <div className="field">
        <label htmlFor={propertyId}>Valor total do bem</label>
        <div className="input-wrap">
          <span className="prefix">R$</span>
          <input
            id={propertyId}
            className="has-prefix"
            value={value.propertyValue}
            inputMode="decimal"
            onChange={e => onChange({ propertyValue: formatMoneyInput(e.target.value) })}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor={downId}>Entrada</label>
        <div className="input-wrap">
          <span className="prefix">R$</span>
          <input
            id={downId}
            className="has-prefix"
            value={value.downPayment}
            inputMode="decimal"
            onChange={e => onChange({ downPayment: formatMoneyInput(e.target.value) })}
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor={monthsId}>Prazo</label>
          <div className="input-wrap">
            <input
              id={monthsId}
              type="number"
              value={value.months}
              min={1}
              max={600}
              className="has-suffix"
              onChange={e => onChange({ months: e.target.value })}
            />
            <span className="suffix">meses</span>
          </div>
        </div>
        <InterestField
          id={interestId}
          interest={value.interest}
          ratePeriod={value.ratePeriod}
          onInterestChange={interest => onChange({ interest })}
          onPeriodChange={(ratePeriod, interest) => onChange({ ratePeriod, interest })}
        />
      </div>

      <div className="field">
        <label>Sistema de amortização</label>
        <div className="segmented segmented-3">
          {SYSTEM_OPTIONS.map(option => (
            <button
              key={option.id}
              type="button"
              className={value.system === option.id ? 'active' : ''}
              onClick={() => onChange({ system: option.id })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {value.system === 'growing' && (
        <div className="field">
          <CurveEditor
            controls={value.curveControls}
            activePreset={value.activePreset}
            onChange={(curveControls, activePreset) => onChange({ curveControls, activePreset })}
            onPreset={id => onChange({ curveControls: [...curvePresets[id]], activePreset: id })}
          />
        </div>
      )}

      <div className="field">
        <label htmlFor={firstDueId}>Data da primeira parcela</label>
        <input
          id={firstDueId}
          type="date"
          value={value.firstDue}
          onChange={e => onChange({ firstDue: e.target.value })}
        />
        <p className="footnote">O contrato começa um mês antes desta data.</p>
      </div>
    </>
  )
}
