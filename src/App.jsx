import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { curvePresets, extrasToMap, parseMoney, simulateFinancing, annualToMonthly, monthlyToAnnual } from './engine/math'
import { formatMoneyInput, exportScheduleCsv, exportCompareCsv, exportAbCompareCsv, number, currentYearMonth } from './format'
import { DEFAULT_DOWN, DEFAULT_INTEREST, DEFAULT_MAX_PAYMENT, DEFAULT_MONTHS, DEFAULT_PROPERTY, SCENARIO_B_DEFAULTS } from './defaults'
import { applyUrlToHistory, buildShareUrl, decodeState, encodeState } from './urlState'
import { exportAbReport, exportCompareReport, exportScheduleReport } from './exportPdf'
import { solveInBackground } from './solverClient'
import { computeCost, EMPTY_COST_INPUTS, parseCostInputs } from './engine/costs'
import CostsEditor from './components/CostsEditor'
import SacreOptions from './components/SacreOptions'
import { parseTrInput } from './engine/sacre'
import { addSaved, exportFile, importFile, mergeImported, readSaved, removeSaved, writeSaved } from './savedScenarios'
import ScenariosPanel from './components/ScenariosPanel'
import MultiComparePanel from './components/MultiComparePanel'
import { compareSavedScenarios } from './multiCompare'
import { compareAmortizeInvest, DEFAULT_INVEST_INPUTS, parseInvestRate } from './engine/invest'
import IncomeLimit from './components/IncomeLimit'
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

function cloneScenario(scenario) {
  return { ...scenario, balloons: cloneExtras(scenario.balloons || []) }
}

function getStorage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function saveBlob(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const DEFAULT_APP_STATE = {
  propertyValue: number.format(DEFAULT_PROPERTY),
  downPayment: number.format(DEFAULT_DOWN),
  months: DEFAULT_MONTHS,
  interest: DEFAULT_INTEREST,
  ratePeriod: 'am',
  mode: 'price',
  direction: 'forward',
  solveFor: 'principal',
  maxPayment: number.format(DEFAULT_MAX_PAYMENT),
  extraEffect: 'payment',
  balloonEnabled: false,
  balloons: [],
  activePreset: 'linear',
  curveControls: [...curvePresets.linear],
  costInputs: EMPTY_COST_INPUTS,
  sacre: false,
  trRate: ''
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
    downPayment: number.format(DEFAULT_DOWN),
    months: DEFAULT_MONTHS,
    interest: DEFAULT_INTEREST,
    ratePeriod: 'am',
    balloonEnabled: false,
    balloons: [],
    extraEffect: 'payment'
  }
}

function defaultScenarioB() {
  return {
    downPayment: number.format(SCENARIO_B_DEFAULTS.down),
    months: SCENARIO_B_DEFAULTS.months,
    interest: SCENARIO_B_DEFAULTS.interest,
    ratePeriod: 'am',
    balloonEnabled: false,
    balloons: [],
    extraEffect: 'payment'
  }
}

