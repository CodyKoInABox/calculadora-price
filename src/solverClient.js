let current = null

/**
 * Runs solver jobs off the main thread. A new call cancels the previous one:
 * its promise resolves to null and its worker is terminated, so stale work
 * never blocks the UI or overwrites a newer result.
 */
export function solveInBackground(jobs) {
  current?.cancel()

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./solver.worker.js', import.meta.url), { type: 'module' })
    const finish = () => {
      worker.terminate()
      if (current?.worker === worker) current = null
    }

    worker.onmessage = ({ data }) => {
      finish()
      if (data.error) reject(new Error(data.error))
      else resolve(data.outs)
    }
    worker.onerror = event => {
      finish()
      reject(event.error || new Error('Falha no cálculo.'))
    }

    current = {
      worker,
      cancel: () => {
        finish()
        resolve(null)
      }
    }
    worker.postMessage({ jobs })
  })
}
