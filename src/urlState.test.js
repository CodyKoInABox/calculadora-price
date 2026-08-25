import { describe, expect, it } from 'vitest'
import { curvePresets, parseMoney } from './math'
import { currentYearMonth } from './format'
import {
  encodeState,
  decodeState,
  encodeExtras,
  decodeExtras,
  buildShareUrl
} from './urlState'

const baseState = {
  propertyValue: '300.000,00',
  downPayment: '60.000,00',
  months: 36,
  interest: 1,
  ratePeriod: 'am',
  mode: 'price',
  direction: 'forward',
  solveFor: 'principal',
  maxPayment: '8.000,00',
  extraEffect: 'payment',
  balloonEnabled: false,
  balloons: [],
  activePreset: 'linear',
  curveControls: [...curvePresets.linear],
  scenarioA: {
    downPayment: '60.000,00',
    months: 36,
    interest: 1,
    ratePeriod: 'am',
    balloonEnabled: false,
    balloons: [],
    extraEffect: 'payment'
  },
  scenarioB: {
    downPayment: '80.000,00',
    months: 48,
    interest: 0.85,
    ratePeriod: 'am',
    balloonEnabled: false,
    balloons: [],
    extraEffect: 'payment'
  }
}

describe('encodeExtras / decodeExtras', () => {
  it('round-trips once and every', () => {
    const rows = [
      { recurrence: 'once', month: 6, amount: '10.000,00' },
      { recurrence: 'every', month: 12, everyN: 6, amount: '5.000,00' },
      { recurrence: 'monthly', month: 1, amount: '500,00' }
    ]
    const encoded = encodeExtras(rows)
    expect(encoded).toBe('once:6:10000|every:12:6:5000|monthly:1:500')
    const decoded = decodeExtras(encoded)
    expect(decoded).toHaveLength(3)
    expect(decoded[0]).toMatchObject({ recurrence: 'once', month: 6 })
    expect(parseMoney(decoded[0].amount)).toBe(10000)
    expect(decoded[1]).toMatchObject({ recurrence: 'every', month: 12, everyN: 6 })
    expect(parseMoney(decoded[1].amount)).toBe(5000)
    expect(decoded[2].recurrence).toBe('monthly')
  })

  it('ignores garbage segments', () => {
    expect(decodeExtras('nope|once:x:y|once:3:1000')).toEqual([
      { recurrence: 'once', month: 3, everyN: 6, amount: '1.000,00' }
    ])
  })

  it('rejects fractional and out-of-horizon months and recurrence intervals', () => {
    const decoded = decodeExtras(
      'once:2.5:100|once:0:100|once:13:100|every:2:2.5:100|every:2:121:100|monthly:12:100',
      12
    )

    expect(decoded).toEqual([
      { recurrence: 'monthly', month: 12, everyN: 6, amount: '100,00' }
    ])
  })

  it('does not encode rejected extra fields as corrected values', () => {
    const encoded = encodeExtras([
      { recurrence: 'once', month: 2.5, amount: '100,00' },
      { recurrence: 'once', month: 13, amount: '100,00' },
      { recurrence: 'every', month: 2, everyN: 2.5, amount: '100,00' },
      { recurrence: 'invalid', month: 2, amount: '100,00' },
      { recurrence: 'monthly', month: 12, amount: '100,00' }
    ], 12)

    expect(encoded).toBe('monthly:12:100')
  })
})

