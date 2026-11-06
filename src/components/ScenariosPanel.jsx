import { useId, useState } from 'react'
import { cleanName } from '../savedScenarios'

function formatSavedAt(value) {
  if (!Number.isFinite(value)) return 'Importado'
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function ScenariosPanel({ items, error, onSave, onLoad, onDelete, onExport, onImport }) {
  const [name, setName] = useState('')
  const nameId = useId()
  const fileId = useId()

  const submit = e => {
    e.preventDefault()
    const clean = cleanName(name)
    if (!clean) return
    onSave(clean)
    setName('')
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
        <ul className="scenario-items">
          {items.map(item => (
            <li key={item.id} className="scenario-item">
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
          ))}
        </ul>
      )}

      <div className="scenario-io">
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
