import { useState, useEffect } from 'react'
import { buildReading, getFieldValue, isDefinitionComplete } from '../definitions'
import { toLocalDatetime, nowLocal } from '../utils/format'

function fieldLabel(field) {
  const hints = []
  if (field.unit) hints.push(field.unit)
  if (!field.required) hints.push('optional')
  return hints.length ? `${field.label} (${hints.join(', ')})` : field.label
}

function FieldInput({ field, value, onChange }) {
  if (field.type === 'select') {
    return (
      <select value={value ?? ''} onChange={e => onChange(e.target.value)}>
        {(field.options || []).map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    )
  }
  if (field.type === 'number') {
    return (
      <input
        type="number"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        min={field.min}
        max={field.max}
        step={field.step || 'any'}
        required={field.required}
      />
    )
  }
  return <input type="text" value={value ?? ''} onChange={e => onChange(e.target.value)} maxLength={100} required={field.required} />
}

// Lays fields out two per row.
function fieldRows(fields) {
  const rows = []
  for (let i = 0; i < fields.length; i += 2) rows.push(fields.slice(i, i + 2))
  return rows
}

function emptyValues(definition) {
  return Object.fromEntries((definition.fields || []).map(f => [
    f.key,
    f.type === 'select' ? (f.options?.[0]?.value ?? '') : '',
  ]))
}

function DefinitionFields({ definition, values, onChange }) {
  return fieldRows(definition.fields || []).map((row, i) => (
    <div className="form-row" key={i}>
      {row.map(f => (
        <div className="form-group" key={f.key}>
          <label>{fieldLabel(f)}</label>
          <FieldInput field={f} value={values[f.key]} onChange={v => onChange(f.key, v)} />
        </div>
      ))}
      {row.length === 1 && <div className="form-group" />}
    </div>
  ))
}

/* ---------- Recording a reading ---------- */

export function ReadingForm({ definition, onAdd }) {
  const [values, setValues] = useState(() => emptyValues(definition))
  const [datetime, setDatetime] = useState(nowLocal)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValues(emptyValues(definition))
    setDatetime(nowLocal())
    setNotes('')
  }, [definition])

  const canSubmit = isDefinitionComplete(definition, values) && !saving

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    await onAdd(buildReading(definition, values, notes.trim(), new Date(datetime).toISOString()))
    setValues(emptyValues(definition))
    setDatetime(nowLocal())
    setNotes('')
    setSaving(false)
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <div className="card-title">
        <span className="dot" style={{ background: definition.color || 'var(--accent)' }} />
        {definition.name}
      </div>
      <DefinitionFields
        definition={definition}
        values={values}
        onChange={(key, v) => setValues(prev => ({ ...prev, [key]: v }))}
      />
      <div className="form-row">
        <div className="form-group">
          <label>Date &amp; Time</label>
          <input type="datetime-local" value={datetime} onChange={e => setDatetime(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Notes (optional)</label>
          <input type="text" placeholder="e.g. after a walk" value={notes} onChange={e => setNotes(e.target.value)} maxLength={100} />
        </div>
      </div>
      <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
        {saving ? 'Saving...' : 'Save Reading'}
      </button>
    </form>
  )
}

// Add a reading of any type without opening its page first.
export function QuickAddModal({ definitions, onAdd, onClose }) {
  const [typeId, setTypeId] = useState(definitions[0]?.id)
  const definition = definitions.find(d => d.id === typeId) || definitions[0]

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content quick-add" onClick={e => e.stopPropagation()} role="dialog" aria-label="Add a reading">
        <div className="modal-header">
          <h3>Add a reading</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <div className="quick-add-types" role="radiogroup" aria-label="Reading type">
          {definitions.map(d => (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={d.id === definition?.id}
              className={`type-chip${d.id === definition?.id ? ' active' : ''}`}
              style={{ '--chip-color': d.color || 'var(--accent)' }}
              onClick={() => setTypeId(d.id)}
            >
              <span className="dot" style={{ background: d.color || 'var(--accent)' }} />
              {d.name}
            </button>
          ))}
        </div>
        {definition && (
          <ReadingForm
            key={definition.id}
            definition={definition}
            onAdd={async (reading) => {
              await onAdd(reading)
              onClose()
            }}
          />
        )}
      </div>
    </div>
  )
}

export function EditReadingModal({ reading, definition, onSave, onClose }) {
  const [values, setValues] = useState(() => Object.fromEntries(
    (definition?.fields || []).map(f => [f.key, getFieldValue(reading, definition, f) ?? ''])
  ))
  const [datetime, setDatetime] = useState(toLocalDatetime(reading.timestamp))
  const [notes, setNotes] = useState(reading.notes || '')
  const [saving, setSaving] = useState(false)

  if (!definition) return null

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    await onSave(reading.id, buildReading(definition, values, notes.trim(), new Date(datetime).toISOString()))
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit {definition.name} Reading</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <DefinitionFields
            definition={definition}
            values={values}
            onChange={(key, v) => setValues(prev => ({ ...prev, [key]: v }))}
          />
          <div className="form-row">
            <div className="form-group">
              <label>Date &amp; Time</label>
              <input type="datetime-local" value={datetime} onChange={e => setDatetime(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Notes (optional)</label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)} maxLength={100} />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !isDefinitionComplete(definition, values)}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ---------- Readings list ---------- */

// `joinWithNext` lets a definition keep a compact pairing such as "124 / 81".
