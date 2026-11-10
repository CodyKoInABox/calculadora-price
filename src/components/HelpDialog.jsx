import { useEffect, useId, useRef } from 'react'
import { HELP_SECTIONS } from '../help'

export function HelpTrigger({ onClick }) {
  return (
    <button type="button" className="feedback-link help-trigger" aria-haspopup="dialog" onClick={onClick}>
      <span>Ajuda</span>
    </button>
  )
}

export default function HelpDialog({ open, onClose }) {
  const dialogRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className="help-dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={event => {
        if (event.target === dialogRef.current) onClose()
      }}
    >
      <div className="help-inner">
        <header className="help-head">
          <div>
            <h2 id={titleId} className="panel-title">Como usar a calculadora</h2>
            <p className="panel-subtitle tight">Explicações de cada campo, modelo e resultado.</p>
          </div>
          <button type="button" className="btn-small" onClick={onClose}>Fechar</button>
        </header>

        <nav className="help-index" aria-label="Seções da ajuda">
          {HELP_SECTIONS.map(section => (
            <a
              key={section.id}
              href={`#help-${section.id}`}
              onClick={event => {
                event.preventDefault()
                dialogRef.current?.querySelector(`#help-${section.id}`)?.scrollIntoView({ block: 'start' })
              }}
            >
              {section.title}
            </a>
          ))}
        </nav>

        {HELP_SECTIONS.map(section => (
          <section key={section.id} id={`help-${section.id}`} className="help-section">
            <h3>{section.title}</h3>
            {section.intro && <p className="footnote help-intro">{section.intro}</p>}
            <dl className="help-items">
              {section.items.map(item => (
                <div key={item.term} className="help-item">
                  <dt>{item.term}</dt>
                  <dd>{item.text}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </dialog>
  )
}
