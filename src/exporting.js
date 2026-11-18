// Readings as CSV, for spreadsheets or sharing with a doctor.
import { readingDefinitionId, getFieldValue, formatFieldValue } from './definitions'

const pad = (n) => String(n).padStart(2, '0')

/** Local date and time as 'YYYY-MM-DD' and 'HH:MM'. */
function localParts(iso) {
  const d = new Date(iso)
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

function csvCell(value) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const columnName = (field) => (field.unit ? `${field.label} (${field.unit})` : field.label)

/**
 * One row per reading, newest first: Type, Date, Time, a column per field
 * (fields with the same label and unit share a column), then Notes.
 */
export function readingsToCsv(readings, definitionById) {
  const columns = []
  const seen = new Set()
  readings.forEach(r => {
    const def = definitionById[readingDefinitionId(r)]
    ;(def?.fields || []).forEach(f => {
      const name = columnName(f)
      if (!seen.has(name)) {
        seen.add(name)
        columns.push(name)
      }
    })
  })

  const rows = [...readings]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .map(r => {
      const def = definitionById[readingDefinitionId(r)]
      const byColumn = {}
      ;(def?.fields || []).forEach(f => {
        byColumn[columnName(f)] = formatFieldValue(f, getFieldValue(r, def, f))
      })
      const { date, time } = localParts(r.timestamp)
      return [def?.name || 'Unknown', date, time, ...columns.map(c => byColumn[c]), r.notes || '']
    })

  return [['Type', 'Date', 'Time', ...columns, 'Notes'], ...rows]
    .map(row => row.map(csvCell).join(','))
    .join('\r\n')
}

/** Saves text as a file in the browser. */
export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob(['﻿', text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportFilename(name) {
  const { date } = localParts(new Date().toISOString())
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'readings'
  return `datanurse-${slug}-${date}.csv`
}
