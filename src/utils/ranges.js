import { DEFAULT_AVERAGE_DAYS, averageDays, numericFields } from '../definitions'

export const AVERAGE_RANGES = [7, 14, 30, 90, Infinity]
export const rangeLabel = (days) => (days === Infinity ? 'All' : `${days}D`)
const rangeStorageKey = (definitionId) => `datanurse:avg-range:${definitionId}`

// The window a definition's average cards use by default: its fields' own setting.
export function defaultAverageRange(definition) {
  return Math.max(0, ...numericFields(definition).map(averageDays)) || DEFAULT_AVERAGE_DAYS
}

export function loadAverageRange(definition) {
  try {
    const v = localStorage.getItem(rangeStorageKey(definition.id))
    if (v === 'all') return Infinity
    const n = Number(v)
    if (v && Number.isFinite(n) && n > 0) return n
  } catch { /* storage unavailable */ }
  return defaultAverageRange(definition)
}

export function saveAverageRange(definition, days) {
  try {
    localStorage.setItem(rangeStorageKey(definition.id), days === Infinity ? 'all' : String(days))
  } catch { /* storage unavailable */ }
}
