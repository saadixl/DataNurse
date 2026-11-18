import { useState, useMemo } from 'react'
import { averageDays, targetFor, meetsTarget, numericFields, getFieldValue } from '../definitions'
import { readingsToCsv, downloadText, exportFilename } from '../exporting'
import { ReadingReport } from './ReadingReport'
import { ReadingChart } from './LazyCharts'
import { AVERAGE_RANGES, rangeLabel, defaultAverageRange, loadAverageRange, saveAverageRange } from '../utils/ranges'

function AverageRangePicker({ value, onChange, options }) {
  return (
    <div className="tabs range-picker" role="radiogroup" aria-label="Time range">
      {options.map(days => (
        <button
          key={days}
          type="button"
          role="radio"
          aria-checked={value === days}
          className={`tab ${value === days ? 'active' : ''}`}
          onClick={() => onChange(days)}
        >
          {rangeLabel(days)}
        </button>
      ))}
    </div>
  )
}

// A definition's average cards and chart, with a picker above them to change the window.
export function DefinitionStats({ definition, readingsByDefinition }) {
  const readings = readingsByDefinition[definition.id] || []
  const [range, setRange] = useState(() => loadAverageRange(definition))
  const [reportOpen, setReportOpen] = useState(false)
  const options = useMemo(() => {
    const own = defaultAverageRange(definition)
    return AVERAGE_RANGES.includes(own) ? AVERAGE_RANGES : [own, ...AVERAGE_RANGES].sort((a, b) => a - b)
  }, [definition])
  const change = (days) => {
    setRange(days)
    saveAverageRange(definition, days)
  }

  const inRange = range === Infinity
    ? readings
    : readings.filter(r => new Date(r.timestamp).getTime() >= Date.now() - range * 86400000)

  const exportCsv = () => {
    downloadText(exportFilename(definition.name), readingsToCsv(inRange, { [definition.id]: definition }))
  }

  return (
    <>
      <div className="range-row">
        <AverageRangePicker value={range} onChange={change} options={options.includes(range) ? options : [range, ...options].sort((a, b) => a - b)} />
        <div className="export-actions">
          <button type="button" className="btn-chip" onClick={exportCsv} disabled={inRange.length === 0} title="Download these readings as a spreadsheet">
            CSV
          </button>
          <button type="button" className="btn-chip" onClick={() => setReportOpen(true)} disabled={inRange.length === 0} title="A printable summary for your doctor">
            Report
          </button>
        </div>
      </div>
      <StatCards definitions={[definition]} readingsByDefinition={readingsByDefinition} rangeDays={range} />
      <ReadingChart definition={definition} readings={readings} rangeDays={range} />
      {reportOpen && (
        <ReadingReport definition={definition} readings={inRange} rangeDays={range} onClose={() => setReportOpen(false)} />
      )}
    </>
  )
}

// rangeDays overrides each field's own window (Infinity = all readings).
export function StatCards({ definitions, readingsByDefinition, rangeDays }) {
  const cards = useMemo(() => {
    const now = Date.now()
    return definitions.flatMap(definition =>
      numericFields(definition)
        .map(field => ({ definition, field, days: averageDays(field) }))
        .filter(c => c.days > 0)
        .map(c => (rangeDays ? { ...c, days: rangeDays } : c))
        .map(({ field, days }) => {
          const span = days * 86400000
          const cutoff = days === Infinity ? -Infinity : now - span
          const points = (readingsByDefinition[definition.id] || [])
            .map(r => ({ t: new Date(r.timestamp).getTime(), v: getFieldValue(r, definition, field) }))
            .filter(p => typeof p.v === 'number' && Number.isFinite(p.v))
          const values = points.filter(p => p.t >= cutoff).map(p => p.v)
          // The window of the same length just before this one, for the trend.
          const previous = days === Infinity ? [] : points.filter(p => p.t >= cutoff - span && p.t < cutoff).map(p => p.v)
          const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null)
          const avg = values.length ? +mean(values).toFixed(1) : null
          const prevAvg = mean(previous)
          const target = targetFor(field)
          const inTarget = target && values.length ? values.filter(v => meetsTarget(v, target)).length / values.length : null
          return {
            id: `${definition.id}:${field.key}`,
            field,
            days,
            avg,
            count: values.length,
            min: values.length ? Math.min(...values) : null,
            max: values.length ? Math.max(...values) : null,
            delta: avg !== null && prevAvg !== null ? +(avg - prevAvg).toFixed(1) : null,
            target,
            inTarget,
            missed: meetsTarget(avg, target) === false,
          }
        })
    )
  }, [definitions, readingsByDefinition, rangeDays])

  if (cards.length === 0) return null

  return (
    <div className="stat-cards">
      {cards.map(c => (
        <div className={`stat-card ${c.missed ? 'stat-over' : ''}`} key={c.id}>
          <div className="stat-label">Avg {c.field.label}</div>
          <div className="stat-value">
            {c.avg !== null ? <>{c.avg} {c.field.unit && <span className="stat-unit">{c.field.unit}</span>}</> : '—'}
          </div>
          {c.delta !== null && <TrendLine delta={c.delta} days={c.days} unit={c.field.unit} target={c.target} />}
          <div className="stat-sub">{c.days === Infinity ? 'All-time' : `${c.days}-day`} avg · {c.count} {c.count === 1 ? 'reading' : 'readings'}</div>
          {c.min !== null && c.count > 1 && (
            <div className="stat-range">
              <span>Low <b>{+c.min.toFixed(1)}</b></span>
              <span>High <b>{+c.max.toFixed(1)}</b></span>
            </div>
          )}
          {c.target && (
            <div className="stat-target">
              Target {c.target.symbol} {c.target.value}
              {c.inTarget !== null && <> · <b className={c.inTarget >= 0.7 ? 'in-target-good' : 'in-target-low'}>{Math.round(c.inTarget * 100)}%</b> in target</>}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// Monday of the week a timestamp falls in, as a local date string.
function TrendLine({ delta, days, unit, target }) {
  const flat = Math.abs(delta) < 0.05
  const better = target ? (target.direction === 'max' ? delta < 0 : delta > 0) : null
  const tone = flat || better === null ? 'trend-flat' : better ? 'trend-good' : 'trend-bad'
  return (
    <div className={`stat-trend ${tone}`}>
      {flat ? '→ no change' : <>{delta > 0 ? '▲' : '▼'} {Math.abs(delta)}{unit ? ` ${unit}` : ''}</>}
      <span className="stat-trend-vs"> vs previous {days} days</span>
    </div>
  )
}

// rangeDays limits the chart to that window (Infinity = all readings);
// without it the chart shows the last 14 days that have readings.
