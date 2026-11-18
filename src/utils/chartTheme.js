import { numericFields, getFieldValue } from '../definitions'

export const DEFINITION_COLORS = ['#f59e0b', '#38bdf8', '#a78bfa', '#2dd4bf', '#4ade80', '#facc15']
export const OVER_TARGET_COLOR = '#f87171'

export function fieldColor(definition, index) {
  if (index === 0) return definition.chartColor || definition.color || 'var(--accent)'
  return DEFINITION_COLORS[(index - 1) % DEFINITION_COLORS.length]
}

/* ---------- Shared field rendering ---------- */

export const chartTooltipStyle = {
  backgroundColor: 'rgba(14, 16, 22, 0.92)',
  border: '1px solid rgba(255, 255, 255, 0.13)',
  borderRadius: '12px',
  boxShadow: '0 24px 60px -18px rgba(0, 0, 0, 0.8)',
  backdropFilter: 'blur(12px)',
  fontSize: '12px',
  color: '#f4f5f8',
}
export const chartTooltipLabelStyle = { color: '#a6abb8', marginBottom: 4 }
export const chartTooltipItemStyle = { padding: '1px 0' }

// Windows offered by the average range picker on a definition's page.
// Infinity means all readings.
export function weekStart(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

// Charting more than this many days switches from daily to weekly bars.
export const WEEKLY_AFTER_DAYS = 45

// Average, low, high and share in target for one field over some readings.
export function collectDailyValues(byDay, definition, readings, prefix) {
  readings.forEach(r => {
    const day = new Date(r.timestamp).toDateString()
    if (!byDay[day]) byDay[day] = { timestamp: r.timestamp, values: {} }
    numericFields(definition).forEach(f => {
      const v = getFieldValue(r, definition, f)
      if (typeof v === 'number' && Number.isFinite(v)) {
        (byDay[day].values[prefix + f.key] ||= []).push(v)
      }
    })
  })
}

// The host definition as bars against a correlated one as a line, on twin axes
// so the two scales stay readable.
