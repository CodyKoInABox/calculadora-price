import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { curvePresets, extrasToMap, parseMoney, simulateFinancing, solveFromMaxPayment } from './math'
import { formatMoneyInput, exportScheduleCsv, exportCompareCsv, exportAbCompareCsv, number } from './format'
import CurveEditor from './components/CurveEditor'
import ResultsPanel from './components/ResultsPanel'
import ComparePanel from './components/ComparePanel'
import AbComparePanel from './components/AbComparePanel'
import { AuthorCredit, SiteFooter } from './components/SiteMeta'

let extraSeq = 1

function newExtra(overrides = {}) {
  return {
    id: extraSeq++,
    recurrence: 'once',
    month: 6,
    everyN: 6,
    amount: number.format(10000),
    ...overrides
  }
}

function cloneExtras(extras) {
  return extras.map(b => ({
    id: extraSeq++,
    recurrence: b.recurrence || 'once',
    month: b.month,
    everyN: b.everyN ?? 6,
    amount: b.amount
  }))
}

function defaultScenarioA() {
  return {
    downPayment: '60.000,00',
    months: 36,
    interest: 1,
    balloonEnabled: false,
    balloons: [],
    extraEffect: 'payment'
  }
}

function defaultScenarioB() {
  return {
    downPayment: '80.000,00',
    months: 48,
    interest: 0.85,
    balloonEnabled: false,
    balloons: [],
    extraEffect: 'payment'
  }
}

function runScenario(property, scenario) {
  const months = Math.max(1, Number(scenario.months) || 1)
  return simulateFinancing({
    property,
    down: parseMoney(scenario.downPayment),
    months,
    rate: Math.max(0, Number(scenario.interest) || 0) / 100,
    mode: 'price',
    balloons: extrasToMap(scenario.balloonEnabled, scenario.balloons, months),
    extraEffect: scenario.extraEffect || 'payment',
    curveControls: [...curvePresets.linear]
  })
}

