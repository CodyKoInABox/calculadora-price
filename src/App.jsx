import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { curvePresets, parseMoney, simulateFinancing } from './math'
import { formatMoneyInput, exportScheduleCsv, number } from './format'
import CurveEditor from './components/CurveEditor'
import ResultsPanel from './components/ResultsPanel'

let balloonSeq = 1

function balloonsToMap(enabled, balloons, months) {
  if (!enabled) return new Map()
  const map = new Map()
  for (const item of balloons) {
    const month = Math.max(1, Math.min(months, Number(item.month) || 1))
    const value = Math.max(0, parseMoney(item.amount))
    map.set(month, (map.get(month) || 0) + value)
  }
  return map
}

export default function App() {
  const [propertyValue, setPropertyValue] = useState('300.000,00')
  const [downPayment, setDownPayment] = useState('60.000,00')
  const [months, setMonths] = useState(36)
  const [interest, setInterest] = useState(1)
  const [mode, setMode] = useState('price')
  const [curveControls, setCurveControls] = useState([...curvePresets.linear])
  const [activePreset, setActivePreset] = useState('linear')
  const [balloonEnabled, setBalloonEnabled] = useState(false)
  const [balloons, setBalloons] = useState([])
  const [result, setResult] = useState(null)
  const curveRaf = useRef(null)
  const propertyId = useId()
  const downId = useId()
  const monthsId = useId()
  const interestId = useId()

  const runSimulate = useCallback((overrides = {}) => {
    const nextMode = overrides.mode ?? mode
    const nextControls = overrides.curveControls ?? curveControls
    const nextBalloons = overrides.balloons ?? balloons
    const nextEnabled = overrides.balloonEnabled ?? balloonEnabled
    const nextMonths = Math.max(1, Number(overrides.months ?? months) || 1)
    const property = parseMoney(overrides.propertyValue ?? propertyValue)
    const down = parseMoney(overrides.downPayment ?? downPayment)
    const rate = Math.max(0, Number(overrides.interest ?? interest) || 0) / 100

    const out = simulateFinancing({
      property,
      down,
      months: nextMonths,
      rate,
      mode: nextMode,
      balloons: balloonsToMap(nextEnabled, nextBalloons, nextMonths),
      curveControls: nextControls
    })

    if (out.error) {
      alert(out.error)
      return
    }
    setResult(out)
  }, [mode, curveControls, balloons, balloonEnabled, months, propertyValue, downPayment, interest])

  useEffect(() => {
    runSimulate()
    // initial only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onCurveChange = useCallback((next, presetId) => {
    setCurveControls(next)
    setActivePreset(presetId)
    if (curveRaf.current) cancelAnimationFrame(curveRaf.current)
    curveRaf.current = requestAnimationFrame(() => {
      curveRaf.current = null
      runSimulate({ curveControls: next, mode: 'growing' })
    })
  }, [runSimulate])

  const onPreset = useCallback((id) => {
    const next = [...curvePresets[id]]
    setCurveControls(next)
    setActivePreset(id)
    runSimulate({ curveControls: next, mode: 'growing' })
  }, [runSimulate])

  const addBalloon = () => {
    setBalloons(prev => [...prev, { id: balloonSeq++, month: 6, amount: number.format(10000) }])
  }

  const toggleBalloons = checked => {
    setBalloonEnabled(checked)
    if (checked && balloons.length === 0) {
      const next = [{ id: balloonSeq++, month: 6, amount: number.format(10000) }]
      setBalloons(next)
    }
  }

  const moneyChange = setter => e => setter(formatMoneyInput(e.target.value))

  return (
    <main className="page">
      <header className="hero">
        <h1>Calculadora PRICE Avançada</h1>
      </header>

      <section className="workspace">
        <aside className="panel form-panel">
          <h2 className="panel-title">Dados do financiamento</h2>
          <p className="panel-subtitle">Preencha os campos abaixo para montar o fluxo completo.</p>

          <div className="field">
            <label htmlFor={propertyId}>Valor do imóvel</label>
            <div className="input-wrap">
              <span className="prefix">R$</span>
              <input id={propertyId} className="has-prefix" value={propertyValue} onChange={moneyChange(setPropertyValue)} inputMode="decimal" />
            </div>
          </div>

          <div className="field">
            <label htmlFor={downId}>Entrada</label>
            <div className="input-wrap">
              <span className="prefix">R$</span>
              <input id={downId} className="has-prefix" value={downPayment} onChange={moneyChange(setDownPayment)} inputMode="decimal" />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor={monthsId}>Prazo</label>
              <div className="input-wrap">
                <input id={monthsId} type="number" value={months} min={1} max={600} className="has-suffix" onChange={e => setMonths(e.target.value)} />
                <span className="suffix">meses</span>
              </div>
            </div>
            <div className="field">
              <label htmlFor={interestId}>Juros ao mês</label>
              <div className="input-wrap">
                <input id={interestId} type="number" value={interest} min={0} step={0.01} className="has-suffix" onChange={e => setInterest(e.target.value)} />
                <span className="suffix">%</span>
              </div>
            </div>
          </div>

          <div className="field">
            <label>Modelo de parcelas</label>
            <div className="segmented">
              <button type="button" className={mode === 'price' ? 'active' : ''} onClick={() => { setMode('price'); runSimulate({ mode: 'price' }) }}>
                Price tradicional
              </button>
              <button type="button" className={mode === 'growing' ? 'active' : ''} onClick={() => { setMode('growing'); runSimulate({ mode: 'growing' }) }}>
                Curva interativa
              </button>
            </div>
          </div>

          {mode === 'growing' && (
            <div className="conditional visible">
              <CurveEditor
                controls={curveControls}
                activePreset={activePreset}
                onChange={onCurveChange}
                onPreset={onPreset}
              />
              <div className="footnote">A altura representa o peso relativo de cada parcela. O sistema converte o desenho em valores reais e ajusta o fluxo para liquidar todo o saldo.</div>
            </div>
          )}

          <div className="switch-line">
            <div className="switch-copy">
              <strong>Adicionar balões</strong>
              <span>Pagamentos extras em meses específicos</span>
            </div>
            <label className="switch">
              <input type="checkbox" checked={balloonEnabled} onChange={e => toggleBalloons(e.target.checked)} />
              <span className="slider" />
            </label>
          </div>

          {balloonEnabled && (
            <div className="conditional visible balloons">
              <div className="balloons-head">
                <strong>Balões programados</strong>
                <button type="button" className="btn-small" onClick={addBalloon}>+ Adicionar</button>
              </div>
              <div>
                {balloons.map(item => (
                  <div className="balloon-item" key={item.id}>
                    <div className="input-wrap">
                      <input
                        type="number"
                        min={1}
                        value={item.month}
                        className="has-suffix"
                        onChange={e => setBalloons(prev => prev.map(b => b.id === item.id ? { ...b, month: e.target.value } : b))}
                      />
                      <span className="suffix">mês</span>
                    </div>
                    <div className="input-wrap">
                      <span className="prefix">R$</span>
                      <input
                        value={item.amount}
                        className="has-prefix"
                        onChange={e => setBalloons(prev => prev.map(b => b.id === item.id ? { ...b, amount: formatMoneyInput(e.target.value) } : b))}
                      />
                    </div>
                    <button type="button" className="remove" aria-label="Remover balão" onClick={() => setBalloons(prev => prev.filter(b => b.id !== item.id))}>×</button>
                  </div>
                ))}
              </div>
              <div className="footnote">Os balões amortizam o saldo devedor no mês informado. Os juros do período continuam calculados normalmente.</div>
            </div>
          )}

          <button className="calculate" type="button" onClick={() => runSimulate()}>Calcular financiamento</button>
          <p className="footnote">Simulação estimativa. Tarifas, seguros, correção monetária e impostos não estão incluídos.</p>
        </aside>

        <div className="results">
          <ResultsPanel
            result={result}
            mode={mode}
            onExport={() => exportScheduleCsv(result?.schedule)}
          />
        </div>
      </section>
    </main>
  )
}
