import { describe, expect, it } from 'vitest'
import * as reference from './legacy/math.reference.js'
import { simulateFinancing, solveFromMaxPayment, curvePresets } from './math'

function createRandom(seed) {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const between = (min, max) => min + (max - min) * next()
  const intBetween = (min, max) => Math.floor(between(min, max + 1))
  const pick = values => values[Math.floor(next() * values.length)]
  return { next, between, intBetween, pick }
}

function expectIdentical(actual, expected, path = 'result') {
  if (typeof expected === 'number' || typeof actual === 'number') {
    if (!Object.is(actual, expected)) {
      throw new Error(`${path}: ${String(actual)} !== ${String(expected)}`)
    }
    return
  }
  if (expected === null || typeof expected !== 'object' || actual === null || typeof actual !== 'object') {
    expect(actual, path).toBe(expected)
    return
  }
  expect(Object.keys(actual).sort(), path).toEqual(Object.keys(expected).sort())
  for (const key of Object.keys(expected)) expectIdentical(actual[key], expected[key], `${path}.${key}`)
}

const CURVES = [
  [...curvePresets.linear],
  [...curvePresets.hill],
  [...curvePresets['fast-start']],
  [...curvePresets['fast-end']],
  [0.25, 0.25, 0.25, 0.25, 0.25, 0.25],
  [2.5, 2.5, 2.5, 2.5, 2.5, 2.5],
  [0.25, 2.5, 0.25, 2.5, 0.25, 2.5]
]

function randomCurve(rng) {
  if (rng.next() < 0.6) return [...rng.pick(CURVES)]
  return Array.from({ length: 6 }, () => Math.round(rng.between(0.25, 2.5) * 100) / 100)
}

function randomRate(rng) {
  const roll = rng.next()
  if (roll < 0.08) return 0
  if (roll < 0.14) return 1e-12
  if (roll < 0.2) return rng.between(0.5, 3)
  return Math.round(rng.between(0.0005, 0.03) * 1e6) / 1e6
}

function randomMoney(rng) {
  const roll = rng.next()
  if (roll < 0.05) return 0
  if (roll < 0.15) return Math.round(rng.between(1, 1000) * 100) / 100
  if (roll < 0.92) return Math.round(rng.between(10_000, 2_000_000) * 100) / 100
  return Math.round(rng.between(1e8, 1e10) * 100) / 100
}

function randomBalloons(rng, months) {
  const balloons = new Map()
  const count = rng.intBetween(0, 3)
  for (let i = 0; i < count; i++) {
    balloons.set(rng.intBetween(1, months), Math.round(rng.between(100, 80_000) * 100) / 100)
  }
  return balloons
}

function randomInput(rng, maxMonths) {
  const months = rng.next() < 0.5 ? rng.intBetween(1, 24) : rng.intBetween(1, maxMonths)
  const mode = rng.pick(['price', 'sac', 'sacre', 'growing', 'growing', 'growing'])
  const property = randomMoney(rng) + 1
  return {
    property,
    down: Math.round(property * rng.between(0, 0.8) * 100) / 100,
    months,
    rate: randomRate(rng),
    mode,
    balloons: rng.next() < 0.4 ? randomBalloons(rng, months) : new Map(),
    curveControls: randomCurve(rng),
    extraEffect: rng.pick(['payment', 'term']),
    correctionRate: mode === 'sacre' && rng.next() < 0.5 ? rng.between(0, 0.02) : 0
  }
}

function randomTarget(rng, forward) {
  const roll = rng.next()
  if (!forward.error && roll < 0.6) {
    const max = reference.maxRegularPayment(forward.schedule)
    const target = max * (rng.next() < 0.5 ? 1 : rng.between(0.9, 1.1))
    return target > 0 ? target : 0.01
  }
  if (roll < 0.8) return rng.between(1, 20_000)
  return rng.pick([0.000001, 0.005, 0.01, 1, 1e6, 5e8])
}

