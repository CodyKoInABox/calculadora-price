import { useEffect, useState } from 'react'
import App from './App'
import PrepaymentPage from './components/PrepaymentPage'
import CollectionPage from './components/CollectionPage'

const VIEWS = [
  { id: 'calculadora', hash: '', label: 'Financiamento' },
  { id: 'antecipacao', hash: '#antecipacao', label: 'Antecipação' },
  { id: 'cobranca', hash: '#cobranca', label: 'Cobrança' }
]

function viewFromHash() {
  const match = VIEWS.find(view => view.hash && view.hash === window.location.hash)
  return match ? match.id : 'calculadora'
}

export default function Shell() {
  const [view, setView] = useState(viewFromHash)

  useEffect(() => {
    const onPop = () => setView(viewFromHash())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const switchView = next => {
    const target = VIEWS.find(item => item.id === next)
    if (!target || target.id === view) return
    const url = `${window.location.pathname}${target.id === 'calculadora' ? window.location.search : ''}${target.hash}`
    window.history.pushState(null, '', url)
    setView(target.id)
  }

  return (
    <>
      <nav className="view-nav" aria-label="Ferramentas">
        <div className="segmented segmented-3">
          {VIEWS.map(item => (
            <button
              key={item.id}
              type="button"
              className={view === item.id ? 'active' : ''}
              aria-pressed={view === item.id}
              onClick={() => switchView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>
      {view === 'antecipacao' && <PrepaymentPage />}
      {view === 'cobranca' && <CollectionPage />}
      {view === 'calculadora' && <App />}
    </>
  )
}
