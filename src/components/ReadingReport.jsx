import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { targetFor, meetsTarget, readingScoreClass, numericFields, getFieldValue, formatFieldValue } from '../definitions'
import { dayKey } from '../medications'
import { ReadingChart } from './charts'
import { formatTime, formatDayKey } from '../utils/format'

function fieldSummary(readings, definition, field) {
  const values = readings
    .map(r => getFieldValue(r, definition, field))
    .filter(v => typeof v === 'number' && Number.isFinite(v))
  if (values.length === 0) return null
  const target = targetFor(field)
  return {
    avg: +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1),
    min: Math.min(...values),
    max: Math.max(...values),
    count: values.length,
    target,
    inTarget: target ? values.filter(v => meetsTarget(v, target)).length / values.length : null,
  }
}

// A printable summary of one reading type: averages, the chart and every reading.
export function ReadingReport({ definition, readings, rangeDays, onClose }) {
  const numeric = numericFields(definition)
  const sorted = [...readings].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  const first = sorted[sorted.length - 1]
  const last = sorted[0]

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.classList.add('report-open')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('report-open')
    }
  }, [onClose])

  return createPortal(
    <div className="print-report" role="dialog" aria-label={`${definition.name} report`}>
      <div className="report-toolbar">
        <span>Preview · use Print to save as PDF</span>
        <div>
          <button type="button" className="btn-chip" onClick={() => window.print()}>Print</button>
          <button type="button" className="btn-chip" onClick={onClose}>Close</button>
        </div>
      </div>
      <div className="report-page">
        <header className="report-header">
          <div>
            <p className="report-brand">DataNurse</p>
            <h1>{definition.name} report</h1>
            <p className="report-meta">
              {rangeDays === Infinity ? 'All readings' : `Last ${rangeDays} days`}
              {first && last && <> · {formatDayKey(dayKey(new Date(first.timestamp)))} – {formatDayKey(dayKey(new Date(last.timestamp)))}</>}
              {' · '}{readings.length} {readings.length === 1 ? 'reading' : 'readings'}
            </p>
          </div>
          <p className="report-meta">Generated {formatDayKey(dayKey())}</p>
        </header>

        {numeric.length > 0 && (
          <table className="report-table report-summary">
            <thead>
              <tr><th>Measure</th><th>Average</th><th>Low</th><th>High</th><th>Target</th><th>In target</th></tr>
            </thead>
            <tbody>
              {numeric.map(f => {
                const sum = fieldSummary(readings, definition, f)
                return (
                  <tr key={f.key}>
                    <td>{f.label}{f.unit && <span className="report-unit"> ({f.unit})</span>}</td>
                    <td><b>{sum ? sum.avg : '—'}</b></td>
                    <td>{sum ? +sum.min.toFixed(1) : '—'}</td>
                    <td>{sum ? +sum.max.toFixed(1) : '—'}</td>
                    <td>{sum?.target ? `${sum.target.symbol} ${sum.target.value}` : '—'}</td>
                    <td>{sum?.inTarget != null ? `${Math.round(sum.inTarget * 100)}%` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {numeric.length > 0 && (
          <div className="report-chart">
            <ReadingChart definition={definition} readings={readings} rangeDays={rangeDays} />
          </div>
        )}

        <table className="report-table">
          <thead>
            <tr>
              <th>Date</th><th>Time</th>
              {(definition.fields || []).map(f => <th key={f.key}>{f.label}{f.unit && <span className="report-unit"> ({f.unit})</span>}</th>)}
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.id} className={readingScoreClass(r, definition)}>
                <td>{formatDayKey(dayKey(new Date(r.timestamp)))}</td>
                <td>{formatTime(r.timestamp)}</td>
                {(definition.fields || []).map(f => <td key={f.key}>{formatFieldValue(f, getFieldValue(r, definition, f)) ?? '—'}</td>)}
                <td className="report-notes">{r.notes || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="report-footer">Readings recorded by the patient in DataNurse. Not a medical device.</p>
      </div>
    </div>,
    document.body
  )
}

// Change against the previous window of the same length. With a target, the
// direction that moves towards it is shown as good.
