import { useState, useMemo } from 'react'
import { MAX_MEDICATION_EXTRAS, FREQUENCIES, MEAL_TIMINGS, slotsFor, slotLabel, mealLabel, frequencyLabel, dayKey, logKey, todayProgress, progressState, medicationStats, adherence, streak, adherenceCalendar, parseDayKey } from '../medications'
import { DEFAULT_REMINDER_TIMES, remindersSupported } from '../reminders'
import { formatTime, formatDayKey, toLocalDatetime, nowLocal } from '../utils/format'

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

// Browser notifications when a dose is due. Per browser, since permission is.
export function ReminderSettings({ settings, onChange }) {
  const supported = remindersSupported()
  const [permission, setPermission] = useState(() => (supported ? Notification.permission : 'denied'))

  async function toggle(on) {
    if (on && permission !== 'granted') {
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result !== 'granted') return
    }
    onChange({ ...settings, enabled: on })
  }

  return (
    <div className="card reminder-card">
      <div className="danger-action">
        <div>
          <div className="danger-label">Dose reminders</div>
          <div className="danger-desc">
            A notification when a dose is due and not ticked off yet. Reminders come while DataNurse is open in a tab
            or installed on your home screen.
          </div>
        </div>
        <label className="toggle" title={supported ? undefined : 'This browser does not support notifications'}>
          <input
            type="checkbox"
            checked={settings.enabled && permission === 'granted'}
            disabled={!supported || permission === 'denied'}
            onChange={e => toggle(e.target.checked)}
          />
          <span className="toggle-slider" />
        </label>
      </div>
      {permission === 'denied' && supported && (
        <p className="builder-hint">Notifications are blocked for this site. Allow them in your browser&apos;s site settings to use reminders.</p>
      )}
      {settings.enabled && permission === 'granted' && (
        <div className="reminder-times">
          {Object.keys(DEFAULT_REMINDER_TIMES).map(slot => (
            <label key={slot} className="reminder-time">
              <span>{slotLabel(slot)}</span>
              <input
                type="time"
                value={settings.times[slot]}
                onChange={e => onChange({ ...settings, times: { ...settings.times, [slot]: e.target.value } })}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export function MedicationsSettings({ medications, onCreate, onUpdate, onDelete, onToggle }) {
  const [mode, setMode] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)

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

// Share of scheduled doses taken in a window.
function AdherenceCard({ label, result }) {
  const pct = result.rate === null ? null : Math.round(result.rate * 100)
  const tone = pct === null ? '' : pct >= 90 ? 'adh-good' : pct >= 70 ? 'adh-ok' : 'adh-low'
  return (
    <div className={`stat-card ${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{pct === null ? '—' : <>{pct}<span className="stat-unit">%</span></>}</div>
      <div className="stat-sub">{result.scheduled ? `${result.taken} of ${result.scheduled} doses taken` : 'No full days yet'}</div>
      {pct !== null && <div className="adh-bar"><span style={{ width: `${pct}%` }} /></div>}
    </div>
  )
}

export function MedicationPage({ medication, logs, onToggleDose }) {
  const today = dayKey()
  // The day the dose buttons are for: today, or a past day picked on the calendar.
  const [selectedDay, setSelectedDay] = useState(today)
  const day = today
  const slots = slotsFor(medication.frequency)
  const stats = medicationStats(medication.id, logs)
  const week = adherence(medication, logs, 7, day)
  const month = adherence(medication, logs, 30, day)
  const currentStreak = streak(medication, logs, day)
  const calendar = useMemo(() => adherenceCalendar(medication, logs, 5, day), [medication, logs, day])

  const history = useMemo(() => Object.entries(logs)
    .filter(([, log]) => log.medicationId === medication.id)
    .map(([key, log]) => ({ key, ...log }))
    .sort((a, b) => String(b.takenAt).localeCompare(String(a.takenAt))), [logs, medication.id])

  const detail = [medication.genericName, medication.dose, frequencyLabel(medication.frequency), mealLabel(medication.timing)]
    .filter(Boolean).join(' · ')

  return (
    <>
      <div className="stat-cards">
        <AdherenceCard label="Last 7 days" result={week} />
        <AdherenceCard label="Last 30 days" result={month} />
        <div className="stat-card">
          <div className="stat-label">Streak</div>
          <div className="stat-value">{currentStreak} <span className="stat-unit">{currentStreak === 1 ? 'day' : 'days'}</span></div>
          <div className="stat-sub">in a row with every dose</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Doses taken</div>
          <div className="stat-value">{stats.doses}</div>
          <div className="stat-sub">over {stats.days} {stats.days === 1 ? 'day' : 'days'}</div>
        </div>
      </div>

      <div className="card adherence-calendar-card">
        <div className="card-title">Last 5 weeks</div>
        <div className="adherence-calendar" role="grid" aria-label="Doses taken per day">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="cal-head">{d}</span>)}
          {calendar.map(cell => (
            <button
              type="button"
              key={cell.day}
              className={`cal-day cal-${cell.state}${cell.day === day ? ' cal-today' : ''}${cell.day === selectedDay ? ' cal-selected' : ''}`}
              title={`${formatDayKey(cell.day)}: ${cell.state === 'future' || cell.state === 'before' ? '—' : `${cell.taken}/${cell.total} doses`}`}
              disabled={cell.state === 'future'}
              onClick={() => setSelectedDay(cell.day)}
              aria-pressed={cell.day === selectedDay}
            >
              {parseDayKey(cell.day).getDate()}
            </button>
          ))}
        </div>
        <p className="builder-hint cal-hint">Tap a day to log or fix its doses.</p>
        <div className="cal-legend">
          <span><i className="cal-dot cal-complete" /> All doses</span>
          <span><i className="cal-dot cal-partial" /> Some</span>
          <span><i className="cal-dot cal-none" /> Missed</span>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <span className="dot" style={{ background: 'var(--accent-hover)' }} />
          {selectedDay === today
            ? <>Have you taken today&apos;s {medication.name}?</>
            : <>{medication.name} on {formatDayKey(selectedDay)}</>}
          {selectedDay !== today && (
            <button type="button" className="btn-chip card-title-action" onClick={() => setSelectedDay(today)}>
              Back to today
            </button>
          )}
        </div>
        {detail && <p className="builder-hint med-detail">{detail}</p>}
        <div className="dose-buttons">
          {slots.map(slot => {
            const log = logs[logKey(medication.id, selectedDay, slot.key)]
            return (
              <button
                key={slot.key}
                type="button"
                className={`dose-btn ${log ? 'dose-taken' : ''}`}
                onClick={() => onToggleDose(medication, selectedDay, slot.key, !!log)}
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
export function MedicationHomeCards({ medications, logs, onOpen }) {
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
