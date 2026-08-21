// Medications: a record per medicine, plus one log entry per dose taken.
//
// Logs live at /users/{uid}/medication-logs/{medicationId}_{day}_{slot} — a
// deterministic key, so ticking a dose twice cannot create duplicates and
// un-ticking is a plain delete.

export const MAX_MEDICATION_EXTRAS = 3

export const SLOTS = [
  { key: 'morning', label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'night', label: 'Night' },
]

export const FREQUENCIES = [
  { value: 1, label: 'Once a day' },
  { value: 2, label: 'Twice a day' },
  { value: 3, label: '3 times a day' },
]

export const MEAL_TIMINGS = [
  { value: 'before_meal', label: 'Before meal' },
  { value: 'after_meal', label: 'After meal' },
]

// Twice a day is morning and night; three times adds the afternoon dose.
export function slotsFor(frequency) {
  const n = Number(frequency) || 1
  if (n >= 3) return SLOTS
  if (n === 2) return [SLOTS[0], SLOTS[2]]
  return [SLOTS[0]]
}

export function slotLabel(key) {
  return SLOTS.find(s => s.key === key)?.label || key
}

export function mealLabel(value) {
  return MEAL_TIMINGS.find(m => m.value === value)?.label || ''
}

export function frequencyLabel(frequency) {
  return FREQUENCIES.find(f => f.value === Number(frequency))?.label || `${frequency}× a day`
}

// Local calendar day, so a dose logged at 11pm belongs to that day.
export function dayKey(date = new Date()) {
  const d = new Date(date)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function logKey(medicationId, day, slot) {
  return `${medicationId}_${day}_${slot}`
}

export function normalizeMedication(id, raw) {
  if (!raw) return null
  const extras = Array.isArray(raw.extras)
    ? raw.extras
    : Object.keys(raw.extras || {}).sort().map(k => raw.extras[k])
  return {
    ...raw,
    id,
    enabled: raw.enabled !== false,
    frequency: Number(raw.frequency) || 1,
    extras: extras.filter(e => e && e.label),
  }
}

// Which of today's doses are already logged.
export function todayProgress(medication, logs, day = dayKey()) {
  const slots = slotsFor(medication.frequency)
  const taken = slots.filter(s => logs[logKey(medication.id, day, s.key)])
  return { slots, taken: taken.length, total: slots.length }
}

export function progressState({ taken, total }) {
  if (taken === 0) return 'none'
  return taken >= total ? 'complete' : 'partial'
}

// Distinct days with at least one dose logged, and the total dose count.
export function medicationStats(medicationId, logs) {
  const days = new Set()
  let doses = 0
  Object.values(logs).forEach(log => {
    if (log.medicationId !== medicationId) return
    doses++
    days.add(log.day)
  })
  return { days: days.size, doses }
}
