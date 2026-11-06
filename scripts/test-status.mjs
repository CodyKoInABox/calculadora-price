import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const rawPath = join(root, 'test-results.json')
const outPath = join(root, 'src', 'test-status.json')

const run = spawnSync(
  'npx',
  ['vitest', 'run', '--reporter=default', '--reporter=json', '--outputFile=test-results.json'],
  { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' }
)

if (!existsSync(rawPath)) {
  console.error('test-status: relatório do Vitest não foi gerado.')
  process.exit(1)
}

const raw = JSON.parse(readFileSync(rawPath, 'utf8'))

const status = {
  passed: raw.numPassedTests ?? 0,
  failed: raw.numFailedTests ?? 0,
  total: raw.numTotalTests ?? 0,
  success: Boolean(raw.success),
  updatedAt: new Date().toISOString()
}

writeFileSync(outPath, `${JSON.stringify(status, null, 2)}\n`)
console.log(`test-status: ${status.passed}/${status.total} passed`)

process.exit(run.status === 0 && status.success ? 0 : 1)
