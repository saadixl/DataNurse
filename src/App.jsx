import { useState, useEffect, useMemo, useCallback } from 'react'
import { loginWithGoogle, logout, onAuthChange, subscribeReadings, addReading, updateReading, deleteReading, seedSampleData, subscribeTargets, saveTargets, deleteAllData } from './firebase'
import { BarChart, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine, Cell } from 'recharts'
import './App.css'

function formatDate(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(iso) {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function formatShortDate(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function toLocalDatetime(date) {
  const d = new Date(date)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function nowLocal() {
  return toLocalDatetime(new Date())
}

function BloodPressureForm({ onAdd }) {
  const [systolic, setSystolic] = useState('')
  const [diastolic, setDiastolic] = useState('')
  const [pulse, setPulse] = useState('')
  const [datetime, setDatetime] = useState(nowLocal)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const canSubmit = systolic && diastolic && !saving

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    await onAdd({
      type: 'bp',
      systolic: Number(systolic),
      diastolic: Number(diastolic),
      pulse: pulse ? Number(pulse) : null,
      notes: notes.trim(),
      timestamp: new Date(datetime).toISOString(),
    })
    setSystolic('')
    setDiastolic('')
    setPulse('')
    setDatetime(nowLocal())
    setNotes('')
    setSaving(false)
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <div className="card-title">
        <span className="dot dot-bp" />
        Blood Pressure
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Systolic (mmHg)</label>
          <input type="number" placeholder="120" value={systolic} onChange={e => setSystolic(e.target.value)} min="60" max="300" />
        </div>
        <div className="form-group">
          <label>Diastolic (mmHg)</label>
          <input type="number" placeholder="80" value={diastolic} onChange={e => setDiastolic(e.target.value)} min="30" max="200" />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Pulse (bpm, optional)</label>
          <input type="number" placeholder="72" value={pulse} onChange={e => setPulse(e.target.value)} min="30" max="250" />
        </div>
        <div className="form-group">
          <label>Date & Time</label>
          <input type="datetime-local" value={datetime} onChange={e => setDatetime(e.target.value)} />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group full-width">
          <label>Notes (optional)</label>
          <input type="text" placeholder="e.g. after exercise" value={notes} onChange={e => setNotes(e.target.value)} maxLength={100} />
        </div>
      </div>
      <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
        {saving ? 'Saving...' : 'Save Reading'}
      </button>
    </form>
  )
}

function BloodGlucoseForm({ onAdd }) {
  const [glucose, setGlucose] = useState('')
  const [meal, setMeal] = useState('fasting')
  const [datetime, setDatetime] = useState(nowLocal)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const canSubmit = !!glucose && !saving

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    await onAdd({
      type: 'glucose',
      glucose: Number(glucose),
      meal,
      notes: notes.trim(),
      timestamp: new Date(datetime).toISOString(),
    })
    setGlucose('')
    setMeal('fasting')
    setDatetime(nowLocal())
    setNotes('')
    setSaving(false)
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <div className="card-title">
        <span className="dot dot-bg" />
        Blood Glucose
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Glucose (mmol/L)</label>
          <input type="number" placeholder="5.5" value={glucose} onChange={e => setGlucose(e.target.value)} min="1" max="35" step="0.1" />
        </div>
        <div className="form-group">
          <label>Meal Context</label>
          <select value={meal} onChange={e => setMeal(e.target.value)}>
            <option value="fasting">Fasting</option>
            <option value="before_meal">Before Meal</option>
            <option value="after_meal">After Meal</option>
            <option value="bedtime">Bedtime</option>
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Date & Time</label>
          <input type="datetime-local" value={datetime} onChange={e => setDatetime(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Notes (optional)</label>
          <input type="text" placeholder="e.g. felt dizzy" value={notes} onChange={e => setNotes(e.target.value)} maxLength={100} />
        </div>
      </div>
      <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
        {saving ? 'Saving...' : 'Save Reading'}
      </button>
    </form>
  )
}

const mealLabels = {
  fasting: 'Fasting',
  before_meal: 'Before Meal',
  after_meal: 'After Meal',
  bedtime: 'Bedtime',
}

function getReadingScoreClass(reading, targets) {
  if (reading.type === 'bp') {
    if (!targets.bpEnabled || !targets.systolic || !targets.diastolic) return ''
    return reading.systolic <= targets.systolic && reading.diastolic <= targets.diastolic
      ? 'score-good' : 'score-bad'
  }
  if (!targets.glucoseEnabled || !targets.glucose) return ''
  return reading.glucose <= targets.glucose ? 'score-good' : 'score-bad'
}

function ReadingItem({ reading, onDelete, onEdit, targets }) {
  const scoreClass = getReadingScoreClass(reading, targets)
  return (
    <div className="reading-item-compact">
      <span className={`compact-tag ${reading.type === 'bp' ? 'tag-bp' : 'tag-bg'}`}>
        {reading.type === 'bp' ? 'BP' : 'BG'}
      </span>
      <span className={`compact-value ${scoreClass}`}>
        {reading.type === 'bp'
          ? <>{reading.systolic} / {reading.diastolic} <span className="reading-unit">mmHg</span>{reading.pulse ? <> · {reading.pulse} <span className="reading-unit">bpm</span></> : null}</>
          : <>{reading.glucose} <span className="reading-unit">mmol/L</span> · <span className="compact-meal">{mealLabels[reading.meal]}</span></>
        }
      </span>
      {reading.notes && <span className="compact-notes" title={reading.notes}>{reading.notes}</span>}
      <span className="compact-date">{formatShortDate(reading.timestamp)} {formatTime(reading.timestamp)}</span>
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

function EditReadingModal({ reading, onSave, onClose }) {
  const isBp = reading.type === 'bp'
  const [systolic, setSystolic] = useState(isBp ? reading.systolic : '')
  const [diastolic, setDiastolic] = useState(isBp ? reading.diastolic : '')
  const [pulse, setPulse] = useState(isBp && reading.pulse ? reading.pulse : '')
  const [glucose, setGlucose] = useState(!isBp ? reading.glucose : '')
  const [meal, setMeal] = useState(!isBp ? reading.meal : 'fasting')
  const [datetime, setDatetime] = useState(toLocalDatetime(reading.timestamp))
  const [notes, setNotes] = useState(reading.notes || '')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    const updated = isBp
      ? { type: 'bp', systolic: Number(systolic), diastolic: Number(diastolic), pulse: pulse ? Number(pulse) : null, notes: notes.trim(), timestamp: new Date(datetime).toISOString() }
      : { type: 'glucose', glucose: Number(glucose), meal, notes: notes.trim(), timestamp: new Date(datetime).toISOString() }
    await onSave(reading.id, updated)
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit {isBp ? 'Blood Pressure' : 'Glucose'} Reading</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          {isBp ? (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label>Systolic (mmHg)</label>
                  <input type="number" value={systolic} onChange={e => setSystolic(e.target.value)} min="60" max="300" required />
                </div>
                <div className="form-group">
                  <label>Diastolic (mmHg)</label>
                  <input type="number" value={diastolic} onChange={e => setDiastolic(e.target.value)} min="30" max="200" required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Pulse (bpm, optional)</label>
                  <input type="number" value={pulse} onChange={e => setPulse(e.target.value)} min="30" max="250" />
                </div>
                <div className="form-group">
                  <label>Date & Time</label>
                  <input type="datetime-local" value={datetime} onChange={e => setDatetime(e.target.value)} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label>Glucose (mmol/L)</label>
                  <input type="number" value={glucose} onChange={e => setGlucose(e.target.value)} min="0.5" max="35" step="0.1" required />
                </div>
                <div className="form-group">
                  <label>Meal Context</label>
                  <select value={meal} onChange={e => setMeal(e.target.value)}>
                    <option value="fasting">Fasting</option>
                    <option value="before_meal">Before Meal</option>
                    <option value="after_meal">After Meal</option>
                    <option value="bedtime">Bedtime</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Date & Time</label>
                  <input type="datetime-local" value={datetime} onChange={e => setDatetime(e.target.value)} />
                </div>
                <div className="form-group" />
              </div>
            </>
          )}
          <div className="form-row">
            <div className="form-group full-width">
              <label>Notes (optional)</label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)} maxLength={100} />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const chartTooltipStyle = {
  backgroundColor: '#f9fafb',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#111827',
}

function BPChart({ readings, targets }) {
  const data = useMemo(() => {
    const bpReadings = readings.filter(r => r.type === 'bp')
    const byDay = {}
    bpReadings.forEach(r => {
      const day = new Date(r.timestamp).toDateString()
      if (!byDay[day]) byDay[day] = { systolics: [], diastolics: [], timestamp: r.timestamp }
      byDay[day].systolics.push(r.systolic)
      byDay[day].diastolics.push(r.diastolic)
    })
    return Object.entries(byDay)
      .map(([, v]) => ({
        date: formatShortDate(v.timestamp),
        sortKey: new Date(v.timestamp).getTime(),
        Systolic: Math.round(v.systolics.reduce((a, b) => a + b, 0) / v.systolics.length),
        Diastolic: Math.round(v.diastolics.reduce((a, b) => a + b, 0) / v.diastolics.length),
      }))
      .sort((a, b) => a.sortKey - b.sortKey)
      .slice(-14)
  }, [readings])

  if (data.length === 0) return <div className="chart-empty">No BP data to chart</div>

  return (
    <div className="chart-card">
      <h3 className="chart-title">
        <span className="dot dot-bp" />
        Blood Pressure — Last 14 days
      </h3>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} barGap={2} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#2e3248" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#2e3248' }} tickLine={false} />
            <YAxis domain={[40, 'auto']} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} width={35} />
            <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: 'rgba(99,102,241,0.08)' }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px', color: '#9ca3af' }} />
            <Bar dataKey="Systolic" radius={[4, 4, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={targets.bpEnabled !== false && targets.systolic && d.Systolic > targets.systolic ? '#f87171' : '#818cf8'} />
              ))}
            </Bar>
            <Bar dataKey="Diastolic" radius={[4, 4, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={targets.bpEnabled !== false && targets.diastolic && d.Diastolic > targets.diastolic ? '#fb923c' : '#6366f1'} />
              ))}
            </Bar>
            {targets.bpEnabled !== false && targets.systolic && (
              <ReferenceLine y={targets.systolic} stroke="#f87171" strokeDasharray="6 4" strokeWidth={1.5} label={{ value: `Sys ${targets.systolic}`, fill: '#f87171', fontSize: 10, position: 'right' }} />
            )}
            {targets.bpEnabled !== false && targets.diastolic && (
              <ReferenceLine y={targets.diastolic} stroke="#fb923c" strokeDasharray="6 4" strokeWidth={1.5} label={{ value: `Dia ${targets.diastolic}`, fill: '#fb923c', fontSize: 10, position: 'right' }} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function GlucoseChart({ readings, targets }) {
  const data = useMemo(() => {
    const bgReadings = readings.filter(r => r.type === 'glucose')
    const byDay = {}
    bgReadings.forEach(r => {
      const day = new Date(r.timestamp).toDateString()
      if (!byDay[day]) byDay[day] = { values: [], timestamp: r.timestamp }
      byDay[day].values.push(r.glucose)
    })
    return Object.entries(byDay)
      .map(([, v]) => ({
        date: formatShortDate(v.timestamp),
        sortKey: new Date(v.timestamp).getTime(),
        Glucose: +(v.values.reduce((a, b) => a + b, 0) / v.values.length).toFixed(1),
      }))
      .sort((a, b) => a.sortKey - b.sortKey)
      .slice(-14)
  }, [readings])

  if (data.length === 0) return <div className="chart-empty">No glucose data to chart</div>

  return (
    <div className="chart-card">
      <h3 className="chart-title">
        <span className="dot dot-bg" />
        Blood Glucose — Last 14 days
      </h3>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#2e3248" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#2e3248' }} tickLine={false} />
            <YAxis domain={[0, 'auto']} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} width={35} unit=" " />
            <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: 'rgba(52,211,153,0.08)' }} formatter={(value) => [`${value} mmol/L`, 'Glucose']} />
            <Bar dataKey="Glucose" radius={[4, 4, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={targets.glucoseEnabled !== false && targets.glucose && d.Glucose > targets.glucose ? '#f87171' : '#34d399'} />
              ))}
            </Bar>
            {targets.glucoseEnabled !== false && targets.glucose && (
              <ReferenceLine y={targets.glucose} stroke="#f87171" strokeDasharray="6 4" strokeWidth={1.5} label={{ value: `Target ${targets.glucose}`, fill: '#f87171', fontSize: 10, position: 'right' }} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function CombinedChart({ readings, targets }) {
  const data = useMemo(() => {
    const byDay = {}
    readings.forEach(r => {
      const day = new Date(r.timestamp).toDateString()
      if (!byDay[day]) byDay[day] = { systolics: [], diastolics: [], glucoses: [], timestamp: r.timestamp }
      if (r.type === 'bp') {
        byDay[day].systolics.push(r.systolic)
        byDay[day].diastolics.push(r.diastolic)
      } else if (r.type === 'glucose') {
        byDay[day].glucoses.push(r.glucose)
      }
    })
    return Object.entries(byDay)
      .map(([, v]) => ({
        date: formatShortDate(v.timestamp),
        sortKey: new Date(v.timestamp).getTime(),
        Systolic: v.systolics.length ? Math.round(v.systolics.reduce((a, b) => a + b, 0) / v.systolics.length) : null,
        Diastolic: v.diastolics.length ? Math.round(v.diastolics.reduce((a, b) => a + b, 0) / v.diastolics.length) : null,
        Glucose: v.glucoses.length ? +(v.glucoses.reduce((a, b) => a + b, 0) / v.glucoses.length).toFixed(1) : null,
      }))
      .sort((a, b) => a.sortKey - b.sortKey)
      .slice(-14)
  }, [readings])

  if (data.length === 0) return <div className="chart-empty">No data to chart</div>

  return (
    <div className="chart-card">
      <h3 className="chart-title">
        <span className="dot dot-bp" />
        <span className="dot dot-bg" />
        Combined — Last 14 days
      </h3>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data} barGap={2} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#2e3248" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#2e3248' }} tickLine={false} />
            <YAxis yAxisId="bp" domain={[40, 'auto']} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} width={35} />
            <YAxis yAxisId="glucose" orientation="right" domain={[0, 'auto']} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} width={40} unit=" mmol/L" />
            <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: 'rgba(99,102,241,0.08)' }} formatter={(value, name) => name === 'Glucose' ? [`${value} mmol/L`, name] : [`${value} mmHg`, name]} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px', color: '#9ca3af' }} />
            <Bar yAxisId="bp" dataKey="Systolic" fill="#818cf8" radius={[4, 4, 0, 0]} />
            <Bar yAxisId="bp" dataKey="Diastolic" fill="#6366f1" radius={[4, 4, 0, 0]} />
            <Line yAxisId="glucose" type="monotone" dataKey="Glucose" stroke="#34d399" strokeWidth={2.5} dot={{ fill: '#34d399', r: 3 }} activeDot={{ r: 5 }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function StatCards({ readings, targets }) {
  const stats = useMemo(() => {
    const cutoff = Date.now() - 7 * 86400000
    const recent = readings.filter(r => new Date(r.timestamp).getTime() >= cutoff)
    const bpReadings = recent.filter(r => r.type === 'bp')
    const bgReadings = recent.filter(r => r.type === 'glucose')

    const avgSys = bpReadings.length
      ? Math.round(bpReadings.reduce((s, r) => s + r.systolic, 0) / bpReadings.length)
      : null
    const avgDia = bpReadings.length
      ? Math.round(bpReadings.reduce((s, r) => s + r.diastolic, 0) / bpReadings.length)
      : null
    const avgGlucose = bgReadings.length
      ? +(bgReadings.reduce((s, r) => s + r.glucose, 0) / bgReadings.length).toFixed(1)
      : null

    return { avgSys, avgDia, avgGlucose, bpCount: bpReadings.length, bgCount: bgReadings.length }
  }, [readings])

  const sysOver = targets.bpEnabled !== false && targets.systolic && stats.avgSys > targets.systolic
  const diaOver = targets.bpEnabled !== false && targets.diastolic && stats.avgDia > targets.diastolic
  const bgOver = targets.glucoseEnabled !== false && targets.glucose && stats.avgGlucose > targets.glucose

  return (
    <div className="stat-cards">
      <div className={`stat-card ${sysOver ? 'stat-over' : ''}`}>
        <div className="stat-label">Avg Systolic</div>
        <div className="stat-value">
          {stats.avgSys !== null ? <>{stats.avgSys} <span className="stat-unit">mmHg</span></> : '—'}
        </div>
        <div className="stat-sub">7-day avg · {stats.bpCount} readings</div>
        {targets.bpEnabled !== false && targets.systolic && <div className="stat-target">Target: {targets.systolic}</div>}
      </div>
      <div className={`stat-card ${diaOver ? 'stat-over' : ''}`}>
        <div className="stat-label">Avg Diastolic</div>
        <div className="stat-value">
          {stats.avgDia !== null ? <>{stats.avgDia} <span className="stat-unit">mmHg</span></> : '—'}
        </div>
        <div className="stat-sub">7-day avg · {stats.bpCount} readings</div>
        {targets.bpEnabled !== false && targets.diastolic && <div className="stat-target">Target: {targets.diastolic}</div>}
      </div>
      <div className={`stat-card ${bgOver ? 'stat-over' : ''}`}>
        <div className="stat-label">Avg Glucose</div>
        <div className="stat-value">
          {stats.avgGlucose !== null ? <>{stats.avgGlucose} <span className="stat-unit">mmol/L</span></> : '—'}
        </div>
        <div className="stat-sub">7-day avg · {stats.bgCount} readings</div>
        {targets.glucoseEnabled !== false && targets.glucose && <div className="stat-target">Target: {targets.glucose}</div>}
      </div>
    </div>
  )
}

function SettingsPage({ targets, onSave, onLogout, onDeleteData, onSeedData, user, showToast }) {
  const [settingsTab, setSettingsTab] = useState('targets')
  const [systolic, setSystolic] = useState(targets.systolic || '')
  const [diastolic, setDiastolic] = useState(targets.diastolic || '')
  const [glucose, setGlucose] = useState(targets.glucose || '')
  const [bpEnabled, setBpEnabled] = useState(targets.bpEnabled !== false)
  const [glucoseEnabled, setGlucoseEnabled] = useState(targets.glucoseEnabled !== false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setSystolic(targets.systolic || '')
    setDiastolic(targets.diastolic || '')
    setGlucose(targets.glucose || '')
    setBpEnabled(targets.bpEnabled !== false)
    setGlucoseEnabled(targets.glucoseEnabled !== false)
  }, [targets])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    await onSave({
      systolic: systolic ? Number(systolic) : null,
      diastolic: diastolic ? Number(diastolic) : null,
      glucose: glucose ? Number(glucose) : null,
      bpEnabled,
      glucoseEnabled,
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

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
    <div className="settings-layout">
      <nav className="settings-tabs">
        <button className={`settings-tab ${settingsTab === 'targets' ? 'active' : ''}`} onClick={() => setSettingsTab('targets')}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="10" cy="10" r="8" />
            <circle cx="10" cy="10" r="4" />
            <circle cx="10" cy="10" r="1" />
          </svg>
          Targets
        </button>
        <button className={`settings-tab ${settingsTab === 'data' ? 'active' : ''}`} onClick={() => setSettingsTab('data')}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="10" cy="5" rx="7" ry="3" />
            <path d="M3 5v5c0 1.66 3.13 3 7 3s7-1.34 7-3V5" />
            <path d="M3 10v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5" />
          </svg>
          Data
        </button>
        <button className={`settings-tab ${settingsTab === 'account' ? 'active' : ''}`} onClick={() => setSettingsTab('account')}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="10" cy="7" r="4" />
            <path d="M3 18c0-3.31 3.13-6 7-6s7 2.69 7 6" />
          </svg>
          Account
        </button>
      </nav>

      <div className="settings-content">
        {settingsTab === 'targets' && (
          <div className="settings-page">
            <h2 className="settings-title">Targets</h2>
            <p className="settings-desc">Set your target values. These will appear as reference lines on your charts.</p>

            <form onSubmit={handleSubmit}>
              <div className={`card ${!bpEnabled ? 'card-disabled' : ''}`}>
                <div className="card-title">
                  <span className="dot dot-bp" />
                  Blood Pressure Target
                  <label className="toggle" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={bpEnabled} onChange={e => {
                      const v = e.target.checked
                      setBpEnabled(v)
                      onSave({ ...targets, systolic: systolic ? Number(systolic) : null, diastolic: diastolic ? Number(diastolic) : null, glucose: glucose ? Number(glucose) : null, bpEnabled: v, glucoseEnabled })
                      showToast(v ? 'Blood pressure target enabled' : 'Blood pressure target disabled')
                    }} />
                    <span className="toggle-slider" />
                  </label>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Systolic Target (mmHg)</label>
                    <input type="number" placeholder="120" value={systolic} onChange={e => setSystolic(e.target.value)} min="60" max="200" disabled={!bpEnabled} />
                  </div>
                  <div className="form-group">
                    <label>Diastolic Target (mmHg)</label>
                    <input type="number" placeholder="80" value={diastolic} onChange={e => setDiastolic(e.target.value)} min="30" max="130" disabled={!bpEnabled} />
                  </div>
                </div>
              </div>

              <div className={`card ${!glucoseEnabled ? 'card-disabled' : ''}`}>
                <div className="card-title">
                  <span className="dot dot-bg" />
                  Blood Glucose Target
                  <label className="toggle" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={glucoseEnabled} onChange={e => {
                      const v = e.target.checked
                      setGlucoseEnabled(v)
                      onSave({ ...targets, systolic: systolic ? Number(systolic) : null, diastolic: diastolic ? Number(diastolic) : null, glucose: glucose ? Number(glucose) : null, bpEnabled, glucoseEnabled: v })
                      showToast(v ? 'Blood glucose target enabled' : 'Blood glucose target disabled')
                    }} />
                    <span className="toggle-slider" />
                  </label>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Glucose Target (mmol/L)</label>
                    <input type="number" placeholder="5.5" value={glucose} onChange={e => setGlucose(e.target.value)} min="1" max="20" step="0.1" disabled={!glucoseEnabled} />
                  </div>
                  <div className="form-group" />
                </div>
              </div>

              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Targets'}
              </button>
            </form>
          </div>
        )}

        {settingsTab === 'data' && (
          <div className="settings-page">
            <h2 className="settings-title">Data</h2>
            <p className="settings-desc">Manage your health readings and sample data.</p>

            <div className="card">
              <div className="danger-action">
                <div>
                  <div className="danger-label">Load sample data</div>
                  <div className="danger-desc">Generate 1 month of sample readings and default targets.</div>
                </div>
                <button className="btn-danger-outline btn-neutral-outline" onClick={onSeedData}>Load Sample Data</button>
              </div>
            </div>
            <div className="card">
              <div className="danger-action">
                <div>
                  <div className="danger-label">Delete all data</div>
                  <div className="danger-desc">Remove all readings and targets. This cannot be undone.</div>
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
        )}

        {settingsTab === 'account' && (
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
        )}
      </div>
    </div>
  )
}

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

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
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

function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [tab, setTab] = useState('bp')
  const [page, setPage] = useState('dashboard')
  const [readings, setReadings] = useState([])
  const [targets, setTargets] = useState({})
  const [dataLoading, setDataLoading] = useState(true)
  const [editingReading, setEditingReading] = useState(null)
  const [formCollapsed, setFormCollapsed] = useState(false)
  const { toasts, show: showToast } = useToast()

  useEffect(() => {
    return onAuthChange(u => {
      setUser(u)
      setAuthLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!user) {
      setReadings([])
      setTargets({})
      setDataLoading(false)
      return
    }
    setDataLoading(true)
    let readingsLoaded = false
    let targetsLoaded = false
    const unsub1 = subscribeReadings(user.uid, r => {
      setReadings(r)
      readingsLoaded = true
      if (targetsLoaded) setDataLoading(false)
    })
    const unsub2 = subscribeTargets(user.uid, t => {
      setTargets(t)
      targetsLoaded = true
      if (readingsLoaded) setDataLoading(false)
    })
    return () => { unsub1(); unsub2() }
  }, [user])

  async function handleAddReading(reading) {
    await addReading(user.uid, reading)
    showToast(reading.type === 'bp' ? 'Blood pressure reading added' : 'Glucose reading added')
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

  async function handleSaveTargets(t) {
    await saveTargets(user.uid, t)
    showToast('Targets saved')
  }

  async function handleDeleteAllData() {
    await deleteAllData(user.uid)
    showToast('All data deleted', 'error')
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

  const filtered = tab === 'all'
    ? readings
    : readings.filter(r => (tab === 'bp' ? r.type === 'bp' : r.type === 'glucose'))

  return (
    <div className="app-shell">
      <Toast toasts={toasts} />
      {editingReading && (
        <EditReadingModal
          reading={editingReading}
          onSave={handleUpdateReading}
          onClose={() => setEditingReading(null)}
        />
      )}
      <header className="navbar">
        <div className="navbar-inner">
          <div className="navbar-brand" onClick={() => setPage('dashboard')} style={{ cursor: 'pointer' }}>
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
          <nav className="navbar-nav">
            <button className={`nav-item ${page === 'dashboard' ? 'active' : ''}`} onClick={() => setPage('dashboard')}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="7" height="8" rx="1.5" />
                <rect x="11" y="2" width="7" height="5" rx="1.5" />
                <rect x="2" y="12" width="7" height="5" rx="1.5" />
                <rect x="11" y="9" width="7" height="8" rx="1.5" />
              </svg>
              Dashboard
            </button>
            <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => setPage('settings')}>
              <SettingsIcon />
              Settings
            </button>
          </nav>
        </div>
      </header>

      {page === 'settings' ? (
        <main className="main-content main-content-single">
          <SettingsPage targets={targets} onSave={handleSaveTargets} onLogout={logout} onDeleteData={handleDeleteAllData} onSeedData={handleSeedData} user={user} showToast={showToast} />
        </main>
      ) : (
        <main className="main-content">
          <div className="panel-left">
            <div className="tabs">
              <button className={`tab ${tab === 'bp' ? 'active' : ''}`} onClick={() => setTab('bp')}>
                Blood Pressure
              </button>
              <button className={`tab ${tab === 'glucose' ? 'active' : ''}`} onClick={() => setTab('glucose')}>
                Glucose
              </button>
              <button className={`tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
                All
              </button>
            </div>

            {tab !== 'all' && (
              <div className="form-collapse-container">
                <button className="form-collapse-toggle" onClick={() => setFormCollapsed(c => !c)}>
                  <span>{formCollapsed ? 'Show' : 'Hide'} {tab === 'bp' ? 'BP' : 'Glucose'} Form</span>
                  <span className={`collapse-chevron ${formCollapsed ? 'collapsed' : ''}`}>&#9650;</span>
                </button>
                {!formCollapsed && (
                  tab === 'bp' ? <BloodPressureForm onAdd={handleAddReading} /> : <BloodGlucoseForm onAdd={handleAddReading} />
                )}
              </div>
            )}

            {dataLoading ? <SkeletonReadings /> : (
              <div className="readings-card">
                <div className="readings-header">
                  <h3>Recent Readings</h3>
                  <span className="readings-count">{filtered.length} entries</span>
                </div>

                <div className="readings-list">
                  {filtered.length === 0 && readings.length === 0 ? (
                    <div className="empty-state">
                      <p>No readings yet. Add your first one above, or load sample data from Settings.</p>
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="empty-state">
                      <p>No {tab === 'bp' ? 'blood pressure' : 'glucose'} readings yet.</p>
                    </div>
                  ) : (
                    filtered.map(r => (
                      <ReadingItem key={r.id} reading={r} onDelete={handleDeleteReading} onEdit={setEditingReading} targets={targets} />
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="panel-right">
            {dataLoading ? (
              <>
                <SkeletonStatCards />
                <SkeletonChart />
                <SkeletonChart />
                <SkeletonChart />
              </>
            ) : (
              <>
                <StatCards readings={readings} targets={targets} />
                <BPChart readings={readings} targets={targets} />
                <GlucoseChart readings={readings} targets={targets} />
                <CombinedChart readings={readings} targets={targets} />
              </>
            )}
          </div>
        </main>
      )}
    </div>
  )
}

export default App
