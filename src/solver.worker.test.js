import { describe, expect, it, vi } from 'vitest'
import { curvePresets, simulateFinancing, solveFromMaxPayment } from './math'

async function runWorker(jobs) {
  const posted = []
  vi.stubGlobal('self', { postMessage: message => posted.push(message), onmessage: null })
  vi.resetModules()
  await import('./solver.worker.js')
  self.onmessage({ data: { jobs } })
  vi.unstubAllGlobals()
  return posted[0]
}

const base = {
  property: 300000,
  down: 60000,
  months: 120,
  rate: 0.01,
  balloons: new Map(),
  curveControls: [...curvePresets.hill],
  extraEffect: 'payment'
}

describe('solver.worker', () => {
  it('returns the same outputs as calling the solvers directly', async () => {
    const inverse = { ...base, mode: 'price', targetPayment: 3000, solveFor: 'principal' }
    const forward = { ...base, mode: 'growing' }
    const message = await runWorker([
      { kind: 'inverse', payload: inverse },
      { kind: 'forward', payload: forward }
    ])

    expect(message.outs[0]).toEqual(solveFromMaxPayment(inverse))
    expect(message.outs[1]).toEqual(simulateFinancing(forward))
  })

  it('reports thrown errors instead of leaving the caller waiting', async () => {
    const message = await runWorker([{ kind: 'forward', payload: null }])
    expect(message.error).toEqual(expect.any(String))
  })
})
