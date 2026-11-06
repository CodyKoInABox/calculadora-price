import { formatMoneyInput } from '../format'

export default function ExtrasEditor({
  enabled,
  extras,
  extraEffect,
  onToggle,
  onEffectChange,
  onAdd,
  onPatch,
  onRemove
}) {
  return (
    <>
      <div className="switch-line">
        <div className="switch-copy">
          <strong>Pagamentos extras</strong>
          <span>Pagamentos pontuais ou amortização recorrente</span>
        </div>
        <label className="switch">
          <input type="checkbox" checked={enabled} onChange={e => onToggle(e.target.checked)} />
          <span className="slider" />
        </label>
      </div>

      {enabled && (
        <div className="conditional visible balloons">
          <div className="field">
            <label>Efeito dos extras</label>
            <div className="segmented">
              <button
                type="button"
                className={extraEffect === 'payment' ? 'active' : ''}
                onClick={() => onEffectChange('payment')}
              >
                Reduzir parcela
              </button>
              <button
                type="button"
                className={extraEffect === 'term' ? 'active' : ''}
                onClick={() => onEffectChange('term')}
              >
                Reduzir prazo
              </button>
            </div>
          </div>

          <div className="balloons-head">
            <strong>Extras programados</strong>
            <button type="button" className="btn-small" onClick={onAdd}>+ Adicionar</button>
          </div>

          <div>
            {extras.map(item => {
              const recurrence = item.recurrence || 'once'
              return (
                <div className="balloon-item balloon-item-extra" key={item.id}>
                  <div className="balloon-extra-top">
                    <select
                      value={recurrence}
                      aria-label="Recorrência"
                      onChange={e => onPatch(item.id, { recurrence: e.target.value })}
                    >
                      <option value="once">Único</option>
                      <option value="monthly">Todo mês</option>
                      <option value="yearly">Todo ano</option>
                      <option value="every">A cada N meses</option>
                    </select>
                    <button
                      type="button"
                      className="remove"
                      aria-label="Remover extra"
                      onClick={() => onRemove(item.id)}
                    >
                      ×
                    </button>
                  </div>

                  <div className={`balloon-extra-fields${recurrence === 'every' ? ' has-every' : ''}`}>
                    {recurrence === 'every' && (
                      <div className="input-wrap">
                        <input
                          type="number"
                          min={2}
                          value={item.everyN ?? 6}
                          className="has-suffix"
                          aria-label="Intervalo em meses"
                          onChange={e => onPatch(item.id, { everyN: e.target.value })}
                        />
                        <span className="suffix">meses</span>
                      </div>
                    )}

                    <div className="input-wrap">
                      <input
                        type="number"
                        min={1}
                        value={item.month}
                        className="has-suffix"
                        aria-label={recurrence === 'once' ? 'Mês do extra' : 'Mês inicial'}
                        onChange={e => onPatch(item.id, { month: e.target.value })}
                      />
                      <span className="suffix">{recurrence === 'once' ? 'mês' : 'início'}</span>
                    </div>

                    <div className="input-wrap balloon-extra-amount">
                      <span className="prefix">R$</span>
                      <input
                        value={item.amount}
                        className="has-prefix"
                        aria-label="Valor do extra"
                        onChange={e => onPatch(item.id, { amount: formatMoneyInput(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="footnote">
            {extraEffect === 'term'
              ? 'Os extras amortizam o saldo e encurtam o prazo; a parcela contratada permanece. Juros do período continuam calculados normalmente.'
              : 'Os extras amortizam o saldo e reduzem a parcela para liquidar no prazo contratado. Juros do período continuam calculados normalmente.'}
          </div>
        </div>
      )}
    </>
  )
}
