import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { curvePresets, extrasToMap, parseMoney, simulateFinancing, solveFromMaxPayment, annualToMonthly, monthlyToAnnual } from './math'
import { formatMoneyInput, exportScheduleCsv, exportCompareCsv, exportAbCompareCsv, number, currentYearMonth } from './format'
import { applyUrlToHistory, buildShareUrl, decodeState } from './urlState'
import { exportPdf } from './exportPdf'
import CurveEditor from './components/CurveEditor'
import ResultsPanel from './components/ResultsPanel'
import ComparePanel from './components/ComparePanel'
import AbComparePanel from './components/AbComparePanel'
import { AuthorCredit, FeedbackLink, SiteFooter } from './components/SiteMeta'

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
    ratePeriod: 'am',
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
    ratePeriod: 'am',
    balloonEnabled: false,
    balloons: [],
    extraEffect: 'payment'
  }
}

/** Percent + period → monthly decimal for the engine. */
function toMonthlyRate(interestPct, period) {
  const i = Math.max(0, Number(interestPct) || 0) / 100
  return period === 'aa' ? annualToMonthly(i) : i
}

/** Round % for inputs (~4 decimals, no float noise). */
function formatRatePct(decimal) {
  const pct = decimal * 100
  if (!Number.isFinite(pct) || pct === 0) return 0
  return Math.round(pct * 1e4) / 1e4
}

function formatRatePctLabel(decimal) {
  return String(formatRatePct(decimal)).replace('.', ',')
}

function runScenario(property, scenario) {
  const months = Math.max(1, Number(scenario.months) || 1)
  return simulateFinancing({
    property,
    down: parseMoney(scenario.downPayment),
    months,
    rate: toMonthlyRate(scenario.interest, scenario.ratePeriod || 'am'),
    mode: 'price',
    balloons: extrasToMap(scenario.balloonEnabled, scenario.balloons, months),
    extraEffect: scenario.extraEffect || 'payment',
    curveControls: [...curvePresets.linear]
  })
}

