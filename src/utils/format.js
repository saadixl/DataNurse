

export function formatTime(iso) {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function formatShortDate(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// 'YYYY-MM-DD' parsed as a local date; new Date(str) would read it as UTC.
export function formatDayKey(day) {
  const [y, m, d] = String(day).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function toLocalDatetime(date) {
  const d = new Date(date)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export function nowLocal() {
  return toLocalDatetime(new Date())
}

// Bars use the definition's own colour first, then a shared palette.