function ExtrasEditor({
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
          <span>Balões pontuais ou amortização recorrente</span>
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
  const [extraEffect, setExtraEffect] = useState('payment')
  const [scenarioA, setScenarioA] = useState(defaultScenarioA)
  const [scenarioB, setScenarioB] = useState(defaultScenarioB)
  const [activeScenario, setActiveScenario] = useState('a')
  const [direction, setDirection] = useState('forward')
  const [solveFor, setSolveFor] = useState('principal')
  const [maxPayment, setMaxPayment] = useState('8.000,00')
  const [result, setResult] = useState(null)
  const [compareResult, setCompareResult] = useState(null)
  const [abResult, setAbResult] = useState(null)
  const curveRaf = useRef(null)
  const propertyId = useId()
  const downId = useId()
  const monthsId = useId()
  const interestId = useId()
  const maxPaymentId = useId()

  const runSimulate = useCallback((overrides = {}) => {
    const nextMode = overrides.mode ?? mode
    const nextControls = overrides.curveControls ?? curveControls
    const nextBalloons = overrides.balloons ?? balloons
    const nextEnabled = overrides.balloonEnabled ?? balloonEnabled
    const nextEffect = overrides.extraEffect ?? extraEffect
    const nextMonths = Math.max(1, Number(overrides.months ?? months) || 1)
    const nextDirection = overrides.direction ?? direction
    const nextSolveFor = overrides.solveFor ?? solveFor
    const property = parseMoney(overrides.propertyValue ?? propertyValue)
    const down = parseMoney(overrides.downPayment ?? downPayment)
    const targetPayment = parseMoney(overrides.maxPayment ?? maxPayment)
    const rate = Math.max(0, Number(overrides.interest ?? interest) || 0) / 100
    const balloonMap = extrasToMap(nextEnabled, nextBalloons, nextMonths)
    const nextA = overrides.scenarioA ?? scenarioA
    const nextB = overrides.scenarioB ?? scenarioB
    const useInverse = nextDirection === 'inverse' && nextMode !== 'ab'

    const syncSolvedFields = out => {
      if (!out || out.error || !out.solved) return
      if (out.solved === 'principal') {
        setPropertyValue(number.format(out.property))
      } else if (out.solved === 'down') {
        setDownPayment(number.format(out.down))
      }
    }

    if (nextMode === 'ab') {
      const outA = runScenario(property, nextA)
      const outB = runScenario(property, nextB)
      if (outA.error || outB.error) {
        alert(outA.error || outB.error)
        return
      }
      setAbResult({ a: outA, b: outB })
      setResult(null)
      setCompareResult(null)
      return
    }

    if (nextMode === 'compare') {
      const shared = {
        property,
        down,
        months: nextMonths,
        rate,
        balloons: balloonMap,
        extraEffect: nextEffect,
        curveControls: nextControls
      }
      let priceOut
      let sacOut
      if (useInverse) {
        const inverseShared = {
          ...shared,
          targetPayment,
          solveFor: nextSolveFor
        }
        priceOut = solveFromMaxPayment({ ...inverseShared, mode: 'price' })
        sacOut = solveFromMaxPayment({ ...inverseShared, mode: 'sac' })
      } else {
        priceOut = simulateFinancing({ ...shared, mode: 'price' })
        sacOut = simulateFinancing({ ...shared, mode: 'sac' })
      }
      if (priceOut.error || sacOut.error) {
        alert(priceOut.error || sacOut.error)
        return
      }
      if (useInverse) syncSolvedFields(priceOut)
      setCompareResult({ price: priceOut, sac: sacOut })
      setResult(null)
      setAbResult(null)
      return
    }

    const out = useInverse
      ? solveFromMaxPayment({
          property,
          down,
          months: nextMonths,
          rate,
          mode: nextMode,
          balloons: balloonMap,
          extraEffect: nextEffect,
          curveControls: nextControls,
          targetPayment,
          solveFor: nextSolveFor
        })
      : simulateFinancing({
          property,
          down,
          months: nextMonths,
          rate,
          mode: nextMode,
          balloons: balloonMap,
          extraEffect: nextEffect,
          curveControls: nextControls
        })

    if (out.error) {
      alert(out.error)
      return
    }
    if (useInverse) syncSolvedFields(out)
    setResult(out)
    setCompareResult(null)
    setAbResult(null)
  }, [mode, curveControls, balloons, balloonEnabled, extraEffect, months, propertyValue, downPayment, interest, scenarioA, scenarioB, direction, solveFor, maxPayment])

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
    setBalloons(prev => [...prev, newExtra()])
  }

  const toggleBalloons = checked => {
    setBalloonEnabled(checked)
    if (checked && balloons.length === 0) {
      setBalloons([newExtra()])
    }
  }

  const patchBalloon = (id, patch) => {
    setBalloons(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b))
  }

  const updateActiveScenario = patch => {
    const setter = activeScenario === 'a' ? setScenarioA : setScenarioB
    setter(prev => ({ ...prev, ...patch }))
  }

  const addScenarioBalloon = () => {
    const setter = activeScenario === 'a' ? setScenarioA : setScenarioB
    setter(prev => ({
      ...prev,
      balloons: [...prev.balloons, newExtra()]
    }))
  }

  const toggleScenarioBalloons = checked => {
    const setter = activeScenario === 'a' ? setScenarioA : setScenarioB
    setter(prev => {
      const balloonsNext = checked && prev.balloons.length === 0
        ? [newExtra()]
        : prev.balloons
      return { ...prev, balloonEnabled: checked, balloons: balloonsNext }
    })
  }

  const patchScenarioBalloon = (id, patch) => {
    const setter = activeScenario === 'a' ? setScenarioA : setScenarioB
    setter(prev => ({
      ...prev,
      balloons: prev.balloons.map(b => b.id === id ? { ...b, ...patch } : b)
    }))
  }

  const removeScenarioBalloon = id => {
    const setter = activeScenario === 'a' ? setScenarioA : setScenarioB
    setter(prev => ({
      ...prev,
      balloons: prev.balloons.filter(b => b.id !== id)
    }))
  }

  const copyAtoB = () => {
    const next = {
      downPayment: scenarioA.downPayment,
      months: scenarioA.months,
      interest: scenarioA.interest,
      balloonEnabled: scenarioA.balloonEnabled,
      balloons: cloneExtras(scenarioA.balloons),
      extraEffect: scenarioA.extraEffect || 'payment'
    }
    setScenarioB(next)
    runSimulate({ mode: 'ab', scenarioB: next })
  }

  const moneyChange = setter => e => setter(formatMoneyInput(e.target.value))

  const selectMode = next => {
    setMode(next)
    runSimulate({ mode: next })
  }

  const currentScenario = activeScenario === 'a' ? scenarioA : scenarioB
  const isAb = mode === 'ab'
  const isInverse = direction === 'inverse' && !isAb
  const showProperty = !isInverse || solveFor === 'down'
  const showDown = !isInverse || solveFor === 'principal'
  const inverseSolved = isInverse
    ? (result?.solved ? result : (compareResult?.price?.solved ? compareResult.price : null))
    : null
  const showSolvedDown = inverseSolved?.solved === 'down'
  const showSolvedProperty = inverseSolved?.solved === 'principal'

  return (
    <main className="page">
      <header className="hero">
        <div className="hero-copy">
          <h1>Calculadora PRICE Avançada</h1>
          <p className="hero-lead">
            Compare Price e SAC, cenários A vs B (taxa, prazo, entrada e extras), curva interativa — no navegador, sem cadastro.
          </p>
        </div>
        <AuthorCredit />
      </header>

      <section className="workspace">
        <aside className="panel form-panel">
          <h2 className="panel-title">Dados do financiamento</h2>
          <p className="panel-subtitle">Preencha os campos abaixo para montar o fluxo completo.</p>

          {!isAb && (
            <div className="field">
              <label>Direção do cálculo</label>
              <div className="segmented">
                <button
                  type="button"
                  className={direction === 'forward' ? 'active' : ''}
                  onClick={() => {
                    setDirection('forward')
                    runSimulate({ direction: 'forward' })
                  }}
                >
                  Calcular parcela
                </button>
                <button
                  type="button"
                  className={direction === 'inverse' ? 'active' : ''}
                  onClick={() => {
                    setDirection('inverse')
                    runSimulate({ direction: 'inverse' })
                  }}
                >
                  A partir da parcela
                </button>
              </div>
            </div>
          )}

          {showProperty && (
            <div className="field">
              <label htmlFor={propertyId}>Valor do imóvel</label>
              <div className="input-wrap">
                <span className="prefix">R$</span>
                <input id={propertyId} className="has-prefix" value={propertyValue} onChange={moneyChange(setPropertyValue)} inputMode="decimal" />
              </div>
            </div>
          )}

          <div className="field">
            <label>Modelo de parcelas</label>
            <div className="segmented segmented-4">
              <button type="button" className={mode === 'price' ? 'active' : ''} onClick={() => selectMode('price')}>
                Price
              </button>
              <button type="button" className={mode === 'growing' ? 'active' : ''} onClick={() => selectMode('growing')}>
                Curva
              </button>
              <button type="button" className={mode === 'compare' ? 'active' : ''} onClick={() => selectMode('compare')}>
                Price × SAC
              </button>
              <button type="button" className={mode === 'ab' ? 'active' : ''} onClick={() => selectMode('ab')}>
                A vs B
              </button>
            </div>
          </div>

          {isAb ? (
            <>
              <div className="scenario-tabs">
                <div className="segmented">
                  <button type="button" className={activeScenario === 'a' ? 'active' : ''} onClick={() => setActiveScenario('a')}>
                    Cenário A
                  </button>
                  <button type="button" className={activeScenario === 'b' ? 'active' : ''} onClick={() => setActiveScenario('b')}>
                    Cenário B
                  </button>
                </div>
                <button type="button" className="scenario-copy" onClick={copyAtoB}>
                  Copiar A → B
                </button>
              </div>
              <p className={`scenario-label ${activeScenario}`}>
                Editando cenário {activeScenario.toUpperCase()}
              </p>

              <div className="field">
                <label htmlFor={downId}>Entrada</label>
                <div className="input-wrap">
                  <span className="prefix">R$</span>
                  <input
                    id={downId}
                    className="has-prefix"
                    value={currentScenario.downPayment}
                    onChange={e => updateActiveScenario({ downPayment: formatMoneyInput(e.target.value) })}
                    inputMode="decimal"
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
                      value={currentScenario.months}
                      min={1}
                      max={600}
                      className="has-suffix"
                      onChange={e => updateActiveScenario({ months: e.target.value })}
                    />
                    <span className="suffix">meses</span>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor={interestId}>Juros ao mês</label>
                  <div className="input-wrap">
                    <input
                      id={interestId}
                      type="number"
                      value={currentScenario.interest}
                      min={0}
                      step={0.01}
                      className="has-suffix"
                      onChange={e => updateActiveScenario({ interest: e.target.value })}
                    />
                    <span className="suffix">%</span>
                  </div>
                </div>
              </div>

              <ExtrasEditor
                enabled={currentScenario.balloonEnabled}
                extras={currentScenario.balloons}
                extraEffect={currentScenario.extraEffect || 'payment'}
                onToggle={toggleScenarioBalloons}
                onEffectChange={value => updateActiveScenario({ extraEffect: value })}
                onAdd={addScenarioBalloon}
                onPatch={patchScenarioBalloon}
                onRemove={removeScenarioBalloon}
              />
            </>
          ) : (
            <>
              {isInverse && (
                <>
                  <div className="field">
                    <label>Resolver</label>
                    <div className="segmented">
                      <button
                        type="button"
                        className={solveFor === 'principal' ? 'active' : ''}
                        onClick={() => {
                          setSolveFor('principal')
                          runSimulate({ solveFor: 'principal', direction: 'inverse' })
                        }}
                      >
                        Quanto financiar
                      </button>
                      <button
                        type="button"
                        className={solveFor === 'down' ? 'active' : ''}
                        onClick={() => {
                          setSolveFor('down')
                          runSimulate({ solveFor: 'down', direction: 'inverse' })
                        }}
                      >
                        Entrada mínima
                      </button>
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor={maxPaymentId}>Parcela máxima</label>
                    <div className="input-wrap">
                      <span className="prefix">R$</span>
                      <input
                        id={maxPaymentId}
                        className="has-prefix"
                        value={maxPayment}
                        onChange={moneyChange(setMaxPayment)}
                        inputMode="decimal"
                      />
                    </div>
                  </div>
                </>
              )}

              {showDown && (
                <div className="field">
                  <label htmlFor={downId}>Entrada</label>
                  <div className="input-wrap">
                    <span className="prefix">R$</span>
                    <input id={downId} className="has-prefix" value={downPayment} onChange={moneyChange(setDownPayment)} inputMode="decimal" />
                  </div>
                </div>
              )}

              {showSolvedDown && (
                <div className="field">
                  <label htmlFor={downId}>Entrada mínima calculada{mode === 'compare' ? ' (Price)' : ''}</label>
                  <div className="input-wrap">
                    <span className="prefix">R$</span>
                    <input
                      id={downId}
                      className="has-prefix"
                      value={number.format(inverseSolved.down)}
                      readOnly
                      aria-readonly="true"
                    />
                  </div>
                  {mode === 'compare' && compareResult?.sac?.solved === 'down' && (
                    <p className="footnote" style={{ marginTop: 8 }}>
                      SAC: {number.format(compareResult.sac.down)}
                    </p>
                  )}
                </div>
              )}

              {showSolvedProperty && (
                <div className="field">
                  <label htmlFor={propertyId}>Valor do imóvel calculado{mode === 'compare' ? ' (Price)' : ''}</label>
                  <div className="input-wrap">
                    <span className="prefix">R$</span>
                    <input
                      id={propertyId}
                      className="has-prefix"
                      value={number.format(inverseSolved.property)}
                      readOnly
                      aria-readonly="true"
                    />
                  </div>
                  {mode === 'compare' && compareResult?.sac?.solved === 'principal' && (
                    <p className="footnote" style={{ marginTop: 8 }}>
                      SAC: imóvel {number.format(compareResult.sac.property)}
                    </p>
                  )}
                </div>
              )}

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

              <ExtrasEditor
                enabled={balloonEnabled}
                extras={balloons}
                extraEffect={extraEffect}
                onToggle={toggleBalloons}
                onEffectChange={setExtraEffect}
                onAdd={addBalloon}
                onPatch={patchBalloon}
                onRemove={id => setBalloons(prev => prev.filter(b => b.id !== id))}
              />
            </>
          )}

          <button className="calculate" type="button" onClick={() => runSimulate()}>
            {isInverse ? 'Calcular limite' : 'Calcular financiamento'}
          </button>
          <p className="footnote">Simulação estimativa. Tarifas, seguros, correção monetária e impostos não estão incluídos.</p>
        </aside>

        <div className="results">
          {mode === 'ab' && (
            <AbComparePanel
              a={abResult?.a}
              b={abResult?.b}
              onExport={() => exportAbCompareCsv(abResult?.a?.schedule, abResult?.b?.schedule)}
            />
          )}
          {mode === 'compare' && (
            <ComparePanel
              price={compareResult?.price}
              sac={compareResult?.sac}
              onExport={() => exportCompareCsv(compareResult?.price?.schedule, compareResult?.sac?.schedule)}
            />
          )}
          {mode !== 'ab' && mode !== 'compare' && (
            <ResultsPanel
              result={result}
              mode={mode}
              onExport={() => exportScheduleCsv(result?.schedule)}
            />
          )}
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
