import { useState, useMemo } from 'react'
import { readingScoreClass, definitionTag, readingDefinitionId, getFieldValue, formatFieldValue } from '../definitions'
import { formatTime, formatShortDate } from '../utils/format'

function ReadingValue({ reading, definition }) {
  const fields = definition.fields || []
  const parts = fields
    .map(field => ({ field, text: formatFieldValue(field, getFieldValue(reading, definition, field)) }))
    .filter(p => p.text !== null)

  if (parts.length === 0) return <>—</>

  return (
    <>
      {parts.map((p, i) => {
        const prev = parts[i - 1]
        const separator = i === 0 ? '' : prev.field.joinWithNext ? ` ${prev.field.joinWithNext} ` : ' · '
        const sameUnitAsNext = p.field.joinWithNext && parts[i + 1]?.field.unit === p.field.unit
        return (
          <span key={p.field.key}>
            {separator}
            {p.field.type === 'select'
              ? <span className="compact-meal">{p.text}</span>
              : <>{p.text}{p.field.unit && !sameUnitAsNext ? <> <span className="reading-unit">{p.field.unit}</span></> : null}</>}
          </span>
        )
      })}
    </>
  )
}

const READINGS_PAGE = 50

// Text a reading can be found by: its type, every field value and its notes.
function readingSearchText(reading, definition) {
  const values = (definition?.fields || []).map(f => formatFieldValue(f, getFieldValue(reading, definition, f)) ?? '')
  return [definition?.name, ...values, reading.notes].filter(Boolean).join(' ').toLowerCase()
}

export function ReadingsCard({ readings, definitionById, onDelete, onEdit, emptyMessage, table }) {
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [typeId, setTypeId] = useState('')

  // Reading types present, for the type filter on the all-readings table.
  const types = useMemo(() => {
    const ids = new Set(readings.map(readingDefinitionId))
    return [...ids].map(id => definitionById[id]).filter(Boolean)
  }, [readings, definitionById])

  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const fromTime = from ? new Date(`${from}T00:00`).getTime() : -Infinity
  const toTime = to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity
  const filtering = terms.length > 0 || from || to || typeId
  const matching = filtering
    ? readings.filter(r => {
      const t = new Date(r.timestamp).getTime()
      if (t < fromTime || t > toTime) return false
      const id = readingDefinitionId(r)
      if (typeId && id !== typeId) return false
      if (terms.length === 0) return true
      const text = readingSearchText(r, definitionById[id])
      return terms.every(term => text.includes(term))
    })
    : readings

  // Show a page at a time; the count resets when the filters change.
  const filterKey = `${query}|${from}|${to}|${typeId}`
  const [page, setPage] = useState({ key: filterKey, limit: READINGS_PAGE })
  const limit = page.key === filterKey ? page.limit : READINGS_PAGE
  const shown = matching.slice(0, limit)

  const clear = () => { setQuery(''); setFrom(''); setTo(''); setTypeId('') }

  return (
    <div className="readings-card">
      <div className="readings-header">
        <h3>Recent Readings</h3>
        <span className="readings-count">
          {filtering ? `${matching.length} of ${readings.length}` : readings.length} entries
        </span>
      </div>
      {readings.length > 0 && (
        <div className="readings-filters">
          <input
            type="search"
            className="readings-search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search values and notes"
            aria-label="Search readings"
          />
          {table && types.length > 1 && (
            <select value={typeId} onChange={e => setTypeId(e.target.value)} aria-label="Reading type">
              <option value="">All types</option>
              {types.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          <label className="date-filter">
            <span>From</span>
            <input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} />
          </label>
          <label className="date-filter">
            <span>To</span>
            <input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} />
          </label>
          {filtering && <button type="button" className="btn-chip" onClick={clear}>Clear</button>}
        </div>
      )}
      <div className={`readings-list ${table ? 'readings-list-table' : ''}`}>
        {readings.length === 0 ? (
          <div className="empty-state"><p>{emptyMessage}</p></div>
        ) : matching.length === 0 ? (
          <div className="empty-state"><p>No readings match these filters.</p></div>
        ) : (
          <>
            {table && <ReadingsTableHead />}
            {shown.map(r => (
              <ReadingItem
                key={r.id}
                reading={r}
                definition={definitionById[readingDefinitionId(r)]}
                onDelete={onDelete}
                onEdit={onEdit}
                table={table}
              />
            ))}
            {matching.length > limit && (
              <div className="readings-more">
                <button type="button" className="btn-chip" onClick={() => setPage({ key: filterKey, limit: limit + READINGS_PAGE })}>
                  Show more · {matching.length - limit} left
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ReadingsTableHead() {
  return (
    <div className="reading-item-compact reading-row-table reading-table-head">
      <span>Type</span>
      <span>Reading</span>
      <span className="reading-meta">
        <span>Notes</span>
        <span>When</span>
      </span>
      <span />
    </div>
  )
}

function ReadingItem({ reading, definition, onDelete, onEdit, table }) {
  const scoreClass = readingScoreClass(reading, definition)
  return (
    <div className={`reading-item-compact ${table ? 'reading-row-table' : ''}`}>
      <span
        className="compact-tag"
        style={definition?.color ? { background: `${definition.color}1f`, color: definition.color } : undefined}
        title={definition?.name}
      >
        {definitionTag(definition)}
      </span>
      <span className={`compact-value ${scoreClass}`}>
        {definition ? <ReadingValue reading={reading} definition={definition} /> : '—'}
      </span>
      <span className="reading-meta">
        {table
          ? <span className="compact-notes" title={reading.notes || undefined}>{reading.notes || ''}</span>
          : reading.notes && <span className="compact-notes" title={reading.notes}>{reading.notes}</span>}
        <span className="compact-date">{formatShortDate(reading.timestamp)} {formatTime(reading.timestamp)}</span>
      </span>
      <div className="reading-actions-compact">
        <button className="edit-btn" onClick={() => onEdit(reading)} aria-label="Edit reading">
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 2.5a2.12 2.12 0 0 1 3 3L6 17l-4 1 1-4Z" />
          </svg>
        </button>
        <button className="delete-btn" onClick={() => onDelete(reading.id)} aria-label="Delete reading">
          &times;
        </button>
      </div>
    </div>
  )
}

/* ---------- Stats & charts ---------- */
