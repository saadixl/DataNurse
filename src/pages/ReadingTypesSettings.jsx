import { useState, useEffect, useRef } from 'react'
import { MAX_CUSTOM_FIELDS, FIELD_TYPES, TARGET_DIRECTIONS, DEFAULT_AVERAGE_DAYS, averageDays, targetFor, toFieldKey } from '../definitions'

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
// Multi-select of the other reading types to chart this one against.
function CorrelationPicker({ definition, options, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = definition.correlations || []

  useEffect(() => {
    if (!open) return
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function toggle(id) {
    onChange(definition, selected.includes(id)
      ? selected.filter(x => x !== id)
      : [...selected, id])
  }

  const label = selected.length === 0
    ? 'Correlations'
    : selected.length === 1
      ? (options.find(o => o.id === selected[0])?.name || '1 selected')
      : `${selected.length} selected`

  return (
    <span className="corr-picker" ref={ref}>
      <button
        type="button"
        className={`corr-trigger ${selected.length ? 'corr-active' : ''}`}
        onClick={() => setOpen(o => !o)}
        disabled={options.length === 0}
        title={options.length === 0 ? 'Add another reading type to compare against' : 'Compare against other readings'}
      >
        {label}
        <span className="corr-caret">&#9662;</span>
      </button>
      {open && (
        <span className="corr-menu">
          {options.map(o => (
            <label className="corr-option" key={o.id}>
              <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
              <span className="dot" style={{ background: o.color || 'var(--accent)' }} />
              {o.name}
            </label>
          ))}
        </span>
      )}
    </span>
  )
}

export function ReadingTypesSettings({ definitions, counts, onCreate, onUpdate, onDelete, onToggle, onSetCorrelations }) {
  const [mode, setMode] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)

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
                    <CorrelationPicker
                      definition={d}
                      options={definitions.filter(o => o.id !== d.id)}
                      onChange={onSetCorrelations}
                    />
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
