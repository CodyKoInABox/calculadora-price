// Builds the npm package for the financing engine into dist-engine/.
// The package is plain ESM with explicit file extensions (required by Node), no dependencies.
// Publish with: npm publish dist-engine --access public
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'src', 'engine')
const outDir = join(root, 'dist-engine')
const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const sources = readdirSync(srcDir).filter(name => name.endsWith('.js') && !name.endsWith('.test.js'))
for (const file of sources) {
  const text = readFileSync(join(srcDir, file), 'utf8')
  const withExtensions = text.replace(/(from\s+['"])(\.\/[\w-]+)(['"])/g, (_m, a, spec, b) => `${a}${spec}.js${b}`)
  writeFileSync(join(outDir, file), withExtensions)
}

const pkg = {
  name: 'calculadora-price-engine',
  version: rootPkg.version,
  description: 'Motor de financiamento Price, SAC e SACRE com TR, CET, seguros e amortizar ou investir. Sem dependências.',
  type: 'module',
  main: './index.js',
  exports: { '.': './index.js' },
  files: ['*.js', 'README.md'],
  sideEffects: false,
  license: rootPkg.license ?? 'MIT',
  keywords: ['financiamento', 'price', 'sac', 'sacre', 'amortizacao', 'cet', 'calculadora'],
  ...(rootPkg.repository ? { repository: rootPkg.repository } : {}),
  engines: { node: '>=18' }
}
writeFileSync(join(outDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')

writeFileSync(
  join(outDir, 'README.md'),
  `# calculadora-price-engine

Motor de financiamento em JavaScript puro. Usado pela calculadora em https://CodyKoInABox.github.io/calculadora-price/.

\`\`\`js
import { simulateFinancing, curvePresets } from 'calculadora-price-engine'

const r = simulateFinancing({
  property: 300000,
  down: 60000,
  months: 360,
  rate: 0.01,
  mode: 'price', // 'price' | 'sac' | 'sacre' | 'growing'
  balloons: new Map(),
  curveControls: [...curvePresets.linear],
  extraEffect: 'payment',
  correctionRate: 0 // TR mensal, só para mode 'sacre'
})
\`\`\`

Valores monetários entram em reais e saem em reais. A taxa é mensal, em decimal (0,01 = 1% a.m.).
`
)

cpSync(join(root, 'LICENSE'), join(outDir, 'LICENSE'), { force: true, errorOnExist: false })
console.log(`engine package written to dist-engine (${sources.length} modules, v${pkg.version})`)
