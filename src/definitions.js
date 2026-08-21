// Shared schema helpers for reading definitions.
//
// A definition describes a kind of reading: a name plus its fields. Every
// reading also carries the built-in defaults — a datetime and free-text notes —
// so definitions only declare the fields beyond those.
//
// /global-definitions holds the types every user starts with. On first login a
// copy of each is written under /users/{uid}/reading-definitions at the same
// key, so the user owns and can edit their copy without touching the shared
// original, and new global types appear for existing users on their next login.
//
// Copies keep `storage: 'flat'`, meaning their readings store values at the top
// level (r.systolic) rather than nested under r.values — that is how BP and
// glucose readings were already written, so existing history keeps resolving.

export const MAX_CUSTOM_FIELDS = 3

// Window used for a number field's average card when the definition predates
// the setting. Zero means the field has no average card.
export const DEFAULT_AVERAGE_DAYS = 7

export const FIELD_TYPES = [
  { value: 'number', label: 'Number' },
  { value: 'text', label: 'Text' },
  { value: 'select', label: 'Choice' },
]

export const TARGET_DIRECTIONS = [
  { value: 'max', label: 'At most', symbol: '≤' },
  { value: 'min', label: 'At least', symbol: '≥' },
]

// Seed data for /global-definitions, also used as a fallback so the app works
// before the node has been seeded.
export const GLOBAL_DEFINITIONS = {
  bp: {
    name: 'Blood Pressure',
    shortName: 'BP',
    color: '#f87171',
    chartColor: '#818cf8',
    storage: 'flat',
    builtIn: true,
    enabled: true,
    order: 1,
    fields: [
      { key: 'systolic', label: 'Systolic', type: 'number', unit: 'mmHg', required: true, min: 60, max: 300, step: 1, avgEnabled: true, avgDays: 7, targetEnabled: true, target: 120, targetDirection: 'max', joinWithNext: '/' },
      { key: 'diastolic', label: 'Diastolic', type: 'number', unit: 'mmHg', required: true, min: 30, max: 200, step: 1, avgEnabled: true, avgDays: 7, targetEnabled: true, target: 80, targetDirection: 'max' },
      { key: 'pulse', label: 'Pulse', type: 'number', unit: 'bpm', required: false, min: 30, max: 250, step: 1, avgEnabled: false, avgDays: 7, targetEnabled: false, target: null, targetDirection: 'max' },
    ],
  },
  glucose: {
    name: 'Blood Glucose',
    shortName: 'BG',
    color: '#34d399',
    chartColor: '#34d399',
    storage: 'flat',
    builtIn: true,
    enabled: true,
    order: 2,
    fields: [
      { key: 'glucose', label: 'Glucose', type: 'number', unit: 'mmol/L', required: true, min: 1, max: 35, step: 0.1, avgEnabled: true, avgDays: 7, targetEnabled: true, target: 5.5, targetDirection: 'max' },
      {
        key: 'meal',
        label: 'Meal Context',
        type: 'select',
        required: true,
        options: [
          { value: 'fasting', label: 'Fasting' },
          { value: 'before_meal', label: 'Before Meal' },
          { value: 'after_meal', label: 'After Meal' },
          { value: 'bedtime', label: 'Bedtime' },
        ],
      },
    ],
  },
}

// Turns a human label into a stable storage key, unique within `taken`.
export function toFieldKey(label, taken = [], index = 0) {
  const base = String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32)
  let key = base || `field_${index + 1}`
  let n = 2
  while (taken.includes(key)) {
    key = `${base || `field_${index + 1}`}_${n}`
    n++
  }
  return key
}

// Definitions are stored with their fields keyed by index in RTDB (which drops
// empty arrays), so normalize back to a plain array on read.
export function normalizeDefinition(id, raw) {
  if (!raw) return null
  const fields = Array.isArray(raw.fields)
    ? raw.fields
    : Object.keys(raw.fields || {}).sort().map(k => raw.fields[k])
  const correlations = Array.isArray(raw.correlations)
    ? raw.correlations
    : Object.keys(raw.correlations || {}).sort().map(k => raw.correlations[k])
  return {
    ...raw,
    id,
    storage: raw.storage || 'nested',
    enabled: raw.enabled !== false,
    correlations: correlations.filter(Boolean),
    fields: fields.filter(Boolean).map(f => ({
      ...f,
      options: Array.isArray(f.options)
        ? f.options
        : Object.keys(f.options || {}).sort().map(k => f.options[k]),
    })),
  }
}

