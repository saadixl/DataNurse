// Medications: a record per medicine, plus one log entry per dose taken.
//
// Logs live at /users/{uid}/medication-logs/{medicationId}_{day}_{slot} — a
// deterministic key, so ticking a dose twice cannot create duplicates and
// un-ticking is a plain delete.

export const MAX_MEDICATION_EXTRAS = 3

export const SLOTS = [
  { key: 'morning', label: 'Morning', hour: 8 },
  { key: 'afternoon', label: 'Afternoon', hour: 14 },
  { key: 'night', label: 'Night', hour: 21 },
]

// When a dose logged now counts as taken: now for today, and the slot's usual
// hour for a past day logged after the fact.
export function takenAtFor(day, slot, now = new Date()) {
  if (day === dayKey(now)) return now.toISOString()
  const [y, m, d] = String(day).split('-').map(Number)
  const hour = SLOTS.find(s => s.key === slot)?.hour ?? 12
  return new Date(y, m - 1, d, hour).toISOString()
}

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

// ---------- Adherence ----------

// 'YYYY-MM-DD' as a local Date at midnight.
export function parseDayKey(day) {
  const [y, m, d] = String(day).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(day, n) {
  const d = parseDayKey(day)
  d.setDate(d.getDate() + n)
  return dayKey(d)
}

// The first day a medication counts from: when it was added, or its earliest
// logged dose if that is earlier (sample data, or doses logged for past days).
export function medicationStartDay(medication, logs) {
  let start = medication.createdAt ? dayKey(new Date(medication.createdAt)) : null
  Object.values(logs).forEach(log => {
    if (log.medicationId === medication.id && (!start || log.day < start)) start = log.day
  })
  return start || dayKey()
}

// How many of a day's scheduled doses are logged.
export function dayProgress(medication, logs, day) {
  return todayProgress(medication, logs, day)
}

/**
 * Share of scheduled doses taken over the last `days` full days (today is
 * left out until it's over, unless it is already complete), from the start day.
 */
export function adherence(medication, logs, days, today = dayKey()) {
  const start = medicationStartDay(medication, logs)
  const todayDone = progressState(dayProgress(medication, logs, today)) === 'complete'
  let scheduled = 0
  let taken = 0
  for (let i = todayDone ? 0 : 1; i < days + (todayDone ? 0 : 1); i++) {
    const day = addDays(today, -i)
    if (day < start) break
    const p = dayProgress(medication, logs, day)
    scheduled += p.total
    taken += p.taken
  }
  return { scheduled, taken, rate: scheduled ? taken / scheduled : null }
}

// Consecutive days with every dose taken, ending today (or yesterday while
// today is still in progress).
export function streak(medication, logs, today = dayKey()) {
  const start = medicationStartDay(medication, logs)
  let day = progressState(dayProgress(medication, logs, today)) === 'complete' ? today : addDays(today, -1)
  let count = 0
  while (day >= start && progressState(dayProgress(medication, logs, day)) === 'complete') {
    count++
    day = addDays(day, -1)
  }
  return count
}

/**
 * The last `weeks` weeks as calendar cells, Monday first:
 * [{ day, state: 'complete' | 'partial' | 'none' | 'future' | 'before', taken, total }].
 */
export function adherenceCalendar(medication, logs, weeks = 5, today = dayKey()) {
  const start = medicationStartDay(medication, logs)
  const todayDate = parseDayKey(today)
  const mondayOffset = (todayDate.getDay() + 6) % 7
  const first = addDays(today, -mondayOffset - (weeks - 1) * 7)
  const cells = []
  for (let i = 0; i < weeks * 7; i++) {
    const day = addDays(first, i)
    const p = dayProgress(medication, logs, day)
    let state = progressState(p)
    if (day > today) state = 'future'
    else if (day < start) state = 'before'
    cells.push({ day, state, taken: p.taken, total: p.total })
  }
  return cells
}
