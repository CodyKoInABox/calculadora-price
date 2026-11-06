import { useId, useState } from 'react'
import { cleanName } from '../savedScenarios'
import { MAX_COMPARE } from '../multiCompare'

function formatSavedAt(value) {
  if (!Number.isFinite(value)) return 'Importado'
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function ScenariosPanel({ items, error, onSave, onLoad, onDelete, onExport, onImport, onCompare }) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState([])
  const nameId = useId()
  const fileId = useId()

  const selectedItems = items.filter(item => selected.includes(item.id))

  const submit = e => {
    e.preventDefault()
    const clean = cleanName(name)
    if (!clean) return
    onSave(clean)
    setName('')
  }

  const toggle = id => {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      return prev.length < MAX_COMPARE ? [...prev, id] : prev
    })
  }

  return (
    <details className="soft-details scenarios-details">
      <summary>
        <span>
          Cenários salvos
          <small>{items.length ? `${items.length} salvo${items.length > 1 ? 's' : ''} neste navegador` : 'Guarde configurações para comparar depois'}</small>
        </span>
      </summary>

      <form className="scenario-save" onSubmit={submit}>
        <label htmlFor={nameId}>Nome do cenário</label>
        <div className="scenario-save-row">
          <input
            id={nameId}
            value={name}
            maxLength={80}
            placeholder="Ex.: Caixa 30 anos"
            onChange={e => setName(e.target.value)}
          />
          <button type="submit" className="btn-small" disabled={!cleanName(name)}>
            Salvar atual
          </button>
        </div>
      </form>

      {items.length === 0 ? (
        <p className="footnote">Nenhum cenário salvo ainda.</p>
      ) : (
        <>
          <p className="footnote">Marque de 2 a {MAX_COMPARE} cenários para comparar lado a lado.</p>
          <ul className="scenario-items">
            {items.map(item => {
              const checked = selected.includes(item.id)
              return (
                <li key={item.id} className="scenario-item">
                  <input
                    type="checkbox"
                    className="scenario-check"
                    checked={checked}
                    disabled={!checked && selectedItems.length >= MAX_COMPARE}
                    onChange={() => toggle(item.id)}
                    aria-label={`Comparar ${item.name}`}
                  />
                  <div className="scenario-meta">
                    <strong>{item.name}</strong>
                    <small>{formatSavedAt(item.savedAt)}</small>
                  </div>
                  <div className="scenario-actions">
                    <button type="button" className="btn-small" onClick={() => onLoad(item)}>
                      Carregar
                    </button>
                    <button
                      type="button"
                      className="btn-small btn-ghost"
                      onClick={() => onDelete(item.id)}
                      aria-label={`Excluir ${item.name}`}
                    >
                      Excluir
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <div className="scenario-io">
        <button
          type="button"
          className="btn-small"
          disabled={selectedItems.length < 2}
          onClick={() => onCompare(selectedItems)}
        >
          Comparar ({selectedItems.length})
        </button>
        <button type="button" className="btn-small" onClick={onExport} disabled={!items.length}>
          Exportar JSON
        </button>
        <label htmlFor={fileId} className="btn-small file-trigger">
          Importar JSON
        </label>
        <input
          id={fileId}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) onImport(file)
            e.target.value = ''
          }}
        />
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
    </details>
  )
}
