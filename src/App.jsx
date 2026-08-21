import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  loginWithGoogle, logout, onAuthChange, subscribeReadings, addReading, updateReading, deleteReading,
  seedSampleData, deleteAllData, subscribeDefinitions, addDefinition, updateDefinition, deleteDefinition,
  subscribeGlobalDefinitions, getSeededDefinitionIds, seedUserDefinitions,
  subscribeMedications, addMedication, updateMedication, deleteMedication,
  subscribeMedicationLogs, setMedicationDose, clearMedicationDose,
} from './firebase'
import {
  MAX_CUSTOM_FIELDS, FIELD_TYPES, TARGET_DIRECTIONS, DEFAULT_AVERAGE_DAYS,
  averageDays, targetFor, meetsTarget, readingScoreClass, buildReading, numericFields,
  toFieldKey, definitionTag, readingDefinitionId, getFieldValue, formatFieldValue, isDefinitionComplete,
} from './definitions'
import {
  MAX_MEDICATION_EXTRAS, FREQUENCIES, MEAL_TIMINGS, slotsFor, slotLabel, mealLabel, frequencyLabel,
  dayKey, logKey, todayProgress, progressState, medicationStats,
} from './medications'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine, Cell } from 'recharts'
import './App.css'

const DEFINITION_COLORS = ['#f59e0b', '#38bdf8', '#a78bfa', '#2dd4bf', '#4ade80', '#facc15']
const OVER_TARGET_COLOR = '#f87171'

