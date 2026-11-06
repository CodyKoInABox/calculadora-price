import { simulateFinancing, solveFromMaxPayment } from './math'

const solvers = {
  forward: simulateFinancing,
  inverse: solveFromMaxPayment
}

self.onmessage = ({ data }) => {
  try {
    const outs = data.jobs.map(({ kind, payload }) => solvers[kind](payload))
    self.postMessage({ outs })
  } catch (error) {
    self.postMessage({ error: String(error?.message || error) })
  }
}