describe('engine equivalence with the reference implementation', () => {
  it('simulateFinancing returns identical results over random inputs', () => {
    const rng = createRandom(20241)
    for (let i = 0; i < 1200; i++) {
      const input = randomInput(rng, 120)
      expectIdentical(simulateFinancing(input), reference.simulateFinancing(input), `simulate[${i}]`)
    }
  })

  it('solveFromMaxPayment returns identical results over random inputs up to 120 months', () => {
    const rng = createRandom(7)
    for (let i = 0; i < 120; i++) {
      const base = randomInput(rng, 120)
      const forward = reference.simulateFinancing(base)
      const input = {
        ...base,
        targetPayment: randomTarget(rng, forward),
        solveFor: rng.next() < 0.7 ? 'principal' : 'down'
      }
      expectIdentical(solveFromMaxPayment(input), reference.solveFromMaxPayment(input), `solve[${i}]`)
    }
  }, 120_000)

  it('solveFromMaxPayment matches the reference at 360 months', () => {
    for (const curveControls of [CURVES[0], CURVES[1], CURVES[3]]) {
      for (const targetPayment of [3666.17, 3014.27]) {
        const input = {
          targetPayment,
          solveFor: 'principal',
          property: 300_000,
          down: 60_000,
          months: 360,
          rate: 0.01,
          mode: 'growing',
          balloons: new Map(),
          curveControls,
          extraEffect: 'payment'
        }
        expectIdentical(solveFromMaxPayment(input), reference.solveFromMaxPayment(input))
      }
    }
  }, 120_000)

  it('matches the reference on boundary inputs', () => {
    const base = {
      balloons: new Map(),
      curveControls: [...curvePresets.linear],
      extraEffect: 'payment',
      correctionRate: 0
    }
    const cases = [
      { property: 0.01, down: 0, months: 1, rate: 0, mode: 'growing', targetPayment: 0.01, solveFor: 'principal' },
      { property: 1, down: 0, months: 1, rate: 0, mode: 'growing', targetPayment: 1, solveFor: 'principal' },
      { property: 100_000, down: 0, months: 1, rate: 1, mode: 'growing', targetPayment: 500, solveFor: 'principal' },
      { property: 100_000, down: 0, months: 600, rate: 1e-12, mode: 'growing', targetPayment: 200, solveFor: 'principal' },
      { property: 100_000, down: 0, months: 600, rate: 0.0117, mode: 'growing', targetPayment: 200, solveFor: 'down' },
      { property: 2e13, down: 0, months: 1, rate: 1, mode: 'growing', targetPayment: 1e9, solveFor: 'principal' },
      { property: 2e13, down: 0, months: 2, rate: 3, mode: 'growing', targetPayment: 1e12, solveFor: 'principal' },
      { property: 1e12, down: 0, months: 12, rate: 0.01, mode: 'growing', targetPayment: 1000, solveFor: 'principal' },
      { property: 9e13, down: 0, months: 12, rate: 0.01, mode: 'growing', targetPayment: 1000, solveFor: 'principal' },
      { property: 100_000, down: 0, months: 12, rate: 0.01, mode: 'growing', targetPayment: 0.000001, solveFor: 'principal' },
      { property: 300_000, down: 60_000, months: 120, rate: 0.01, mode: 'growing', targetPayment: 4000, solveFor: 'principal', curveControls: [0.25, 0.25, 0.25, 0.25, 0.25, 0.25] },
      { property: 300_000, down: 60_000, months: 120, rate: 0.01, mode: 'growing', targetPayment: 4000, solveFor: 'principal', curveControls: [2.5, 2.5, 2.5, 2.5, 2.5, 2.5] },
      { property: 300_000, down: 60_000, months: 60, rate: 0.01, mode: 'growing', targetPayment: 6000, solveFor: 'principal', balloons: new Map([[60, 50_000]]), extraEffect: 'term' },
      { property: 300_000, down: 60_000, months: 60, rate: 0.01, mode: 'growing', targetPayment: 6000, solveFor: 'principal', balloons: new Map([[12, 40_000], [30, 40_000]]), extraEffect: 'payment' },
      { property: 300_000, down: 60_000, months: 60, rate: 0.01, mode: 'growing', targetPayment: 6000, solveFor: 'down', balloons: new Map([[12, 40_000]]), extraEffect: 'payment' }
    ]

    cases.forEach((partial, index) => {
      const input = { ...base, ...partial }
      expectIdentical(solveFromMaxPayment(input), reference.solveFromMaxPayment(input), `boundary[${index}]`)
      expectIdentical(simulateFinancing(input), reference.simulateFinancing(input), `boundarySim[${index}]`)
    })
  }, 120_000)
})