describe('encodeState / decodeState', () => {
  it('omits defaults for a clean price link', () => {
    const params = encodeState(baseState)
    expect(params.toString()).toBe('')
  })

  it('round-trips price with custom pv/dp/n/i', () => {
    const state = {
      ...baseState,
      propertyValue: '450.000,00',
      downPayment: '90.000,00',
      months: 48,
      interest: 0.95
    }
    const params = encodeState(state)
    expect(params.get('pv')).toBe('450000')
    expect(params.get('dp')).toBe('90000')
    expect(params.get('n')).toBe('48')
    expect(params.get('i')).toBe('0.95')

    const decoded = decodeState(params)
    expect(parseMoney(decoded.propertyValue)).toBe(450000)
    expect(parseMoney(decoded.downPayment)).toBe(90000)
    expect(decoded.months).toBe(48)
    expect(decoded.interest).toBe(0.95)
  })

  it('rejects fractional and out-of-range terms instead of rounding or clamping', () => {
    expect(decodeState('?n=36.5')).toBeNull()
    expect(decodeState('?n=0')).toBeNull()
    expect(decodeState('?n=601')).toBeNull()

    const params = encodeState({
      ...baseState,
      months: 36.5,
      balloonEnabled: true,
      balloons: [{ recurrence: 'once', month: 40, amount: '1.000,00' }]
    })
    expect(params.get('n')).toBeNull()
    expect(params.get('ex')).toBeNull()
  })

  it('filters decoded extras against the sanitized contract term', () => {
    const decoded = decodeState(
      '?n=12&be=1&ex=once:12:1000|once:13:1000|every:2:2.5:500'
    )

    expect(decoded.months).toBe(12)
    expect(decoded.balloons).toEqual([
      { recurrence: 'once', month: 12, everyN: 6, amount: '1.000,00' }
    ])
  })

  it('round-trips growing mode with preset', () => {
    const state = {
      ...baseState,
      mode: 'growing',
      activePreset: 'hill',
      curveControls: [...curvePresets.hill]
    }
    const params = encodeState(state)
    expect(params.get('m')).toBe('growing')
    expect(params.get('p')).toBe('hill')
    expect(params.get('c')).toBeNull()

    const decoded = decodeState(params)
    expect(decoded.mode).toBe('growing')
    expect(decoded.activePreset).toBe('hill')
    expect(decoded.curveControls).toEqual(curvePresets.hill)
  })

  it('round-trips custom curve controls', () => {
    const controls = [0.5, 0.8, 1.1, 1.4, 1.7, 2.0]
    const state = {
      ...baseState,
      mode: 'growing',
      activePreset: 'custom',
      curveControls: controls
    }
    const params = encodeState(state)
    expect(params.get('c')).toBe('0.5,0.8,1.1,1.4,1.7,2')
    const decoded = decodeState(params)
    expect(decoded.curveControls).toEqual(controls)
  })

  it('rejects custom curve controls outside the engine contract', () => {
    expect(decodeState('?m=growing&c=0.1,0.25,1,1,1,1')).toEqual({
      mode: 'growing'
    })
    expect(decodeState('?c=0.25,1,1,1,1,2.51')).toBeNull()
    expect(decodeState('?c=0.25,1,1,1,1,Infinity')).toBeNull()

    const params = encodeState({
      ...baseState,
      mode: 'growing',
      activePreset: 'custom',
      curveControls: [0.1, 1, 1, 1, 1, 2.5]
    })
    expect(params.get('c')).toBeNull()
  })

  it('round-trips compare + inverse + extras', () => {
    const state = {
      ...baseState,
      mode: 'compare',
      direction: 'inverse',
      solveFor: 'down',
      maxPayment: '7.500,00',
      extraEffect: 'term',
      balloonEnabled: true,
      balloons: [{ recurrence: 'yearly', month: 12, amount: '20.000,00' }],
      ratePeriod: 'aa',
      interest: 12
    }
    const params = encodeState(state)
    expect(params.get('m')).toBe('compare')
    expect(params.get('dir')).toBe('inverse')
    expect(params.get('sf')).toBe('down')
    expect(params.get('mp')).toBe('7500')
    expect(params.get('ee')).toBe('term')
    expect(params.get('be')).toBe('1')
    expect(params.get('ex')).toBe('yearly:12:20000')
    expect(params.get('rp')).toBe('aa')

    const decoded = decodeState(params)
    expect(decoded.mode).toBe('compare')
    expect(decoded.direction).toBe('inverse')
    expect(decoded.solveFor).toBe('down')
    expect(parseMoney(decoded.maxPayment)).toBe(7500)
    expect(decoded.extraEffect).toBe('term')
    expect(decoded.balloonEnabled).toBe(true)
    expect(decoded.balloons).toHaveLength(1)
    expect(decoded.ratePeriod).toBe('aa')
  })

  it('round-trips ab scenarios', () => {
    const state = {
      ...baseState,
      mode: 'ab',
      propertyValue: '500.000,00',
      scenarioA: {
        downPayment: '100.000,00',
        months: 24,
        interest: 1.1,
        ratePeriod: 'am',
        balloonEnabled: true,
        balloons: [{ recurrence: 'once', month: 6, amount: '15.000,00' }],
        extraEffect: 'payment'
      },
      scenarioB: {
        downPayment: '50.000,00',
        months: 60,
        interest: 0.9,
        ratePeriod: 'aa',
        balloonEnabled: false,
        balloons: [],
        extraEffect: 'term'
      }
    }
    const params = encodeState(state)
    expect(params.get('m')).toBe('ab')
    expect(params.get('pv')).toBe('500000')
    expect(params.get('adp')).toBe('100000')
    expect(params.get('an')).toBe('24')
    expect(params.get('abe')).toBe('1')
    expect(params.get('aex')).toBe('once:6:15000')
    expect(params.get('bdp')).toBe('50000')
    expect(params.get('bn')).toBe('60')
    expect(params.get('brp')).toBe('aa')
    expect(params.get('bee')).toBe('term')

    const decoded = decodeState(params)
    expect(decoded.mode).toBe('ab')
    expect(parseMoney(decoded.propertyValue)).toBe(500000)
    expect(parseMoney(decoded.scenarioA.downPayment)).toBe(100000)
    expect(decoded.scenarioA.months).toBe(24)
    expect(decoded.scenarioA.balloonEnabled).toBe(true)
    expect(decoded.scenarioA.balloons[0].recurrence).toBe('once')
    expect(parseMoney(decoded.scenarioB.downPayment)).toBe(50000)
    expect(decoded.scenarioB.extraEffect).toBe('term')
    expect(decoded.scenarioB.ratePeriod).toBe('aa')
  })

  it('sanitizes terms and extras inside A/B scenarios', () => {
    const decoded = decodeState(
      '?m=ab&an=12.5&aex=once:37:1000&bn=24&bex=once:25:1000|every:2:2.5:500'
    )

    expect(decoded.scenarioA.months).toBe(36)
    expect(decoded.scenarioA.balloons).toEqual([])
    expect(decoded.scenarioB.months).toBe(24)
    expect(decoded.scenarioB.balloons).toEqual([])
  })

  it('round-trips start month when it is not the current month', () => {
    const state = { ...baseState, startMonth: { year: 2031, month: 3 } }
    const params = encodeState(state)
    expect(params.get('sm')).toBe('2031-03')
    expect(decodeState(params).startMonth).toEqual({ year: 2031, month: 3 })
  })

  it('omits start month when it matches the current month', () => {
    const state = { ...baseState, startMonth: currentYearMonth() }
    expect(encodeState(state).get('sm')).toBeNull()
  })

  it('returns null for empty or garbage-only search', () => {
    expect(decodeState('')).toBeNull()
    expect(decodeState('?')).toBeNull()
    expect(decodeState('?foo=bar&zzz=1')).toBeNull()
  })
})

describe('buildShareUrl', () => {
  it('uses origin + pathname + query', () => {
    const loc = {
      origin: 'https://CodyKoInABox.github.io',
      pathname: '/calculadora-price/'
    }
    const url = buildShareUrl({
      ...baseState,
      propertyValue: '200.000,00',
      months: 24
    }, loc)
    expect(url).toBe('https://CodyKoInABox.github.io/calculadora-price/?pv=200000&n=24')
  })

  it('omits ? when state is all defaults', () => {
    const loc = { origin: 'https://example.com', pathname: '/calculadora-price/' }
    expect(buildShareUrl(baseState, loc)).toBe('https://example.com/calculadora-price/')
  })
})