/** Percent + period → monthly decimal for the engine. */
function toMonthlyRate(interestPct, period) {
  if (interestPct === '' || interestPct == null) return Number.NaN
  const parsed = Number(interestPct)
  if (!Number.isFinite(parsed) || parsed < 0) return Number.NaN
  const i = parsed / 100
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

function prepareScheduleInputs(enabled, extras, monthsValue) {
  const months = Number(monthsValue)
  if (!Number.isInteger(months) || months < 1 || months > 600) {
    return { error: 'O prazo deve ser um número inteiro entre 1 e 600 meses.' }
  }

  const balloons = extrasToMap(enabled, extras, months)
  if (balloons?.error) return { error: balloons.error }
  return { months, balloons }
}

function runScenario(property, scenario) {
  const prepared = prepareScheduleInputs(
    scenario.balloonEnabled,
    scenario.balloons,
    scenario.months
  )
  if (prepared.error) return prepared

  return simulateFinancing({
    property,
    down: parseMoney(scenario.downPayment),
    months: prepared.months,
    rate: toMonthlyRate(scenario.interest, scenario.ratePeriod || 'am'),
    mode: 'price',
    balloons: prepared.balloons,
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

export default function App() {
  const [propertyValue, setPropertyValue] = useState(number.format(DEFAULT_PROPERTY))
  const [downPayment, setDownPayment] = useState(number.format(DEFAULT_DOWN))
  const [months, setMonths] = useState(DEFAULT_MONTHS)
  const [interest, setInterest] = useState(DEFAULT_INTEREST)
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
  const [maxPayment, setMaxPayment] = useState(number.format(DEFAULT_MAX_PAYMENT))
  const [result, setResult] = useState(null)
  const [compareResult, setCompareResult] = useState(null)
  const [abResult, setAbResult] = useState(null)
  const [shareCopied, setShareCopied] = useState(false)
  const [startMonth, setStartMonth] = useState(currentYearMonth)
  const [solving, setSolving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [costInputs, setCostInputs] = useState(EMPTY_COST_INPUTS)
  const [investInputs, setInvestInputs] = useState(DEFAULT_INVEST_INPUTS)
  const [sacre, setSacre] = useState(false)
  const [trRate, setTrRate] = useState('')
  const [saved, setSaved] = useState(() => readSaved(getStorage()))
  const [savedError, setSavedError] = useState(null)
  const [multiCompare, setMultiCompare] = useState(null)
  const curveRaf = useRef(null)
  const solveToken = useRef(0)
  const urlSyncReady = useRef(false)
  const shareCopiedTimer = useRef(null)
  const propertyId = useId()
  const downId = useId()
  const monthsId = useId()
  const interestId = useId()
  const maxPaymentId = useId()

  const runSimulate = useCallback(async (overrides = {}) => {
    const nextMode = overrides.mode ?? mode
    const nextControls = overrides.curveControls ?? curveControls
    const nextBalloons = overrides.balloons ?? balloons
    const nextEnabled = overrides.balloonEnabled ?? balloonEnabled
    const nextEffect = overrides.extraEffect ?? extraEffect
    const nextDirection = overrides.direction ?? direction
    const nextSolveFor = overrides.solveFor ?? solveFor
    const property = parseMoney(overrides.propertyValue ?? propertyValue)
    const down = parseMoney(overrides.downPayment ?? downPayment)
    const targetPayment = parseMoney(overrides.maxPayment ?? maxPayment)
    const nextRatePeriod = overrides.ratePeriod ?? ratePeriod
    const rate = toMonthlyRate(overrides.interest ?? interest, nextRatePeriod)
    const nextA = overrides.scenarioA ?? scenarioA
    const nextB = overrides.scenarioB ?? scenarioB
    const useInverse = nextDirection === 'inverse' && nextMode !== 'ab'
    // SACRE is a Price variant for direct calculation only (inverse and compare stay on Price/SAC)
    const sacreOn = (overrides.sacre ?? sacre) && nextMode === 'price' && !useInverse
    const engineMode = sacreOn ? 'sacre' : nextMode
    const correctionRate = sacreOn ? parseTrInput(overrides.trRate ?? trRate) : 0
    const costs = parseCostInputs(overrides.costInputs ?? costInputs)
    const withCost = (out, rateValue) => {
      if (out.error) return out
      return {
        ...out,
        cost: {
          ...computeCost({ principal: out.principal, property: out.property, schedule: out.schedule, costs }),
          contractAnnual: monthlyToAnnual(rateValue)
        }
      }
    }
    const withInvest = (out, rateValue) => {
      if (out.error || balloonMap.size === 0) return out
      const base = simulateFinancing({
        property: out.property,
        down: out.down,
        months: nextMonths,
        rate: rateValue,
        mode: engineMode,
        correctionRate,
        balloons: new Map(),
        curveControls: nextControls,
        extraEffect: nextEffect
      })
      const invest = compareAmortizeInvest({
        result: out,
        baseResult: base,
        contributions: balloonMap,
        months: nextMonths,
        annualRate: parseInvestRate(investInputs.rate),
        taxed: investInputs.taxed
      })
      return invest ? { ...out, invest } : out
    }
    const token = ++solveToken.current
    const isStale = () => token !== solveToken.current
    if (!useInverse) setSolving(false)
    setFormError(null)

    const reportError = message => {
      if (nextMode === 'ab') setAbResult(null)
      else if (nextMode === 'compare') setCompareResult(null)
      else setResult(null)
      setFormError(message)
    }

    const runInverse = async jobs => {
      setSolving(true)
      try {
        const outs = await solveInBackground(jobs)
        if (!outs || isStale()) return null
        return outs
      } catch (error) {
        if (!isStale()) reportError(error.message)
        return null
      } finally {
        if (!isStale()) setSolving(false)
      }
    }

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
        reportError(outA.error || outB.error)
        return
      }
      setAbResult({
        a: withCost(outA, toMonthlyRate(nextA.interest, nextA.ratePeriod || 'am')),
        b: withCost(outB, toMonthlyRate(nextB.interest, nextB.ratePeriod || 'am'))
      })
      setResult(null)
      setCompareResult(null)
      return
    }

    const prepared = prepareScheduleInputs(
      nextEnabled,
      nextBalloons,
      overrides.months ?? months
    )
    if (prepared.error) {
      reportError(prepared.error)
      return
    }
    const nextMonths = prepared.months
    const balloonMap = prepared.balloons

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
        const outs = await runInverse([
          { kind: 'inverse', payload: { ...inverseShared, mode: 'price' } },
          { kind: 'inverse', payload: { ...inverseShared, mode: 'sac' } }
        ])
        if (!outs) return
        priceOut = outs[0]
        sacOut = outs[1]
      } else {
        priceOut = simulateFinancing({ ...shared, mode: 'price' })
        sacOut = simulateFinancing({ ...shared, mode: 'sac' })
      }
      if (priceOut.error || sacOut.error) {
        reportError(priceOut.error || sacOut.error)
        return
      }
      if (useInverse) syncSolvedFields(priceOut)
      setCompareResult({ price: withCost(priceOut, rate), sac: withCost(sacOut, rate) })
      setResult(null)
      setAbResult(null)
      return
    }

    let out
    if (useInverse) {
      const outs = await runInverse([{
        kind: 'inverse',
        payload: {
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
        }
      }])
      if (!outs) return
      out = outs[0]
    } else {
      out = simulateFinancing({
        property,
        down,
        months: nextMonths,
        rate,
        mode: engineMode,
        correctionRate,
        balloons: balloonMap,
        extraEffect: nextEffect,
        curveControls: nextControls
      })
    }

    if (out.error) {
      reportError(out.error)
      return
    }
    if (useInverse) syncSolvedFields(out)
    setResult(withInvest(withCost(out, rate), rate))
    setCompareResult(null)
    setAbResult(null)
  }, [mode, curveControls, balloons, balloonEnabled, extraEffect, months, propertyValue, downPayment, interest, ratePeriod, scenarioA, scenarioB, direction, solveFor, maxPayment, costInputs, investInputs, sacre, trRate])

  useEffect(() => {
    writeSaved(getStorage(), saved)
  }, [saved])

  const applyState = decoded => {
    const s = {
      ...DEFAULT_APP_STATE,
      ...decoded,
      scenarioA: decoded.scenarioA ?? scenarioA,
      scenarioB: decoded.scenarioB ?? scenarioB
    }
    const nextBalloons = cloneExtras(s.balloons)
    const nextA = cloneScenario(s.scenarioA)
    const nextB = cloneScenario(s.scenarioB)
    const nextControls = [...s.curveControls]

    setPropertyValue(s.propertyValue)
    setDownPayment(s.downPayment)
    setMonths(s.months)
    setInterest(s.interest)
    setRatePeriod(s.ratePeriod)
    setMode(s.mode)
    setDirection(s.direction)
    setSolveFor(s.solveFor)
    setMaxPayment(s.maxPayment)
    setExtraEffect(s.extraEffect)
    setBalloonEnabled(s.balloonEnabled)
    setBalloons(nextBalloons)
    setActivePreset(s.activePreset)
    setCurveControls(nextControls)
    setScenarioA(nextA)
    setScenarioB(nextB)
    setCostInputs(s.costInputs)
    setSacre(s.sacre)
    setTrRate(s.trRate)
    if (decoded.startMonth) setStartMonth(decoded.startMonth)

    runSimulate({
      propertyValue: s.propertyValue,
      downPayment: s.downPayment,
      months: s.months,
      interest: s.interest,
      ratePeriod: s.ratePeriod,
      mode: s.mode,
      direction: s.direction,
      solveFor: s.solveFor,
      maxPayment: s.maxPayment,
      extraEffect: s.extraEffect,
      balloonEnabled: s.balloonEnabled,
      balloons: nextBalloons,
      curveControls: nextControls,
      scenarioA: nextA,
      scenarioB: nextB,
      costInputs: s.costInputs,
      sacre: s.sacre,
      trRate: s.trRate
    })
  }

  const onSaveScenario = name => {
    const query = encodeState({
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
      costInputs,
      sacre,
      trRate
    }).toString()
    const next = addSaved(saved, { name, query })
    if (next.error) {
      setSavedError(next.error)
      return
    }
    setSavedError(null)
    setSaved(next.list)
  }

  const onLoadScenario = item => {
    setSavedError(null)
    applyState(decodeState(item.query) ?? {})
  }

  const onDeleteScenario = id => setSaved(prev => removeSaved(prev, id))

  const onCompareScenarios = selectedItems => setMultiCompare(compareSavedScenarios(selectedItems))

  const onExportScenarios = () => {
    saveBlob('cenarios-calculadora-price.json', exportFile(saved), 'application/json')
  }

  const onImportScenarios = async file => {
    const result = importFile(await file.text())
    if (result.error) {
      setSavedError(result.error)
      return
    }
    setSavedError(null)
    setSaved(prev => mergeImported(prev, result.scenarios))
  }

  useEffect(() => {
    const decoded = decodeState(window.location.search)
    if (!decoded) {
      runSimulate()
      urlSyncReady.current = true
      return
    }

    applyState(decoded)

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
        startMonth,
        costInputs,
        sacre,
        trRate
      })
    }, 150)
    return () => clearTimeout(timer)
  }, [
    propertyValue, downPayment, months, interest, ratePeriod, mode, direction,
    solveFor, maxPayment, extraEffect, balloonEnabled, balloons, activePreset,
    curveControls, scenarioA, scenarioB, startMonth, costInputs, sacre, trRate
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
      startMonth,
      costInputs,
      sacre,
      trRate
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

  const latest = useRef({})
  latest.current = { runSimulate, direction }

  const onCurveChange = useCallback((next, presetId) => {
    setCurveControls(next)
    setActivePreset(presetId)
    if (latest.current.direction === 'inverse') return
    if (curveRaf.current) cancelAnimationFrame(curveRaf.current)
    curveRaf.current = requestAnimationFrame(() => {
      curveRaf.current = null
      latest.current.runSimulate({ curveControls: next, mode: 'growing' })
    })
  }, [])

  const onPreset = useCallback((id) => {
    const next = [...curvePresets[id]]
    setCurveControls(next)
    setActivePreset(id)
    latest.current.runSimulate({ curveControls: next, mode: 'growing' })
  }, [])

  useEffect(() => {
    if (!urlSyncReady.current) return
    const timer = setTimeout(() => runSimulate(), 350)
    return () => clearTimeout(timer)
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
  const rateLabel = `${String(interest).replace('.', ',')}% ${ratePeriod === 'aa' ? 'a.a.' : 'a.m.'}`
  const reportModeLabel = mode === 'growing' ? 'Curva' : sacre && !isInverse ? 'SACRE' : 'Price'
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
              <label htmlFor={propertyId}>Valor total do bem</label>
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

          {mode === 'price' && (
            <SacreOptions
              enabled={sacre}
              disabled={isInverse}
              onToggle={setSacre}
              trValue={trRate}
              onTrChange={setTrRate}
            />
          )}

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
                    <label htmlFor={maxPaymentId}>Parcela regular máxima</label>
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
                    <p className="footnote">Pagamentos extras não entram neste limite.</p>
                  </div>

                  <IncomeLimit onApply={value => setMaxPayment(value)} />
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
                  <label htmlFor={propertyId}>Valor total do bem calculado{mode === 'compare' ? ' (Price)' : ''}</label>
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

              <CostsEditor
                values={costInputs}
                onChange={patch => setCostInputs(prev => ({ ...prev, ...patch }))}
              />
            </>
          )}

          <ScenariosPanel
            items={saved}
            error={savedError}
            onSave={onSaveScenario}
            onLoad={onLoadScenario}
            onDelete={onDeleteScenario}
            onExport={onExportScenarios}
            onImport={onImportScenarios}
            onCompare={onCompareScenarios}
          />

          {formError && <p className="form-error" role="alert">{formError}</p>}
          <button className="calculate" type="button" onClick={() => runSimulate()}>
            {isInverse ? (solving ? 'Calculando…' : 'Calcular limite') : 'Calcular financiamento'}
          </button>
          <button className="share-link" type="button" onClick={onCopyLink}>
            {shareCopied ? 'Link copiado!' : 'Copiar link'}
          </button>
          <p className="footnote">Simulação estimativa. Tarifas, seguros, correção monetária e impostos não estão incluídos. O link na barra de endereço carrega esta simulação.</p>
        </aside>

        <div className={`results${solving ? ' is-solving' : ''}`} aria-busy={solving}>
          {multiCompare && <MultiComparePanel items={multiCompare} onClose={() => setMultiCompare(null)} />}
          <div className="print-only print-banner">
            <strong>Calculadora PRICE</strong>
            <span>
              {mode === 'ab'
                ? `Bem ${propertyValue} · A vs B`
                : `Bem ${propertyValue} · Entrada ${downPayment} · ${months} meses`}
            </span>
          </div>
          {mode === 'ab' && (
            <AbComparePanel
              a={abResult?.a}
              b={abResult?.b}
              startMonth={startMonth}
              onStartMonthChange={setStartMonth}
              onExport={() => exportAbCompareCsv(abResult?.a?.schedule, abResult?.b?.schedule, startMonth)}
              onExportPdf={() => exportAbReport(abResult)}
            />
          )}
          {mode === 'compare' && (
            <ComparePanel
              price={compareResult?.price}
              sac={compareResult?.sac}
              startMonth={startMonth}
              onStartMonthChange={setStartMonth}
              onExport={() => exportCompareCsv(compareResult?.price?.schedule, compareResult?.sac?.schedule, startMonth)}
              onExportPdf={() => exportCompareReport(compareResult, { rateLabel })}
            />
          )}
          {mode !== 'ab' && mode !== 'compare' && (
            <ResultsPanel
              result={result}
              investInputs={investInputs}
              onInvestChange={patch => setInvestInputs(prev => ({ ...prev, ...patch }))}
              mode={mode}
              startMonth={startMonth}
              onStartMonthChange={setStartMonth}
              onExport={() => exportScheduleCsv(result?.schedule, startMonth)}
              onExportPdf={() => exportScheduleReport(result, { startMonth, modeLabel: reportModeLabel, rateLabel })}
            />
          )}
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
