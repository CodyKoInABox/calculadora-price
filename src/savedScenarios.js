import { decodeState } from './urlState'

export const STORAGE_KEY = 'calculadora-price:scenarios:v1'
export const FILE_FORMAT = 'calculadora-price-scenarios'
export const FILE_VERSION = 1
export const MAX_SAVED = 50
const MAX_NAME = 80
const MAX_QUERY = 4000

/** A saved scenario stores the same query string as a share link, so loading reuses the URL decoder. */
export function isQuery(query) {
  if (typeof query !== 'string' || query.length > MAX_QUERY) return false
  return query === '' || decodeState(query) !== null
}

export function cleanName(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)
}

function makeId(now) {
  return `${now}-${Math.random().toString(36).slice(2, 8)}`
}

function isEntry(entry) {
  return (
    entry &&
    typeof entry.id === 'string' &&
    typeof entry.name === 'string' &&
    isQuery(entry.query)
  )
}

export function readSaved(storage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isEntry).slice(0, MAX_SAVED) : []
  } catch {
    return []
  }
}

export function writeSaved(storage, list) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // storage disabled or quota exceeded: scenarios stay in memory for this session
  }
}

export function addSaved(list, { name, query }, now = Date.now()) {
  const clean = cleanName(name)
  if (!clean) return { error: 'Dê um nome ao cenário.' }
  if (!isQuery(query)) return { error: 'Não foi possível salvar esta configuração.' }
  return { list: [{ id: makeId(now), name: clean, query, savedAt: now }, ...list].slice(0, MAX_SAVED) }
}

export function removeSaved(list, id) {
  return list.filter(item => item.id !== id)
}

export function exportFile(list, now = Date.now()) {
  return JSON.stringify(
    {
      format: FILE_FORMAT,
      version: FILE_VERSION,
      exportedAt: new Date(now).toISOString(),
      scenarios: list.map(({ name, query, savedAt }) => ({ name, query, savedAt }))
    },
    null,
    2
  )
}

export function importFile(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return { error: 'O arquivo não é um JSON válido.' }
  }
  if (!data || data.format !== FILE_FORMAT || data.version !== FILE_VERSION || !Array.isArray(data.scenarios)) {
    return { error: 'Este arquivo não é uma exportação de cenários da calculadora.' }
  }
  const scenarios = data.scenarios.flatMap(item => {
    if (!item || typeof item.name !== 'string' || !isQuery(item.query)) return []
    const name = cleanName(item.name)
    if (!name) return []
    return [{ name, query: item.query, savedAt: Number.isFinite(item.savedAt) ? item.savedAt : null }]
  })
  if (!scenarios.length) return { error: 'Nenhum cenário válido encontrado no arquivo.' }
  return { scenarios: scenarios.slice(0, MAX_SAVED) }
}

export function mergeImported(list, imported, now = Date.now()) {
  const added = imported.map((item, i) => ({
    id: makeId(now + i),
    name: item.name,
    query: item.query,
    savedAt: item.savedAt ?? now
  }))
  return [...added, ...list].slice(0, MAX_SAVED)
}
