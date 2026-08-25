import { parseYearMonthInput, yearMonthInputValue } from '../format'

export default function StartMonthPicker({ value, onChange }) {
  return (
    <label className="start-month">
      <span>1º vencimento</span>
      <input
        type="month"
        value={yearMonthInputValue(value)}
        aria-label="Mês inicial da tabela"
        onChange={e => {
          const next = parseYearMonthInput(e.target.value)
          if (next) onChange(next)
        }}
      />
    </label>
  )
}
