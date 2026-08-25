import { curvePresets, parseMoney } from './math'
import { currentYearMonth, number, parseYearMonthInput, yearMonthInputValue } from './format'

const MODES = new Set(['price', 'growing', 'compare', 'ab'])
const RATE_PERIODS = new Set(['am', 'aa'])
const DIRECTIONS = new Set(['forward', 'inverse'])
const SOLVE_FOR = new Set(['principal', 'down'])
const EXTRA_EFFECTS = new Set(['payment', 'term'])
const RECURRENCES = new Set(['once', 'monthly', 'yearly', 'every'])
const PRESETS = new Set(Object.keys(curvePresets))

const DEFAULTS = {
  propertyValue: 300000,
  downPayment: 60000,
  months: 36,
  interest: 1,
  ratePeriod: 'am',
  mode: 'price',
  direction: 'forward',
  solveFor: 'principal',
  maxPayment: 8000,
  extraEffect: 'payment',
  balloonEnabled: false,
  activePreset: 'linear',
  curveControls: [...curvePresets.linear]
}

function moneyParam(value) {
  const n = typeof value === 'number' ? value : parseMoney(value)
  if (!Number.isFinite(n) || n < 0) return null
  // Avoid scientific notation; trim trailing zeros after decimal for integers
  if (Number.isInteger(n)) return String(n)
  return String(Math.round(n * 100) / 100)
}

function formatMoney(n) {
  return number.format(Math.max(0, Number(n) || 0))
}

