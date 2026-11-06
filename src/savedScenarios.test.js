import { describe, expect, it } from 'vitest'
import {
  MAX_SAVED,
  STORAGE_KEY,
  addSaved,
  exportFile,
  importFile,
  isQuery,
  mergeImported,
  readSaved,
  removeSaved,
  writeSaved
} from './savedScenarios'

function fakeStorage(initial = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: key => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value)
    }
  }
}

const QUERY = 'n=360&i=0.9&dp=50000'

describe('isQuery', () => {
  it('accepts an empty query (all defaults) and valid share queries', () => {
    expect(isQuery('')).toBe(true)
    expect(isQuery(QUERY)).toBe(true)
  })

  it('rejects unknown keys, oversized strings and non-strings', () => {
    expect(isQuery('foo=bar')).toBe(false)
    expect(isQuery('n=36&x=' + 'a'.repeat(5000))).toBe(false)
    expect(isQuery(null)).toBe(false)
  })
})

describe('addSaved / removeSaved', () => {
  it('trims and caps the name, and stores the query', () => {
    const { list } = addSaved([], { name: '  Caixa   30 anos  ', query: QUERY }, 1000)
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('Caixa 30 anos')
    expect(list[0].query).toBe(QUERY)
    expect(list[0].savedAt).toBe(1000)
  })

  it('refuses an empty name', () => {
    expect(addSaved([], { name: '   ', query: QUERY }).error).toBeDefined()
  })

  it('refuses a query that the URL decoder cannot read', () => {
    expect(addSaved([], { name: 'x', query: 'foo=bar' }).error).toBeDefined()
  })

  it('keeps newest first and never exceeds the limit', () => {
    let list = []
    for (let i = 0; i < MAX_SAVED + 5; i++) {
      list = addSaved(list, { name: `c${i}`, query: QUERY }, i).list
    }
    expect(list).toHaveLength(MAX_SAVED)
    expect(list[0].name).toBe(`c${MAX_SAVED + 4}`)
  })

  it('removes by id', () => {
    const { list } = addSaved([], { name: 'a', query: QUERY }, 1)
    expect(removeSaved(list, list[0].id)).toEqual([])
  })
})

describe('storage', () => {
  it('round-trips through storage', () => {
    const storage = fakeStorage()
    const { list } = addSaved([], { name: 'a', query: QUERY }, 1)
    writeSaved(storage, list)
    expect(readSaved(storage)).toEqual(list)
  })

  it('returns an empty list for corrupt or missing data', () => {
    expect(readSaved(fakeStorage({ [STORAGE_KEY]: '{not json' }))).toEqual([])
    expect(readSaved(fakeStorage({ [STORAGE_KEY]: '{"a":1}' }))).toEqual([])
    expect(readSaved(null)).toEqual([])
  })

  it('drops invalid entries but keeps valid ones', () => {
    const good = { id: 'g', name: 'ok', query: QUERY, savedAt: 1 }
    const bad = { id: 'b', name: 'bad', query: 'foo=bar', savedAt: 1 }
    const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify([good, bad]) })
    expect(readSaved(storage)).toEqual([good])
  })
})

describe('export / import', () => {
  it('round-trips scenarios through a file', () => {
    const { list } = addSaved([], { name: 'Caixa', query: QUERY }, 1)
    const text = exportFile(list, 2)
    const result = importFile(text)
    expect(result.scenarios).toEqual([{ name: 'Caixa', query: QUERY, savedAt: 1 }])
  })

  it('rejects files that are not scenario exports', () => {
    expect(importFile('{"hello":1}').error).toBeDefined()
    expect(importFile('nope').error).toBeDefined()
    expect(importFile(JSON.stringify({ format: 'calculadora-price-scenarios', version: 99, scenarios: [] })).error).toBeDefined()
  })

  it('skips broken entries and fails when nothing is valid', () => {
    const text = JSON.stringify({
      format: 'calculadora-price-scenarios',
      version: 1,
      scenarios: [{ name: 'x', query: 'foo=bar' }, { name: '', query: QUERY }, { name: 'ok', query: QUERY }]
    })
    expect(importFile(text).scenarios.map(s => s.name)).toEqual(['ok'])

    const empty = JSON.stringify({ format: 'calculadora-price-scenarios', version: 1, scenarios: [{ name: 'x', query: 'foo=bar' }] })
    expect(importFile(empty).error).toBeDefined()
  })

  it('merges imported scenarios in front of existing ones with fresh ids', () => {
    const { list: existing } = addSaved([], { name: 'old', query: QUERY }, 1)
    const merged = mergeImported(existing, [{ name: 'new', query: QUERY, savedAt: null }], 5)
    expect(merged.map(s => s.name)).toEqual(['new', 'old'])
    expect(new Set(merged.map(s => s.id)).size).toBe(2)
    expect(merged[0].savedAt).toBe(5)
  })
})