function formatTime(iso) {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function formatShortDate(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// 'YYYY-MM-DD' parsed as a local date; new Date(str) would read it as UTC.
function formatDayKey(day) {
  const [y, m, d] = String(day).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function toLocalDatetime(date) {
  const d = new Date(date)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function nowLocal() {
  return toLocalDatetime(new Date())
}

// Bars use the definition's own colour first, then a shared palette.
function fieldColor(definition, index) {
  if (index === 0) return definition.chartColor || definition.color || 'var(--accent)'
  return DEFINITION_COLORS[(index - 1) % DEFINITION_COLORS.length]
}

/* ---------- Shared field rendering ---------- */

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

function ReadingForm({ definition, onAdd }) {
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

function EditReadingModal({ reading, definition, onSave, onClose }) {
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

function ReadingsCard({ readings, definitionById, onDelete, onEdit, emptyMessage, table }) {
  return (
    <div className="readings-card">
      <div className="readings-header">
        <h3>Recent Readings</h3>
        <span className="readings-count">{readings.length} entries</span>
      </div>
      <div className={`readings-list ${table ? 'readings-list-table' : ''}`}>
        {readings.length === 0 ? (
          <div className="empty-state"><p>{emptyMessage}</p></div>
        ) : (
          <>
            {table && <ReadingsTableHead />}
            {readings.map(r => (
              <ReadingItem
                key={r.id}
                reading={r}
                definition={definitionById[readingDefinitionId(r)]}
                onDelete={onDelete}
                onEdit={onEdit}
                table={table}
              />
            ))}
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

const chartTooltipStyle = {
  backgroundColor: '#f9fafb',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#111827',
}

function StatCards({ definitions, readingsByDefinition }) {
  const cards = useMemo(() => {
    const now = Date.now()
    return definitions.flatMap(definition =>
      numericFields(definition)
        .map(field => ({ definition, field, days: averageDays(field) }))
        .filter(c => c.days > 0)
        .map(({ field, days }) => {
          const cutoff = now - days * 86400000
          const values = (readingsByDefinition[definition.id] || [])
            .filter(r => new Date(r.timestamp).getTime() >= cutoff)
            .map(r => getFieldValue(r, definition, field))
            .filter(v => typeof v === 'number' && Number.isFinite(v))
          const avg = values.length ? +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : null
          const target = targetFor(field)
          return {
            id: `${definition.id}:${field.key}`,
            field,
            days,
            avg,
            count: values.length,
            target,
            missed: meetsTarget(avg, target) === false,
          }
        })
    )
  }, [definitions, readingsByDefinition])

  if (cards.length === 0) return null

  return (
    <div className="stat-cards">
      {cards.map(c => (
        <div className={`stat-card ${c.missed ? 'stat-over' : ''}`} key={c.id}>
          <div className="stat-label">Avg {c.field.label}</div>
          <div className="stat-value">
            {c.avg !== null ? <>{c.avg} {c.field.unit && <span className="stat-unit">{c.field.unit}</span>}</> : '—'}
          </div>
          <div className="stat-sub">{c.days}-day avg · {c.count} readings</div>
          {c.target && <div className="stat-target">Target: {c.target.symbol} {c.target.value}</div>}
        </div>
      ))}
    </div>
  )
}

function ReadingChart({ readings, definition }) {
  const numeric = numericFields(definition)

  const data = useMemo(() => {
    if (numeric.length === 0) return []
    const byDay = {}
    readings.forEach(r => {
      const day = new Date(r.timestamp).toDateString()
      if (!byDay[day]) byDay[day] = { timestamp: r.timestamp, values: {} }
      numeric.forEach(f => {
        const v = getFieldValue(r, definition, f)
        if (typeof v === 'number' && Number.isFinite(v)) {
          (byDay[day].values[f.key] ||= []).push(v)
        }
      })
    })
    return Object.values(byDay)
      .map(day => {
        const point = { date: formatShortDate(day.timestamp), sortKey: new Date(day.timestamp).getTime() }
        numeric.forEach(f => {
          const vals = day.values[f.key]
          point[f.key] = vals?.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null
        })
        return point
      })
      .sort((a, b) => a.sortKey - b.sortKey)
      .slice(-14)
  }, [readings, definition, numeric])

  // Pad around both the plotted values and any target lines, so a target well
  // outside the data range still shows up.
  const bounds = useMemo(() => {
    const values = []
    data.forEach(d => numeric.forEach(f => {
      if (typeof d[f.key] === 'number') values.push(d[f.key])
    }))
    numeric.forEach(f => {
      const target = targetFor(f)
      if (target) values.push(target.value)
    })
    if (values.length === 0) return [0, 'auto']
    const min = Math.min(...values)
    const max = Math.max(...values)
    const pad = Math.max((max - min) * 0.15, max * 0.05, 1)
    return [Math.max(0, Math.floor(min - pad)), Math.ceil(max + pad)]
  }, [data, numeric])

  if (numeric.length === 0) {
    return <div className="chart-empty">Add a number field to {definition.name} to see a chart.</div>
  }
  if (data.length === 0) {
    return <div className="chart-empty">No {definition.name.toLowerCase()} data to chart</div>
  }

  return (
    <div className="chart-card">
      <h3 className="chart-title">
        <span className="dot" style={{ background: definition.color || 'var(--accent)' }} />
        {definition.name} — Last 14 days
      </h3>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} barGap={2} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#2e3248" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#2e3248' }} tickLine={false} />
            <YAxis
              domain={bounds}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={38}
            />
            <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: 'rgba(99,102,241,0.08)' }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px', color: '#9ca3af' }} />
            {numeric.map((f, i) => {
              const target = targetFor(f)
              return (
                <Bar key={f.key} dataKey={f.key} name={f.label} radius={[4, 4, 0, 0]}>
                  {data.map((d, j) => (
                    <Cell
                      key={j}
                      fill={meetsTarget(d[f.key], target) === false ? OVER_TARGET_COLOR : fieldColor(definition, i)}
                    />
                  ))}
                </Bar>
              )
            })}
            {numeric.map(f => {
              const target = targetFor(f)
              if (!target) return null
              return (
                <ReferenceLine
                  key={`t-${f.key}`}
                  y={target.value}
                  stroke={OVER_TARGET_COLOR}
                  strokeDasharray="6 4"
                  strokeWidth={1.5}
                  label={{ value: `${f.label} ${target.symbol} ${target.value}`, fill: OVER_TARGET_COLOR, fontSize: 10, position: 'right' }}
                />
              )
            })}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ---------- Reading type builder ---------- */

const blankBuilderField = () => ({
  label: '', type: 'number', unit: '', options: '', required: true,
  avgEnabled: true, avgDays: String(DEFAULT_AVERAGE_DAYS),
  targetEnabled: false, target: '', targetDirection: 'max',
})

// Existing fields keep their storage key so saved readings keep resolving after
// a rename; only newly added fields get a freshly generated one.
function toBuilderField(field) {
  const target = targetFor(field)
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    unit: field.unit || '',
    options: (field.options || []).map(o => o.label).join(', '),
    required: !!field.required,
    avgEnabled: field.type === 'number' ? averageDays(field) > 0 : true,
    avgDays: String(averageDays(field) || DEFAULT_AVERAGE_DAYS),
    targetEnabled: !!target,
    target: target ? String(target.value) : (field.target ?? ''),
    targetDirection: field.targetDirection === 'min' ? 'min' : 'max',
  }
}

function DefinitionForm({ definition, definitions, onSubmit, onCancel }) {
  const editing = !!definition
  const [name, setName] = useState(definition?.name || '')
  const [fields, setFields] = useState(() => (
    editing && definition.fields?.length ? definition.fields.map(toBuilderField) : [blankBuilderField()]
  ))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function updateField(index, patch) {
    setFields(prev => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)))
    setError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (saving) return
    const trimmedName = name.trim()
    if (!trimmedName) return setError('Give your reading type a name.')
    const clash = definitions.some(d => d.id !== definition?.id && d.name.toLowerCase() === trimmedName.toLowerCase())
    if (clash) return setError('You already have a reading type with that name.')
    const filled = fields.filter(f => f.label.trim())
    if (filled.length === 0) return setError('Add at least one field to record.')

    const taken = filled.filter(f => f.key).map(f => f.key)
    const built = []
    for (let i = 0; i < filled.length; i++) {
      const f = filled[i]
      let key = f.key
      if (!key) {
        key = toFieldKey(f.label, taken, i)
        taken.push(key)
      }
      const field = { key, label: f.label.trim(), type: f.type, required: !!f.required }
      if (f.type === 'number') {
        if (f.unit.trim()) field.unit = f.unit.trim()
        if (f.joinWithNext) field.joinWithNext = f.joinWithNext

        const days = Math.round(Number(f.avgDays))
        if (f.avgEnabled && !(Number.isFinite(days) && days > 0)) {
          return setError(`Enter how many days "${f.label.trim()}" should average over.`)
        }
        field.avgEnabled = !!f.avgEnabled
        field.avgDays = f.avgEnabled ? Math.min(days, 365) : DEFAULT_AVERAGE_DAYS

        const target = Number(f.target)
        if (f.targetEnabled && !Number.isFinite(target)) {
          return setError(`Enter a target value for "${f.label.trim()}".`)
        }
        field.targetEnabled = !!f.targetEnabled
        field.target = f.targetEnabled ? target : null
        field.targetDirection = f.targetDirection === 'min' ? 'min' : 'max'
      }
      if (f.type === 'select') {
        const optionTaken = []
        const options = f.options.split(',').map(o => o.trim()).filter(Boolean).map((o, oi) => {
          const value = toFieldKey(o, optionTaken, oi)
          optionTaken.push(value)
          return { value, label: o }
        })
        if (options.length === 0) return setError(`Add comma-separated choices for "${f.label.trim()}".`)
        field.options = options
      }
      built.push(field)
    }

    setSaving(true)
    setError(null)
    await onSubmit({ name: trimmedName, fields: built })
    setSaving(false)
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <div className="card-title">{editing ? `Edit ${definition.name}` : 'New Reading Type'}</div>
      <div className="form-row">
        <div className="form-group full-width">
          <label>Name</label>
          <input type="text" placeholder="e.g. Body Weight" value={name} onChange={e => { setName(e.target.value); setError(null) }} maxLength={40} />
        </div>
      </div>
      <div className="builder-defaults">
        Every reading includes
        <span className="builder-chip">Name</span>
        <span className="builder-chip">Date &amp; Time</span>
        <span className="builder-chip">Notes</span>
      </div>

      {fields.map((f, i) => (
        <div className="builder-field" key={i}>
          <div className="form-row">
            <div className="form-group">
              <label>Field {i + 1} label</label>
              <input type="text" placeholder="e.g. Weight" value={f.label} onChange={e => updateField(i, { label: e.target.value })} maxLength={30} />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select value={f.type} onChange={e => updateField(i, { type: e.target.value })}>
                {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            {f.type === 'select' ? (
              <div className="form-group">
                <label>Choices (comma separated)</label>
                <input type="text" placeholder="e.g. Low, Medium, High" value={f.options} onChange={e => updateField(i, { options: e.target.value })} />
              </div>
            ) : (
              <div className="form-group">
                <label>Unit (optional)</label>
                <input type="text" placeholder="e.g. kg" value={f.unit} onChange={e => updateField(i, { unit: e.target.value })} maxLength={12} disabled={f.type !== 'number'} />
              </div>
            )}
            {f.type === 'number' ? (
              <div className="form-group">
                <label>Average card</label>
                <div className="inline-control">
                  <label className="checkbox-label">
                    <input type="checkbox" checked={f.avgEnabled} onChange={e => updateField(i, { avgEnabled: e.target.checked })} />
                    Show
                  </label>
                  <input
                    type="number" className="control-num" min="1" max="365"
                    placeholder={String(DEFAULT_AVERAGE_DAYS)} value={f.avgDays}
                    onChange={e => updateField(i, { avgDays: e.target.value })}
                    disabled={!f.avgEnabled}
                  />
                  <span className="control-suffix">day avg</span>
                </div>
              </div>
            ) : <div className="form-group" />}
          </div>
          {f.type === 'number' && (
            <div className="form-row">
              <div className="form-group full-width">
                <label>Target</label>
                <div className="inline-control">
                  <label className="checkbox-label">
                    <input type="checkbox" checked={f.targetEnabled} onChange={e => updateField(i, { targetEnabled: e.target.checked })} />
                    Set
                  </label>
                  <select className="control-select" value={f.targetDirection} onChange={e => updateField(i, { targetDirection: e.target.value })} disabled={!f.targetEnabled}>
                    {TARGET_DIRECTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                  <input
                    type="number" className="control-num" step="any"
                    placeholder="120" value={f.target}
                    onChange={e => updateField(i, { target: e.target.value })}
                    disabled={!f.targetEnabled}
                  />
                  <span className="control-suffix">{f.unit || 'value'}</span>
                </div>
              </div>
            </div>
          )}
          <div className="builder-field-actions">
            <label className="checkbox-label">
              <input type="checkbox" checked={f.required} onChange={e => updateField(i, { required: e.target.checked })} />
              Required
            </label>
            {fields.length > 1 && (
              <button type="button" className="btn-cancel btn-tiny" onClick={() => setFields(prev => prev.filter((_, x) => x !== i))}>Remove</button>
            )}
          </div>
        </div>
      ))}

      {fields.length < MAX_CUSTOM_FIELDS && (
        <button type="button" className="btn-add-field" onClick={() => setFields(prev => [...prev, blankBuilderField()])}>
          + Add field ({fields.length}/{MAX_CUSTOM_FIELDS})
        </button>
      )}

      {editing && (
        <p className="builder-hint">Removing a field hides it from new and existing readings. Renaming one keeps its saved values.</p>
      )}
      {error && <p className="error-text">{error}</p>}

      <div className="modal-actions">
        <button type="button" className="btn-cancel" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Reading Type'}
        </button>
      </div>
    </form>
  )
}

// Settings sub-tab: list the user's reading types, toggle them on or off, and
// add or edit one in place.
function ReadingTypesSettings({ definitions, counts, onCreate, onUpdate, onDelete, onToggle, openAddAt }) {
  const [mode, setMode] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)

  // Bumped by the navbar's create button; a counter rather than a flag so the
  // form reopens even when this page is already showing.
  useEffect(() => {
    if (openAddAt) setMode('add')
  }, [openAddAt])

  const editing = definitions.find(d => d.id === mode)
  const formOpen = mode === 'add' || !!editing

  async function handleSubmit(payload) {
    if (editing) {
      await onUpdate(editing, payload)
    } else {
      await onCreate(payload)
    }
    setMode(null)
  }

  return (
    <div className="settings-page">
      <p className="settings-desc">
        Every reading records a name, date &amp; time and notes — add up to {MAX_CUSTOM_FIELDS} fields of your own on top,
        each with its own average window and target. Switch a type off to hide it everywhere without losing its readings.
      </p>

      {formOpen ? (
        <DefinitionForm
          definition={editing}
          definitions={definitions}
          onSubmit={handleSubmit}
          onCancel={() => setMode(null)}
        />
      ) : (
        <>
          {definitions.length === 0 ? (
            <div className="card">
              <p className="builder-hint">No reading types yet. Add one to start tracking anything you like.</p>
            </div>
          ) : (
            <div className="card">
              <div className="definition-list">
                {definitions.map(d => (
                  <div className={`definition-row ${d.enabled ? '' : 'definition-off'}`} key={d.id}>
                    <label className="toggle" title={d.enabled ? 'Hide from the app' : 'Show in the app'}>
                      <input type="checkbox" checked={d.enabled} onChange={e => onToggle(d, e.target.checked)} />
                      <span className="toggle-slider" />
                    </label>
                    <span className="dot" style={{ background: d.color || 'var(--accent)' }} />
                    <span className="definition-name">{d.name}</span>
                    <span className="definition-fields">{(d.fields || []).map(f => f.label).join(' · ')}</span>
                    {pendingDelete === d.id ? (
                      <span className="confirm-group">
                        <button className="btn-danger btn-tiny" onClick={() => { onDelete(d); setPendingDelete(null) }}>
                          Delete{counts[d.id] ? ` (${counts[d.id]})` : ''}
                        </button>
                        <button className="btn-cancel btn-tiny" onClick={() => setPendingDelete(null)}>Cancel</button>
                      </span>
                    ) : (
                      <span className="definition-actions">
                        <button className="btn-cancel btn-tiny" onClick={() => setMode(d.id)}>Edit</button>
                        <button className="delete-btn" onClick={() => setPendingDelete(d.id)} aria-label={`Delete ${d.name}`}>&times;</button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {pendingDelete && (
                <p className="builder-hint delete-warning">
                  Deleting a reading type also removes every reading saved under it. To hide one without losing data, switch it off instead.
                </p>
              )}
            </div>
          )}

          <button className="btn btn-primary" onClick={() => setMode('add')}>+ Add Reading Type</button>
        </>
      )}
    </div>
  )
}

/* ---------- Medications ---------- */

const blankExtra = () => ({ label: '', value: '' })

function MedicationForm({ medication, medications, onSubmit, onCancel }) {
  const editing = !!medication
  const [name, setName] = useState(medication?.name || '')
  const [genericName, setGenericName] = useState(medication?.genericName || '')
  const [dose, setDose] = useState(medication?.dose || '')
  const [frequency, setFrequency] = useState(String(medication?.frequency || 1))
  const [timing, setTiming] = useState(medication?.timing || 'after_meal')
  const [startedAt, setStartedAt] = useState(
    medication?.startedAt ? toLocalDatetime(medication.startedAt) : nowLocal
  )
  const [notes, setNotes] = useState(medication?.notes || '')
  const [extras, setExtras] = useState(() => (
    medication?.extras?.length ? medication.extras.map(e => ({ ...e })) : [blankExtra()]
  ))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function updateExtra(index, patch) {
    setExtras(prev => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)))
    setError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (saving) return
    const trimmed = name.trim()
    if (!trimmed) return setError('Give the medication a name.')
    if (medications.some(m => m.id !== medication?.id && m.name.toLowerCase() === trimmed.toLowerCase())) {
      return setError('You already have a medication with that name.')
    }
    setSaving(true)
    setError(null)
    await onSubmit({
      name: trimmed,
      genericName: genericName.trim(),
      dose: dose.trim(),
      frequency: Number(frequency),
      timing,
      startedAt: new Date(startedAt).toISOString(),
      notes: notes.trim(),
      extras: extras.filter(x => x.label.trim()).map(x => ({ label: x.label.trim(), value: x.value.trim() })),
    })
    setSaving(false)
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <div className="card-title">{editing ? `Edit ${medication.name}` : 'New Medication'}</div>
      <div className="form-row">
        <div className="form-group">
          <label>Name</label>
          <input type="text" placeholder="e.g. Metformin" value={name} onChange={e => { setName(e.target.value); setError(null) }} maxLength={60} />
        </div>
        <div className="form-group">
          <label>Generic name (optional)</label>
          <input type="text" placeholder="e.g. Metformin HCl" value={genericName} onChange={e => setGenericName(e.target.value)} maxLength={60} />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Dose</label>
          <input type="text" placeholder="e.g. 500 mg" value={dose} onChange={e => setDose(e.target.value)} maxLength={40} />
        </div>
        <div className="form-group">
          <label>Frequency</label>
          <select value={frequency} onChange={e => setFrequency(e.target.value)}>
            {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>When</label>
          <select value={timing} onChange={e => setTiming(e.target.value)}>
            {MEAL_TIMINGS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Started (date &amp; time)</label>
          <input type="datetime-local" value={startedAt} onChange={e => setStartedAt(e.target.value)} />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group full-width">
          <label>Notes (optional)</label>
          <input type="text" placeholder="e.g. skip on fasting days" value={notes} onChange={e => setNotes(e.target.value)} maxLength={140} />
        </div>
      </div>

      <div className="builder-defaults">Extra details you want to keep with this medication</div>
      {extras.map((x, i) => (
        <div className="builder-field" key={i}>
          <div className="form-row">
            <div className="form-group">
              <label>Field {i + 1} label</label>
              <input type="text" placeholder="e.g. Prescribed by" value={x.label} onChange={e => updateExtra(i, { label: e.target.value })} maxLength={30} />
            </div>
            <div className="form-group">
              <label>Value</label>
              <input type="text" placeholder="e.g. Dr Rahman" value={x.value} onChange={e => updateExtra(i, { value: e.target.value })} maxLength={80} />
            </div>
          </div>
          {extras.length > 1 && (
            <div className="builder-field-actions">
              <span />
              <button type="button" className="btn-cancel btn-tiny" onClick={() => setExtras(prev => prev.filter((_, y) => y !== i))}>Remove</button>
            </div>
          )}
        </div>
      ))}
      {extras.length < MAX_MEDICATION_EXTRAS && (
        <button type="button" className="btn-add-field" onClick={() => setExtras(prev => [...prev, blankExtra()])}>
          + Add field ({extras.length}/{MAX_MEDICATION_EXTRAS})
        </button>
      )}

      {error && <p className="error-text">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="btn-cancel" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Medication'}
        </button>
      </div>
    </form>
  )
}

function MedicationsSettings({ medications, onCreate, onUpdate, onDelete, onToggle, openAddAt }) {
  const [mode, setMode] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)

  useEffect(() => {
    if (openAddAt) setMode('add')
  }, [openAddAt])

  const editing = medications.find(m => m.id === mode)
  const formOpen = mode === 'add' || !!editing

  async function handleSubmit(payload) {
    if (editing) {
      await onUpdate(editing, payload)
    } else {
      await onCreate(payload)
    }
    setMode(null)
  }

  return (
    <div className="settings-page">
      <p className="settings-desc">
        Medications you add here get their own page in the sidebar, where you can tick off each day&apos;s doses.
        Switch one off to hide it without losing its history.
      </p>

      {formOpen ? (
        <MedicationForm
          medication={editing}
          medications={medications}
          onSubmit={handleSubmit}
          onCancel={() => setMode(null)}
        />
      ) : (
        <>
          {medications.length === 0 ? (
            <div className="card">
              <p className="builder-hint">No medications yet. Add one to start tracking your doses.</p>
            </div>
          ) : (
            <div className="card">
              <div className="definition-list">
                {medications.map(m => (
                  <div className={`definition-row ${m.enabled ? '' : 'definition-off'}`} key={m.id}>
                    <label className="toggle" title={m.enabled ? 'Hide from the app' : 'Show in the app'}>
                      <input type="checkbox" checked={m.enabled} onChange={e => onToggle(m, e.target.checked)} />
                      <span className="toggle-slider" />
                    </label>
                    <span className="dot" style={{ background: 'var(--accent-hover)' }} />
                    <span className="definition-name">{m.name}</span>
                    <span className="definition-fields">
                      {[m.dose, frequencyLabel(m.frequency), mealLabel(m.timing)].filter(Boolean).join(' · ')}
                    </span>
                    {pendingDelete === m.id ? (
                      <span className="confirm-group">
                        <button className="btn-danger btn-tiny" onClick={() => { onDelete(m); setPendingDelete(null) }}>Delete</button>
                        <button className="btn-cancel btn-tiny" onClick={() => setPendingDelete(null)}>Cancel</button>
                      </span>
                    ) : (
                      <span className="definition-actions">
                        <button className="btn-cancel btn-tiny" onClick={() => setMode(m.id)}>Edit</button>
                        <button className="delete-btn" onClick={() => setPendingDelete(m.id)} aria-label={`Delete ${m.name}`}>&times;</button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {pendingDelete && (
                <p className="builder-hint delete-warning">
                  Deleting a medication also removes its dose history. To keep the history, switch it off instead.
                </p>
              )}
            </div>
          )}
          <button className="btn btn-primary" onClick={() => setMode('add')}>+ Add Medication</button>
        </>
      )}
    </div>
  )
}

function MedicationPage({ medication, logs, onToggleDose }) {
  const day = dayKey()
  const slots = slotsFor(medication.frequency)
  const stats = medicationStats(medication.id, logs)

  const history = useMemo(() => Object.entries(logs)
    .filter(([, log]) => log.medicationId === medication.id)
    .map(([key, log]) => ({ key, ...log }))
    .sort((a, b) => String(b.takenAt).localeCompare(String(a.takenAt))), [logs, medication.id])

  const detail = [medication.genericName, medication.dose, frequencyLabel(medication.frequency), mealLabel(medication.timing)]
    .filter(Boolean).join(' · ')

  return (
    <>
      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-label">Days taking this</div>
          <div className="stat-value">{stats.days}</div>
          <div className="stat-sub">days with at least one dose</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Doses taken</div>
          <div className="stat-value">{stats.doses}</div>
          <div className="stat-sub">all time</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <span className="dot" style={{ background: 'var(--accent-hover)' }} />
          Have you taken today&apos;s {medication.name}?
        </div>
        {detail && <p className="builder-hint med-detail">{detail}</p>}
        <div className="dose-buttons">
          {slots.map(slot => {
            const log = logs[logKey(medication.id, day, slot.key)]
            return (
              <button
                key={slot.key}
                type="button"
                className={`dose-btn ${log ? 'dose-taken' : ''}`}
                onClick={() => onToggleDose(medication, day, slot.key, !!log)}
              >
                <span className="dose-check">{log ? '✓' : '+'}</span>
                <span className="dose-name">{slot.label}</span>
                <span className="dose-time">{log ? `Taken ${formatTime(log.takenAt)}` : 'Not taken'}</span>
              </button>
            )
          })}
        </div>
        {medication.notes && <p className="builder-hint">{medication.notes}</p>}
        {medication.extras?.length > 0 && (
          <div className="med-extras">
            {medication.extras.map(x => (
              <span className="med-extra" key={x.label}>
                <span className="med-extra-label">{x.label}</span> {x.value}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="readings-card">
        <div className="readings-header">
          <h3>Dose history</h3>
          <span className="readings-count">{history.length} doses</span>
        </div>
        <div className="readings-list">
          {history.length === 0 ? (
            <div className="empty-state"><p>No doses logged yet. Tick one above once you take it.</p></div>
          ) : (
            <>
              <div className="dose-history-row dose-history-head">
                <span>Slot</span>
                <span>Day</span>
                <span>Taken at</span>
                <span />
              </div>
              {history.map(entry => (
                <div className="dose-history-row" key={entry.key}>
                  <span className="compact-tag tag-dose">{slotLabel(entry.slot)}</span>
                  <span className="dose-day">{formatDayKey(entry.day)}</span>
                  <span className="compact-date">{formatTime(entry.takenAt)}</span>
                  <button
                    className="delete-btn"
                    onClick={() => onToggleDose(medication, entry.day, entry.slot, true)}
                    aria-label="Remove dose"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  )
}

// Home summary: one card per medication showing how today is going.
function MedicationHomeCards({ medications, logs, onOpen }) {
  const day = dayKey()
  if (medications.length === 0) return null

  return (
    <div className="med-cards">
      {medications.map(m => {
        const progress = todayProgress(m, logs, day)
        const state = progressState(progress)
        return (
          <button key={m.id} type="button" className={`med-card med-${state}`} onClick={() => onOpen(m)}>
            <div className="med-card-top">
              <span className="med-card-name">{m.name}</span>
              <span className="med-card-pill">{progress.taken}/{progress.total}</span>
            </div>
            <div className="med-card-dose">{[m.dose, frequencyLabel(m.frequency)].filter(Boolean).join(' · ')}</div>
            <div className="med-card-status">
              {state === 'complete'
                ? 'All doses taken today'
                : state === 'none'
                  ? 'No doses taken today'
                  : `${progress.total - progress.taken} dose${progress.total - progress.taken === 1 ? '' : 's'} still due`}
            </div>
          </button>
        )
      })}
    </div>
  )
}

/* ---------- Settings ---------- */

function DataSettings({ onDeleteData, onSeedData }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleting(true)
    await onDeleteData()
    setDeleting(false)
    setConfirmDelete(false)
  }

  return (
    <div className="settings-page">
            <h2 className="settings-title">Data</h2>
            <p className="settings-desc">Manage your health readings and sample data.</p>

            <div className="card">
              <div className="danger-action">
                <div>
                  <div className="danger-label">Load sample data</div>
                  <div className="danger-desc">Generate 1 month of sample blood pressure and glucose readings.</div>
                </div>
                <button className="btn-danger-outline btn-neutral-outline" onClick={onSeedData}>Load Sample Data</button>
              </div>
            </div>
            <div className="card">
              <div className="danger-action">
                <div>
                  <div className="danger-label">Delete all readings</div>
                  <div className="danger-desc">Remove every reading. Your reading types are kept. This cannot be undone.</div>
                </div>
                {confirmDelete ? (
                  <div className="confirm-group">
                    <button className="btn-danger" onClick={handleDelete} disabled={deleting}>
                      {deleting ? 'Deleting...' : 'Confirm Delete'}
                    </button>
                    <button className="btn-cancel" onClick={() => setConfirmDelete(false)}>Cancel</button>
                  </div>
                ) : (
                  <button className="btn-danger-outline" onClick={handleDelete}>Delete Data</button>
                )}
              </div>
            </div>
    </div>
  )
}

function AccountSettings({ user, onLogout }) {
  return (
    <div className="settings-page">
            <h2 className="settings-title">Account</h2>
            <p className="settings-desc">Manage your account and sign-in details.</p>

            <div className="card">
              <div className="account-info">
                <img src={user.photoURL} alt="" className="account-avatar" referrerPolicy="no-referrer" />
                <div className="account-details">
                  <div className="account-name">{user.displayName}</div>
                  <div className="account-email">{user.email}</div>
                  <div className="account-provider">
                    <svg viewBox="0 0 24 24" width="14" height="14">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Signed in with Google
                  </div>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="danger-action">
                <div>
                  <div className="danger-label">Sign out</div>
                  <div className="danger-desc">Sign out of your account on this device.</div>
                </div>
                <button className="btn-danger-outline" onClick={onLogout}>Sign Out</button>
              </div>
            </div>
    </div>
  )
}

/* ---------- Chrome ---------- */

function LoginScreen() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleLogin() {
    setLoading(true)
    setError(null)
    try {
      await loginWithGoogle()
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError('Sign-in failed. Please try again.')
      }
    }
    setLoading(false)
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <svg width="56" height="56" viewBox="0 0 28 28" fill="none" className="login-logo">
          <rect width="28" height="28" rx="8" fill="#6366f1"/>
          <rect x="11.5" y="5" width="5" height="18" rx="1" fill="white" fillOpacity="0.9"/>
          <rect x="5" y="11.5" width="18" height="5" rx="1" fill="white" fillOpacity="0.9"/>
          <polyline points="7,18 11,14 14.5,17 17.5,10 21,13" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <h1>DataNurse</h1>
        <p>Health Monitoring System</p>
        <button className="btn btn-google" onClick={handleLogin} disabled={loading}>
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {loading ? 'Signing in...' : 'Sign in with Google'}
        </button>
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  )
}

function SkeletonReadings() {
  return (
    <div className="readings-card">
      <div className="readings-header">
        <div className="skeleton skeleton-text" style={{ width: 120 }} />
        <div className="skeleton skeleton-text" style={{ width: 60 }} />
      </div>
      <div className="readings-list">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="reading-item">
            <div className="reading-row">
              <div className="reading-content">
                <div className="reading-values">
                  <div className="skeleton skeleton-text" style={{ width: 100, height: 20 }} />
                  <div className="skeleton skeleton-text" style={{ width: 60, height: 12, marginTop: 4 }} />
                </div>
                <div className="reading-meta">
                  <div className="skeleton skeleton-text" style={{ width: 70, height: 12 }} />
                  <div className="skeleton skeleton-text" style={{ width: 40, height: 12 }} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SkeletonStatCards() {
  return (
    <div className="stat-cards">
      {[1, 2, 3].map(i => (
        <div key={i} className="stat-card">
          <div className="skeleton skeleton-text" style={{ width: 80, height: 11, marginBottom: 8 }} />
          <div className="skeleton skeleton-text" style={{ width: 60, height: 26, marginBottom: 8 }} />
          <div className="skeleton skeleton-text" style={{ width: 100, height: 11 }} />
        </div>
      ))}
    </div>
  )
}

function SkeletonChart() {
  return (
    <div className="chart-card">
      <div className="skeleton skeleton-text" style={{ width: 180, height: 14, marginBottom: 16 }} />
      <div className="skeleton skeleton-chart" />
    </div>
  )
}

function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5h14" />
      <path d="M3 10h9" />
      <path d="M3 15h6" />
      <path d="M15.5 11.5v5" />
      <path d="M13 14h5" />
    </svg>
  )
}

function DataIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="10" cy="5" rx="7" ry="3" />
      <path d="M3 5v5c0 1.66 3.13 3 7 3s7-1.34 7-3V5" />
      <path d="M3 10v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5" />
    </svg>
  )
}

function AccountIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="7" r="4" />
      <path d="M3 18c0-3.31 3.13-6 7-6s7 2.69 7 6" />
    </svg>
  )
}

function PillIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="6.5" width="17" height="7" rx="3.5" transform="rotate(-45 10 10)" />
      <path d="M7.5 7.5l5 5" />
    </svg>
  )
}

function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8.5 10 3l7 5.5V16a1 1 0 0 1-1 1h-3v-5H7v5H4a1 1 0 0 1-1-1z" />
    </svg>
  )
}

const SETTINGS_PAGES = [
  { id: 'settings:readings', label: 'Readings settings', Icon: ListIcon },
  { id: 'settings:medications', label: 'Medications settings', Icon: PillIcon },
  { id: 'settings:data', label: 'Data', Icon: DataIcon },
  { id: 'settings:account', label: 'Account', Icon: AccountIcon },
]

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <path d="M3 5h14M3 10h14M3 15h14" />
    </svg>
  )
}

function Toast({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type || 'success'}`}>
          {t.message}
        </div>
      ))}
    </div>
  )
}

function useToast() {
  const [toasts, setToasts] = useState([])
  const show = useCallback((message, type = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }, [])
  return { toasts, show }
}

function Sidebar({ definitions, medications, medicationLogs, page, onSelect, counts, total, open, onClose }) {
  const day = dayKey()
  return (
    <>
    {open && <div className="sidebar-backdrop" onClick={onClose} />}
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <button className="sidebar-close" onClick={onClose} aria-label="Close navigation">&times;</button>
      <div className="sidebar-section">
        <button className={`sidebar-item ${page === 'all' ? 'active' : ''}`} onClick={() => onSelect('all')}>
          <HomeIcon />
          <span className="sidebar-item-name">Home</span>
          <span className="sidebar-count">{total}</span>
        </button>
      </div>

      {definitions.length > 0 && (
        <div className="sidebar-section">
          <div className="sidebar-label">Readings</div>
          {definitions.map(d => (
            <button key={d.id} className={`sidebar-item ${page === d.id ? 'active' : ''}`} onClick={() => onSelect(d.id)}>
              <span className="dot sidebar-dot" style={{ background: d.color || 'var(--accent)' }} />
              <span className="sidebar-item-name">{d.name}</span>
              <span className="sidebar-count">{counts[d.id] || 0}</span>
            </button>
          ))}
        </div>
      )}

      {medications.length > 0 && (
        <div className="sidebar-section">
          <div className="sidebar-label">Medications</div>
          {medications.map(m => {
            const progress = todayProgress(m, medicationLogs, day)
            return (
              <button
                key={m.id}
                className={`sidebar-item ${page === `med:${m.id}` ? 'active' : ''}`}
                onClick={() => onSelect(`med:${m.id}`)}
              >
                <span className="dot sidebar-dot" style={{ background: 'var(--accent-hover)' }} />
                <span className="sidebar-item-name">{m.name}</span>
                <span className={`sidebar-count count-${progressState(progress)}`}>
                  {progress.taken}/{progress.total}
                </span>
              </button>
            )
          })}
        </div>
      )}
      <div className="sidebar-section sidebar-footer">
        {SETTINGS_PAGES.map(({ id, label, Icon }) => (
          <button key={id} className={`sidebar-item ${page === id ? 'active' : ''}`} onClick={() => onSelect(id)}>
            <Icon />
            <span className="sidebar-item-name">{label}</span>
          </button>
        ))}
      </div>
    </aside>
    </>
  )
}

/* ---------- App ---------- */

function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [page, setPage] = useState('all')
  const [readings, setReadings] = useState([])
  const [definitions, setDefinitions] = useState([])
  const [globalDefinitions, setGlobalDefinitions] = useState([])
  const [medications, setMedications] = useState([])
  const [medicationLogs, setMedicationLogs] = useState({})
  const [definitionsLoaded, setDefinitionsLoaded] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)
  const [editingReading, setEditingReading] = useState(null)
  const [formCollapsed, setFormCollapsed] = useState(false)
  const { toasts, show: showToast } = useToast()
  const [newTypeRequest, setNewTypeRequest] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const seedingRef = useRef(false)

  useEffect(() => {
    return onAuthChange(u => {
      setUser(u)
      setAuthLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!user) {
      setReadings([])
      setDefinitions([])
      setMedications([])
      setMedicationLogs({})
      setDefinitionsLoaded(false)
      setDataLoading(false)
      return
    }
    setDataLoading(true)
    seedingRef.current = false
    const loaded = { readings: false, definitions: false }
    const settle = key => {
      loaded[key] = true
      if (loaded.readings && loaded.definitions) setDataLoading(false)
    }
    const unsub1 = subscribeReadings(user.uid, r => { setReadings(r); settle('readings') })
    const unsub2 = subscribeDefinitions(user.uid, d => {
      setDefinitions(d)
      setDefinitionsLoaded(true)
      settle('definitions')
    })
    const unsub3 = subscribeGlobalDefinitions(setGlobalDefinitions)
    const unsub4 = subscribeMedications(user.uid, setMedications)
    const unsub5 = subscribeMedicationLogs(user.uid, setMedicationLogs)
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5() }
  }, [user])

  // Copy any global definition the user has never been given. Ids already
  // seeded are remembered, so deleting a copy does not resurrect it.
  useEffect(() => {
    if (!user || !definitionsLoaded || globalDefinitions.length === 0 || seedingRef.current) return
    seedingRef.current = true
    let cancelled = false
    ;(async () => {
      try {
        const seededIds = await getSeededDefinitionIds(user.uid)
        if (cancelled) return
        const ownIds = definitions.map(d => d.id)
        const missing = globalDefinitions.filter(d => !ownIds.includes(d.id) && !seededIds.includes(d.id))
        if (missing.length === 0) return
        await seedUserDefinitions(user.uid, missing)
        showToast(missing.length === 1
          ? `${missing[0].name} added to your reading types`
          : `${missing.length} reading types added`)
      } catch {
        seedingRef.current = false
      }
    })()
    return () => { cancelled = true }
  }, [user, definitionsLoaded, globalDefinitions, definitions, showToast])

  const enabledDefinitions = useMemo(() => definitions.filter(d => d.enabled), [definitions])
  const enabledMedications = useMemo(() => medications.filter(m => m.enabled), [medications])

  const definitionById = useMemo(
    () => Object.fromEntries(definitions.map(d => [d.id, d])),
    [definitions]
  )

  const counts = useMemo(() => {
    const c = {}
    readings.forEach(r => {
      const id = readingDefinitionId(r)
      c[id] = (c[id] || 0) + 1
    })
    return c
  }, [readings])

  // Readings of a switched-off type disappear from the app entirely.
  const visibleReadings = useMemo(() => {
    const ids = new Set(enabledDefinitions.map(d => d.id))
    return readings.filter(r => ids.has(readingDefinitionId(r)))
  }, [readings, enabledDefinitions])

  const definitionsWithReadings = useMemo(
    () => enabledDefinitions.filter(d => readings.some(r => readingDefinitionId(r) === d.id)),
    [enabledDefinitions, readings]
  )

  const readingsByDefinition = useMemo(() => {
    const grouped = {}
    visibleReadings.forEach(r => {
      (grouped[readingDefinitionId(r)] ||= []).push(r)
    })
    return grouped
  }, [visibleReadings])

  // A dashboard whose type was deleted or switched off falls back to All.
  useEffect(() => {
    if (page === 'all' || page.startsWith('settings:') || dataLoading) return
    if (page.startsWith('med:')) {
      const id = page.slice('med:'.length)
      if (!medications.find(m => m.id === id)?.enabled) setPage('all')
      return
    }
    if (!definitionById[page]?.enabled) setPage('all')
  }, [page, definitionById, medications, dataLoading])

  // Close the mobile drawer on Escape, and stop the page scrolling behind it.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = e => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  function handleSelectPage(next) {
    setPage(next)
    setMenuOpen(false)
  }

  function handleCreateNewReadingType() {
    setPage('settings:readings')
    setNewTypeRequest(n => n + 1)
    setMenuOpen(false)
  }

  async function handleAddReading(reading) {
    await addReading(user.uid, reading)
    const def = definitionById[readingDefinitionId(reading)]
    showToast(`${def ? def.name : 'Reading'} added`)
  }

  async function handleUpdateReading(id, data) {
    await updateReading(user.uid, id, data)
    setEditingReading(null)
    showToast('Reading updated')
  }

  async function handleDeleteReading(id) {
    await deleteReading(user.uid, id)
    showToast('Reading deleted')
  }

  async function handleCreateDefinition({ name, fields }) {
    await addDefinition(user.uid, {
      name,
      storage: 'nested',
      enabled: true,
      color: DEFINITION_COLORS[definitions.length % DEFINITION_COLORS.length],
      fields,
      createdAt: new Date().toISOString(),
    })
    showToast(`${name} reading type created`)
  }

  async function handleUpdateDefinition(definition, { name, fields }) {
    // `id` is the RTDB key, not part of the stored value.
    const { id, ...stored } = definition
    await updateDefinition(user.uid, id, { ...stored, name, fields })
    showToast(`${name} updated`)
  }

  async function handleToggleDefinition(definition, enabled) {
    const { id, ...stored } = definition
    await updateDefinition(user.uid, id, { ...stored, enabled })
    showToast(`${definition.name} ${enabled ? 'shown' : 'hidden'}`, enabled ? 'success' : 'error')
  }

  async function handleDeleteDefinition(definition) {
    const orphaned = readings.filter(r => readingDefinitionId(r) === definition.id)
    await Promise.all(orphaned.map(r => deleteReading(user.uid, r.id)))
    await deleteDefinition(user.uid, definition.id)
    if (page === definition.id) setPage('all')
    showToast(`${definition.name} deleted`, 'error')
  }

  async function handleCreateMedication(payload) {
    await addMedication(user.uid, { ...payload, enabled: true, createdAt: new Date().toISOString() })
    showToast(`${payload.name} added`)
  }

  async function handleUpdateMedication(medication, payload) {
    const { id, ...stored } = medication
    await updateMedication(user.uid, id, { ...stored, ...payload })
    showToast(`${payload.name} updated`)
  }

  async function handleToggleMedication(medication, enabled) {
    const { id, ...stored } = medication
    await updateMedication(user.uid, id, { ...stored, enabled })
    showToast(`${medication.name} ${enabled ? 'shown' : 'hidden'}`, enabled ? 'success' : 'error')
  }

  async function handleDeleteMedication(medication) {
    await deleteMedication(user.uid, medication.id)
    if (page === `med:${medication.id}`) setPage('all')
    showToast(`${medication.name} deleted`, 'error')
  }

  async function handleToggleDose(medication, day, slot, taken) {
    if (taken) {
      await clearMedicationDose(user.uid, medication.id, day, slot)
      showToast(`${slotLabel(slot)} dose cleared`, 'error')
    } else {
      await setMedicationDose(user.uid, medication.id, day, slot, new Date().toISOString())
      showToast(`${slotLabel(slot)} dose logged`)
    }
  }

  async function handleDeleteAllData() {
    await deleteAllData(user.uid)
    showToast('All readings deleted', 'error')
  }

  async function handleSeedData() {
    await seedSampleData(user.uid)
    showToast('Sample data loaded')
  }

  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    )
  }

  if (!user) {
    return <LoginScreen />
  }

  const settingsPage = page.startsWith('settings:') ? page.slice('settings:'.length) : null
  const activeMedication = page.startsWith('med:')
    ? medications.find(m => m.id === page.slice('med:'.length))
    : null
  const activeDefinition = page === 'all' || settingsPage || activeMedication ? null : definitionById[page]
  const filtered = activeDefinition ? (readingsByDefinition[activeDefinition.id] || []) : visibleReadings

  return (
    <div className="app-shell">
      <Toast toasts={toasts} />
      {editingReading && (
        <EditReadingModal
          reading={editingReading}
          definition={definitionById[readingDefinitionId(editingReading)]}
          onSave={handleUpdateReading}
          onClose={() => setEditingReading(null)}
        />
      )}
      <header className="navbar">
        <div className="navbar-inner">
          <div className="navbar-left">
            <button className="nav-menu-btn" onClick={() => setMenuOpen(true)} aria-label="Open navigation">
              <MenuIcon />
            </button>
          <div className="navbar-brand" onClick={() => handleSelectPage('all')} style={{ cursor: 'pointer' }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="8" fill="#6366f1"/>
              <rect x="11.5" y="5" width="5" height="18" rx="1" fill="white" fillOpacity="0.9"/>
              <rect x="5" y="11.5" width="18" height="5" rx="1" fill="white" fillOpacity="0.9"/>
              <polyline points="7,18 11,14 14.5,17 17.5,10 21,13" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div className="brand-text">
              <span className="brand-name">DataNurse</span>
              <span className="brand-tagline">Health Monitoring System</span>
            </div>
          </div>
          </div>
          <button className="btn-create" onClick={handleCreateNewReadingType}>
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M10 4v12M4 10h12" />
            </svg>
            Create new readings
          </button>
        </div>
      </header>

      <div className="app-body">
        <Sidebar
          definitions={enabledDefinitions}
          medications={enabledMedications}
          medicationLogs={medicationLogs}
          page={page}
          onSelect={handleSelectPage}
          counts={counts}
          total={visibleReadings.length}
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
        />

        {settingsPage ? (
          <main className="main-content main-content-single">
            {settingsPage === 'readings' && (
              <ReadingTypesSettings
                definitions={definitions}
                counts={counts}
                onCreate={handleCreateDefinition}
                onUpdate={handleUpdateDefinition}
                onDelete={handleDeleteDefinition}
                onToggle={handleToggleDefinition}
                openAddAt={newTypeRequest}
              />
            )}
            {settingsPage === 'medications' && (
              <MedicationsSettings
                medications={medications}
                onCreate={handleCreateMedication}
                onUpdate={handleUpdateMedication}
                onDelete={handleDeleteMedication}
                onToggle={handleToggleMedication}
                openAddAt={0}
              />
            )}
            {settingsPage === 'data' && (
              <DataSettings onDeleteData={handleDeleteAllData} onSeedData={handleSeedData} />
            )}
            {settingsPage === 'account' && (
              <AccountSettings user={user} onLogout={logout} />
            )}
          </main>
        ) : activeMedication ? (
          <main className="main-content main-content-stacked">
            <div className="page-header">
              <span className="dot" style={{ background: 'var(--accent-hover)' }} />
              <h2 className="page-title">{activeMedication.name}</h2>
            </div>
            <MedicationPage
              medication={activeMedication}
              logs={medicationLogs}
              onToggleDose={handleToggleDose}
            />
          </main>
        ) : activeDefinition ? (
          /* Individual dashboard: stats, chart then readings on the left, with
             the entry form alongside. */
          <main className="main-content">
            <div className="panel-left">
              <div className="page-header">
                <span className="dot" style={{ background: activeDefinition.color || 'var(--accent)' }} />
                <h2 className="page-title">{activeDefinition.name}</h2>
              </div>

              {dataLoading ? (
                <>
                  <SkeletonStatCards />
                  <SkeletonChart />
                  <SkeletonReadings />
                </>
              ) : (
                <>
                  <StatCards definitions={[activeDefinition]} readingsByDefinition={readingsByDefinition} />
                  <ReadingChart definition={activeDefinition} readings={filtered} />
                  <ReadingsCard
                    readings={filtered}
                    definitionById={definitionById}
                    onDelete={handleDeleteReading}
                    onEdit={setEditingReading}
                    emptyMessage={`No ${activeDefinition.name.toLowerCase()} readings yet.`}
                  />
                </>
              )}
            </div>

            <div className="panel-right">
              <div className="form-collapse-container">
                <button className="form-collapse-toggle" onClick={() => setFormCollapsed(c => !c)}>
                  <span>{formCollapsed ? 'Show' : 'Hide'} {activeDefinition.name} Form</span>
                  <span className={`collapse-chevron ${formCollapsed ? 'collapsed' : ''}`}>&#9650;</span>
                </button>
                {!formCollapsed && <ReadingForm definition={activeDefinition} onAdd={handleAddReading} />}
              </div>
            </div>
          </main>
        ) : (
          /* All Readings: full-width stats, a two-up chart grid, then the table. */
          <main className="main-content main-content-stacked">
            {enabledMedications.length > 0 && (
              <>
                <div className="page-header">
                  <h2 className="page-title">Medications</h2>
                </div>
                <MedicationHomeCards
                  medications={enabledMedications}
                  logs={medicationLogs}
                  onOpen={m => handleSelectPage(`med:${m.id}`)}
                />
              </>
            )}

            <div className="page-header">
              <h2 className="page-title">Readings</h2>
            </div>

            {dataLoading ? (
              <>
                <SkeletonStatCards />
                <div className="chart-grid">
                  <SkeletonChart />
                  <SkeletonChart />
                </div>
                <SkeletonReadings />
              </>
            ) : (
              <>
                <StatCards definitions={definitionsWithReadings} readingsByDefinition={readingsByDefinition} />
                <div className="chart-grid">
                  {definitionsWithReadings.map(d => (
                    <ReadingChart key={d.id} definition={d} readings={readingsByDefinition[d.id] || []} />
                  ))}
                </div>
                <ReadingsCard
                  table
                  readings={filtered}
                  definitionById={definitionById}
                  onDelete={handleDeleteReading}
                  onEdit={setEditingReading}
                  emptyMessage={enabledDefinitions.length === 0
                    ? 'No reading types are switched on. Add or enable one from Customize Readings.'
                    : 'No readings yet. Pick a reading type from the sidebar, or load sample data from Data.'}
                />
              </>
            )}
          </main>
        )}
      </div>
    </div>
  )
}

export default App