function InterestField({ id, interest, ratePeriod, onInterestChange, onPeriodChange }) {
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
  const [ratePeriod, setRatePeriod] = useState('am')
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
  const [shareCopied, setShareCopied] = useState(false)
  const [startMonth, setStartMonth] = useState(currentYearMonth)
  const curveRaf = useRef(null)
  const urlSyncReady = useRef(false)
  const shareCopiedTimer = useRef(null)
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
    const nextRatePeriod = overrides.ratePeriod ?? ratePeriod
    const rate = toMonthlyRate(overrides.interest ?? interest, nextRatePeriod)
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
  }, [mode, curveControls, balloons, balloonEnabled, extraEffect, months, propertyValue, downPayment, interest, ratePeriod, scenarioA, scenarioB, direction, solveFor, maxPayment])

  useEffect(() => {
    const decoded = decodeState(window.location.search)
    if (!decoded) {
      runSimulate()
      urlSyncReady.current = true
      return
    }

    const nextProperty = decoded.propertyValue ?? propertyValue
    const nextDown = decoded.downPayment ?? downPayment
    const nextMonths = decoded.months ?? months
    const nextInterest = decoded.interest ?? interest
    const nextRatePeriod = decoded.ratePeriod ?? ratePeriod
    const nextMode = decoded.mode ?? mode
    const nextDirection = decoded.direction ?? direction
    const nextSolveFor = decoded.solveFor ?? solveFor
    const nextMaxPayment = decoded.maxPayment ?? maxPayment
    const nextEffect = decoded.extraEffect ?? extraEffect
    const nextEnabled = decoded.balloonEnabled ?? balloonEnabled
    const nextBalloons = decoded.balloons ? cloneExtras(decoded.balloons) : balloons
    const nextControls = decoded.curveControls ? [...decoded.curveControls] : curveControls
    const nextA = decoded.scenarioA
      ? { ...decoded.scenarioA, balloons: cloneExtras(decoded.scenarioA.balloons || []) }
      : scenarioA
    const nextB = decoded.scenarioB
      ? { ...decoded.scenarioB, balloons: cloneExtras(decoded.scenarioB.balloons || []) }
      : scenarioB

    if (decoded.propertyValue != null) setPropertyValue(decoded.propertyValue)
    if (decoded.downPayment != null) setDownPayment(decoded.downPayment)
    if (decoded.months != null) setMonths(decoded.months)
    if (decoded.interest != null) setInterest(decoded.interest)
    if (decoded.ratePeriod != null) setRatePeriod(decoded.ratePeriod)
    if (decoded.mode != null) setMode(decoded.mode)
    if (decoded.direction != null) setDirection(decoded.direction)
    if (decoded.solveFor != null) setSolveFor(decoded.solveFor)
    if (decoded.maxPayment != null) setMaxPayment(decoded.maxPayment)
    if (decoded.extraEffect != null) setExtraEffect(decoded.extraEffect)
    if (decoded.balloonEnabled != null) setBalloonEnabled(decoded.balloonEnabled)
    if (decoded.balloons) setBalloons(nextBalloons)
    if (decoded.activePreset != null) setActivePreset(decoded.activePreset)
    if (decoded.curveControls) setCurveControls(nextControls)
    if (decoded.scenarioA) setScenarioA(nextA)
    if (decoded.scenarioB) setScenarioB(nextB)
    if (decoded.startMonth) setStartMonth(decoded.startMonth)

    runSimulate({
      propertyValue: nextProperty,
      downPayment: nextDown,
      months: nextMonths,
      interest: nextInterest,
      ratePeriod: nextRatePeriod,
      mode: nextMode,
      direction: nextDirection,
      solveFor: nextSolveFor,
      maxPayment: nextMaxPayment,
      extraEffect: nextEffect,
      balloonEnabled: nextEnabled,
      balloons: nextBalloons,
      curveControls: nextControls,
      scenarioA: nextA,
      scenarioB: nextB
    })

    // Allow URL writes after hydrate setters flush
    requestAnimationFrame(() => {
      urlSyncReady.current = true
    })
    // initial only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!urlSyncReady.current) return
    const timer = setTimeout(() => {
      applyUrlToHistory({
        propertyValue,
        downPayment,
        months,
        interest,
        ratePeriod,
        mode,
        direction,
        solveFor,
        maxPayment,
        extraEffect,
        balloonEnabled,
        balloons,
        activePreset,
        curveControls,
        scenarioA,
        scenarioB,
        startMonth
      })
    }, 150)
    return () => clearTimeout(timer)
  }, [
    propertyValue, downPayment, months, interest, ratePeriod, mode, direction,
    solveFor, maxPayment, extraEffect, balloonEnabled, balloons, activePreset,
    curveControls, scenarioA, scenarioB, startMonth
  ])

  useEffect(() => () => {
    if (shareCopiedTimer.current) clearTimeout(shareCopiedTimer.current)
  }, [])

  const onCopyLink = async () => {
    const url = buildShareUrl({
      propertyValue,
      downPayment,
      months,
      interest,
      ratePeriod,
      mode,
      direction,
      solveFor,
      maxPayment,
      extraEffect,
      balloonEnabled,
      balloons,
      activePreset,
      curveControls,
      scenarioA,
      scenarioB,
      startMonth
    })
    try {
      await navigator.clipboard.writeText(url)
      setShareCopied(true)
      if (shareCopiedTimer.current) clearTimeout(shareCopiedTimer.current)
      shareCopiedTimer.current = setTimeout(() => setShareCopied(false), 2000)
      return
    } catch {
      /* fall through */
    }
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Calculadora PRICE', url })
        return
      } catch (err) {
        if (err?.name === 'AbortError') return
      }
    }
    window.prompt('Copie o link:', url)
  }

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
      ratePeriod: scenarioA.ratePeriod || 'am',
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
        <div className="hero-meta">
          <AuthorCredit />
          <FeedbackLink />
        </div>
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
              <label htmlFor={propertyId}>Valor a ser financiado</label>
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
                <InterestField
                  id={interestId}
                  interest={currentScenario.interest}
                  ratePeriod={currentScenario.ratePeriod || 'am'}
                  onInterestChange={value => updateActiveScenario({ interest: value })}
                  onPeriodChange={(nextPeriod, nextInterest) => {
                    updateActiveScenario({ ratePeriod: nextPeriod, interest: nextInterest })
                  }}
                />
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
                  <label htmlFor={propertyId}>Valor total calculado{mode === 'compare' ? ' (Price)' : ''}</label>
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
                      SAC: total {number.format(compareResult.sac.property)}
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
                <InterestField
                  id={interestId}
                  interest={interest}
                  ratePeriod={ratePeriod}
                  onInterestChange={setInterest}
                  onPeriodChange={(nextPeriod, nextInterest) => {
                    setRatePeriod(nextPeriod)
                    setInterest(nextInterest)
                  }}
                />
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
          <button className="share-link" type="button" onClick={onCopyLink}>
            {shareCopied ? 'Link copiado!' : 'Copiar link'}
          </button>
          <p className="footnote">Simulação estimativa. Tarifas, seguros, correção monetária e impostos não estão incluídos. O link na barra de endereço carrega esta simulação.</p>
        </aside>

        <div className="results">
          <div className="print-only print-banner">
            <strong>Calculadora PRICE</strong>
            <span>
              {mode === 'ab'
                ? `Financiado ${propertyValue} · A vs B`
                : `Financiado ${propertyValue} · Entrada ${downPayment} · ${months} meses`}
            </span>
          </div>
          {mode === 'ab' && (
            <AbComparePanel
              a={abResult?.a}
              b={abResult?.b}
              startMonth={startMonth}
              onStartMonthChange={setStartMonth}
              onExport={() => exportAbCompareCsv(abResult?.a?.schedule, abResult?.b?.schedule, startMonth)}
              onExportPdf={exportPdf}
            />
          )}
          {mode === 'compare' && (
            <ComparePanel
              price={compareResult?.price}
              sac={compareResult?.sac}
              startMonth={startMonth}
              onStartMonthChange={setStartMonth}
              onExport={() => exportCompareCsv(compareResult?.price?.schedule, compareResult?.sac?.schedule, startMonth)}
              onExportPdf={exportPdf}
            />
          )}
          {mode !== 'ab' && mode !== 'compare' && (
            <ResultsPanel
              result={result}
              mode={mode}
              startMonth={startMonth}
              onStartMonthChange={setStartMonth}
              onExport={() => exportScheduleCsv(result?.schedule, startMonth)}
              onExportPdf={exportPdf}
            />
          )}
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