function parseNum(raw) {
  if (raw == null || raw === '') return null
  const n = Number(String(raw).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function parseIntClamped(raw, min, max) {
  const n = parseNum(raw)
  if (n == null) return null
  return Math.max(min, Math.min(max, Math.round(n)))
}

/** Encode balloon rows → `once:6:10000|every:12:6:5000` */
export function encodeExtras(extras) {
  if (!extras?.length) return ''
  return extras.map(b => {
    const rec = RECURRENCES.has(b.recurrence) ? b.recurrence : 'once'
    const month = Math.max(1, Number(b.month) || 1)
    const amount = moneyParam(b.amount) ?? '0'
    if (rec === 'every') {
      const everyN = Math.max(2, Number(b.everyN) || 2)
      return `every:${month}:${everyN}:${amount}`
    }
    return `${rec}:${month}:${amount}`
  }).join('|')
}

/** Decode `ex` param → balloon rows (no ids; amounts as formatted money strings). */
export function decodeExtras(raw) {
  if (!raw || typeof raw !== 'string') return []
  const out = []
  for (const part of raw.split('|')) {
    const bits = part.split(':').filter(Boolean)
    if (bits.length < 3) continue
    const rec = bits[0]
    if (!RECURRENCES.has(rec)) continue

    if (rec === 'every') {
      if (bits.length < 4) continue
      const month = parseIntClamped(bits[1], 1, 600)
      const everyN = parseIntClamped(bits[2], 2, 120)
      const amount = parseNum(bits[3])
      if (month == null || everyN == null || amount == null || amount < 0) continue
      out.push({ recurrence: 'every', month, everyN, amount: formatMoney(amount) })
      continue
    }

    const month = parseIntClamped(bits[1], 1, 600)
    const amount = parseNum(bits[2])
    if (month == null || amount == null || amount < 0) continue
    out.push({
      recurrence: rec,
      month,
      everyN: 6,
      amount: formatMoney(amount)
    })
  }
  return out
}

function curvesEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false
  return a.every((v, i) => Math.abs(v - b[i]) < 1e-9)
}

function encodeScenario(prefix, scenario, params) {
  const dp = parseMoney(scenario.downPayment)
  const months = Math.max(1, Number(scenario.months) || 1)
  const interest = Math.max(0, Number(scenario.interest) || 0)
  const rp = scenario.ratePeriod === 'aa' ? 'aa' : 'am'
  const ee = scenario.extraEffect === 'term' ? 'term' : 'payment'

  if (dp !== DEFAULTS.downPayment) params.set(`${prefix}dp`, moneyParam(dp))
  if (months !== DEFAULTS.months) params.set(`${prefix}n`, String(months))
  if (interest !== DEFAULTS.interest) params.set(`${prefix}i`, String(interest))
  if (rp !== 'am') params.set(`${prefix}rp`, rp)
  if (ee !== 'payment') params.set(`${prefix}ee`, ee)
  if (scenario.balloonEnabled) {
    params.set(`${prefix}be`, '1')
    const ex = encodeExtras(scenario.balloons)
    if (ex) params.set(`${prefix}ex`, ex)
  }
}

function encodeStartMonth(state, params) {
  const ym = state.startMonth
  if (!ym) return
  const parsed = parseYearMonthInput(yearMonthInputValue(ym))
  if (!parsed) return
  const now = currentYearMonth()
  if (parsed.year === now.year && parsed.month === now.month) return
  params.set('sm', yearMonthInputValue(parsed))
}

function decodeScenario(prefix, params, fallback) {
  const base = { ...fallback }
  const dp = parseNum(params.get(`${prefix}dp`))
  const months = parseIntClamped(params.get(`${prefix}n`), 1, 600)
  const interest = parseNum(params.get(`${prefix}i`))
  const rp = params.get(`${prefix}rp`)
  const ee = params.get(`${prefix}ee`)
  const be = params.get(`${prefix}be`)
  const ex = params.get(`${prefix}ex`)

  if (dp != null && dp >= 0) base.downPayment = formatMoney(dp)
  if (months != null) base.months = months
  if (interest != null && interest >= 0) base.interest = interest
  if (RATE_PERIODS.has(rp)) base.ratePeriod = rp
  if (EXTRA_EFFECTS.has(ee)) base.extraEffect = ee
  if (be === '1' || be === 'true') {
    base.balloonEnabled = true
    const balloons = decodeExtras(ex)
    base.balloons = balloons
  } else if (ex) {
    base.balloonEnabled = true
    base.balloons = decodeExtras(ex)
  }
  return base
}

/**
 * Serialize calculator inputs to URLSearchParams (omit defaults).
 * @param {object} state
 */
export function encodeState(state) {
  const params = new URLSearchParams()
  const mode = MODES.has(state.mode) ? state.mode : 'price'
  const pv = parseMoney(state.propertyValue)
  const direction = state.direction === 'inverse' ? 'inverse' : 'forward'

  if (pv !== DEFAULTS.propertyValue) params.set('pv', moneyParam(pv) ?? '0')

  if (mode !== 'price') params.set('m', mode)

  if (mode === 'ab') {
    encodeScenario('a', state.scenarioA || {}, params)
    encodeScenario('b', state.scenarioB || {}, params)
    encodeStartMonth(state, params)
    return params
  }

  const dp = parseMoney(state.downPayment)
  const months = Math.max(1, Number(state.months) || 1)
  const interest = Math.max(0, Number(state.interest) || 0)
  const rp = state.ratePeriod === 'aa' ? 'aa' : 'am'
  const ee = state.extraEffect === 'term' ? 'term' : 'payment'

  if (dp !== DEFAULTS.downPayment) params.set('dp', moneyParam(dp))
  if (months !== DEFAULTS.months) params.set('n', String(months))
  if (interest !== DEFAULTS.interest) params.set('i', String(interest))
  if (rp !== 'am') params.set('rp', rp)
  if (direction !== 'forward') params.set('dir', direction)

  if (direction === 'inverse') {
    const sf = state.solveFor === 'down' ? 'down' : 'principal'
    if (sf !== 'principal') params.set('sf', sf)
    const mp = parseMoney(state.maxPayment)
    if (mp !== DEFAULTS.maxPayment) params.set('mp', moneyParam(mp))
  }

  if (ee !== 'payment') params.set('ee', ee)

  if (state.balloonEnabled) {
    params.set('be', '1')
    const ex = encodeExtras(state.balloons)
    if (ex) params.set('ex', ex)
  }

  if (mode === 'growing') {
    const preset = PRESETS.has(state.activePreset) ? state.activePreset : null
    const controls = Array.isArray(state.curveControls) ? state.curveControls : null
    if (preset && curvesEqual(controls, curvePresets[preset])) {
      if (preset !== 'linear') params.set('p', preset)
    } else if (controls?.length === 6) {
      params.set('c', controls.map(v => String(Math.round(Number(v) * 1000) / 1000)).join(','))
    } else if (preset && preset !== 'linear') {
      params.set('p', preset)
    }
  }

  encodeStartMonth(state, params)
  return params
}

/**
 * Parse query string into a partial state object, or null if empty/useless.
 * @param {string|URLSearchParams} search
 */
export function decodeState(search) {
  const params = typeof search === 'string'
    ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    : search

  if (![...params.keys()].length) return null

  const out = {}
  let touched = false

  const mode = params.get('m')
  if (MODES.has(mode)) {
    out.mode = mode
    touched = true
  }

  const pv = parseNum(params.get('pv'))
  if (pv != null && pv >= 0) {
    out.propertyValue = formatMoney(pv)
    touched = true
  }

  const sm = parseYearMonthInput(params.get('sm'))
  if (sm) {
    out.startMonth = sm
    touched = true
  }

  if (out.mode === 'ab' || mode === 'ab') {
    out.mode = 'ab'
    out.scenarioA = decodeScenario('a', params, {
      downPayment: formatMoney(DEFAULTS.downPayment),
      months: DEFAULTS.months,
      interest: DEFAULTS.interest,
      ratePeriod: 'am',
      balloonEnabled: false,
      balloons: [],
      extraEffect: 'payment'
    })
    out.scenarioB = decodeScenario('b', params, {
      downPayment: formatMoney(80000),
      months: 48,
      interest: 0.85,
      ratePeriod: 'am',
      balloonEnabled: false,
      balloons: [],
      extraEffect: 'payment'
    })
    // If any a*/b* key present, mark touched
    for (const key of params.keys()) {
      if (key.startsWith('a') || key.startsWith('b')) touched = true
    }
    return touched ? out : null
  }

  const dp = parseNum(params.get('dp'))
  if (dp != null && dp >= 0) {
    out.downPayment = formatMoney(dp)
    touched = true
  }

  const months = parseIntClamped(params.get('n'), 1, 600)
  if (months != null) {
    out.months = months
    touched = true
  }

  const interest = parseNum(params.get('i'))
  if (interest != null && interest >= 0) {
    out.interest = interest
    touched = true
  }

  const rp = params.get('rp')
  if (RATE_PERIODS.has(rp)) {
    out.ratePeriod = rp
    touched = true
  }

  const dir = params.get('dir')
  if (DIRECTIONS.has(dir)) {
    out.direction = dir
    touched = true
  }

  const sf = params.get('sf')
  if (SOLVE_FOR.has(sf)) {
    out.solveFor = sf
    touched = true
  }

  const mp = parseNum(params.get('mp'))
  if (mp != null && mp >= 0) {
    out.maxPayment = formatMoney(mp)
    touched = true
  }

  const ee = params.get('ee')
  if (EXTRA_EFFECTS.has(ee)) {
    out.extraEffect = ee
    touched = true
  }

  const be = params.get('be')
  const ex = params.get('ex')
  if (be === '1' || be === 'true' || ex) {
    out.balloonEnabled = true
    out.balloons = decodeExtras(ex)
    touched = true
  }

  const preset = params.get('p')
  if (PRESETS.has(preset)) {
    out.activePreset = preset
    out.curveControls = [...curvePresets[preset]]
    touched = true
  }

  const curveRaw = params.get('c')
  if (curveRaw) {
    const parts = curveRaw.split(',').map(s => parseNum(s.trim()))
    if (parts.length === 6 && parts.every(v => v != null && v > 0)) {
      out.curveControls = parts
      out.activePreset = 'custom'
      touched = true
    }
  }

  return touched ? out : null
}

export function buildShareUrl(state, loc = typeof window !== 'undefined' ? window.location : null) {
  const params = encodeState(state)
  const qs = params.toString()
  if (!loc) return qs ? `?${qs}` : '?'
  const base = `${loc.origin}${loc.pathname}`
  return qs ? `${base}?${qs}` : base
}

export function applyUrlToHistory(state, loc = typeof window !== 'undefined' ? window.location : null) {
  if (!loc || typeof history === 'undefined') return
  const params = encodeState(state)
  const qs = params.toString()
  const next = qs ? `${loc.pathname}?${qs}` : loc.pathname
  const current = `${loc.pathname}${loc.search}`
  if (next === current) return
  history.replaceState(null, '', next)
}