// A short uppercase tag for the readings list, e.g. "Body Weight" -> "BW".
export function definitionTag(definition) {
  if (!definition) return '?'
  if (definition.shortName) return definition.shortName
  const words = definition.name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words.slice(0, 3).map(w => w[0]).join('').toUpperCase()
}

// Which definition a stored reading belongs to. Readings of flat definitions
// use the definition id as their type; nested ones carry it separately.
export function readingDefinitionId(reading) {
  return reading.type === 'custom' ? reading.definitionId : reading.type
}

export function getFieldValue(reading, definition, field) {
  if (!reading) return undefined
  return definition?.storage === 'flat' ? reading[field.key] : reading.values?.[field.key]
}

export function numericFields(definition) {
  return (definition?.fields || []).filter(f => f.type === 'number')
}

export function formatFieldValue(field, value) {
  if (value === null || value === undefined || value === '') return null
  if (field.type === 'select') {
    const opt = (field.options || []).find(o => o.value === value)
    return opt ? opt.label : String(value)
  }
  return String(value)
}

// Coerces a form input back to the type the field declares.
export function coerceFieldValue(field, raw) {
  if (raw === '' || raw === null || raw === undefined) return null
  if (field.type === 'number') {
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  return String(raw).trim()
}

// How many days a field's average card covers. 0 means the card is off —
// either switched off explicitly or given a window that is not a positive
// number. Fields saved before this setting existed keep the original 7 days.
export function averageDays(field) {
  if (field.type !== 'number') return 0
  if (field.avgEnabled === false) return 0
  if (field.avgDays === undefined || field.avgDays === null) return DEFAULT_AVERAGE_DAYS
  const n = Number(field.avgDays)
  return Number.isFinite(n) && n > 0 ? n : 0
}

// A field's target, or null when it has none.
export function targetFor(field) {
  if (!field || field.type !== 'number' || !field.targetEnabled) return null
  const value = Number(field.target)
  if (!Number.isFinite(value)) return null
  return {
    value,
    direction: field.targetDirection === 'min' ? 'min' : 'max',
    symbol: field.targetDirection === 'min' ? '≥' : '≤',
  }
}

// true/false when the value can be judged, null when there is nothing to judge.
export function meetsTarget(value, target) {
  if (!target || typeof value !== 'number' || !Number.isFinite(value)) return null
  return target.direction === 'min' ? value >= target.value : value <= target.value
}

// A reading scores well only when every field with a target meets it, which is
// how the old blood-pressure scoring treated systolic and diastolic together.
export function readingScoreClass(reading, definition) {
  if (!definition) return ''
  let judged = false
  let allGood = true
  for (const field of definition.fields || []) {
    const target = targetFor(field)
    if (!target) continue
    const ok = meetsTarget(getFieldValue(reading, definition, field), target)
    if (ok === null) continue
    judged = true
    if (!ok) allGood = false
  }
  if (!judged) return ''
  return allGood ? 'score-good' : 'score-bad'
}

// Shapes form values into the stored reading, honouring the definition's
// storage mode so flat types keep writing r.systolic rather than r.values.
export function buildReading(definition, values, notes, timestamp) {
  const stored = Object.fromEntries(
    (definition.fields || []).map(f => [f.key, coerceFieldValue(f, values[f.key])])
  )
  return definition.storage === 'flat'
    ? { type: definition.id, ...stored, notes, timestamp }
    : { type: 'custom', definitionId: definition.id, values: stored, notes, timestamp }
}

export function isDefinitionComplete(definition, values) {
  return (definition.fields || []).every(f => {
    if (!f.required) return true
    const v = values[f.key]
    return v !== '' && v !== null && v !== undefined
  })
}
