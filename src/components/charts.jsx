import { useMemo } from 'react'
import { targetFor, meetsTarget, numericFields, getFieldValue } from '../definitions'
import { BarChart, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine, Cell } from 'recharts'
import { OVER_TARGET_COLOR, fieldColor, chartTooltipStyle, chartTooltipLabelStyle, chartTooltipItemStyle, weekStart, WEEKLY_AFTER_DAYS, collectDailyValues } from '../utils/chartTheme'
import { formatShortDate } from '../utils/format'

export function ReadingChart({ readings, definition, rangeDays }) {
  const numeric = numericFields(definition)

  const inRange = useMemo(() => {
    if (!rangeDays || rangeDays === Infinity) return readings
    const cutoff = Date.now() - rangeDays * 86400000
    return readings.filter(r => new Date(r.timestamp).getTime() >= cutoff)
  }, [readings, rangeDays])

  // Weekly bars once the readings span more than WEEKLY_AFTER_DAYS.
  const weekly = useMemo(() => {
    if (!rangeDays || inRange.length < 2) return false
    const times = inRange.map(r => new Date(r.timestamp).getTime())
    return (Math.max(...times) - Math.min(...times)) / 86400000 > WEEKLY_AFTER_DAYS
  }, [inRange, rangeDays])

  const data = useMemo(() => {
    if (numeric.length === 0) return []
    const byDay = {}
    inRange.forEach(r => {
      const day = weekly ? weekStart(r.timestamp).toDateString() : new Date(r.timestamp).toDateString()
      if (!byDay[day]) byDay[day] = { timestamp: weekly ? weekStart(r.timestamp).toISOString() : r.timestamp, values: {} }
      numeric.forEach(f => {
        const v = getFieldValue(r, definition, f)
        if (typeof v === 'number' && Number.isFinite(v)) {
          (byDay[day].values[f.key] ||= []).push(v)
        }
      })
    })
    return Object.values(byDay)
      .map(day => {
        const point = { date: `${weekly ? 'Wk of ' : ''}${formatShortDate(day.timestamp)}`, sortKey: new Date(day.timestamp).getTime() }
        numeric.forEach(f => {
          const vals = day.values[f.key]
          point[f.key] = vals?.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null
        })
        return point
      })
      .sort((a, b) => a.sortKey - b.sortKey)
      .slice(rangeDays ? 0 : -14)
  }, [inRange, definition, numeric, weekly, rangeDays])

  const title = !rangeDays
    ? 'Last 14 days'
    : rangeDays === Infinity ? 'All time' : `Last ${rangeDays} days`

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
    return (
      <div className="chart-empty">
        {rangeDays ? `No ${definition.name.toLowerCase()} readings in this range` : `No ${definition.name.toLowerCase()} data to chart`}
      </div>
    )
  }

  return (
    <div className="chart-card">
      <h3 className="chart-title">
        <span className="dot" style={{ background: definition.color || 'var(--accent)' }} />
        {definition.name} — {title}
        {weekly && <span className="chart-title-note">weekly averages</span>}
      </h3>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} barGap={2} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: '#6c7282', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false} />
            <YAxis
              domain={bounds}
              tick={{ fill: '#6c7282', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={38}
            />
            <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px', color: '#a6abb8' }} />
            {numeric.map((f, i) => {
              const target = targetFor(f)
              return (
                <Bar key={f.key} dataKey={f.key} name={f.label} radius={[6, 6, 2, 2]}>
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

// Daily averages for one definition's numeric fields, keyed with a prefix so
// two definitions can share a chart without their field keys colliding.
export function CorrelationChart({ base, other, readingsByDefinition }) {
  const baseFields = numericFields(base)
  const otherFields = numericFields(other)

  const data = useMemo(() => {
    const byDay = {}
    collectDailyValues(byDay, base, readingsByDefinition[base.id] || [], 'a_')
    collectDailyValues(byDay, other, readingsByDefinition[other.id] || [], 'b_')
    return Object.values(byDay)
      .map(day => {
        const point = { date: formatShortDate(day.timestamp), sortKey: new Date(day.timestamp).getTime() }
        const avg = (key) => {
          const vals = day.values[key]
          return vals?.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null
        }
        baseFields.forEach(f => { point['a_' + f.key] = avg('a_' + f.key) })
        otherFields.forEach(f => { point['b_' + f.key] = avg('b_' + f.key) })
        return point
      })
      .sort((a, b) => a.sortKey - b.sortKey)
      .slice(-14)
  }, [base, other, readingsByDefinition, baseFields, otherFields])

  if (baseFields.length === 0 || otherFields.length === 0) {
    return (
      <div className="chart-empty">
        {base.name} and {other.name} both need a number field to be compared.
      </div>
    )
  }
  if (data.length === 0) {
    return <div className="chart-empty">No data to compare {base.name} with {other.name}</div>
  }

  return (
    <div className="chart-card">
      <h3 className="chart-title">
        <span className="dot" style={{ background: base.chartColor || base.color || 'var(--accent)' }} />
        <span className="dot" style={{ background: other.chartColor || other.color || 'var(--accent)' }} />
        {base.name} vs {other.name}
      </h3>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data} barGap={2} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: '#6c7282', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false} />
            <YAxis yAxisId="base" domain={[0, 'auto']} tick={{ fill: '#6c7282', fontSize: 11 }} axisLine={false} tickLine={false} width={38} />
            <YAxis yAxisId="other" orientation="right" domain={[0, 'auto']} tick={{ fill: '#6c7282', fontSize: 11 }} axisLine={false} tickLine={false} width={38} />
            <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px', color: '#a6abb8' }} />
            {baseFields.map((f, i) => (
              <Bar
                key={f.key}
                yAxisId="base"
                dataKey={'a_' + f.key}
                name={f.label}
                fill={fieldColor(base, i)}
                radius={[6, 6, 2, 2]}
              />
            ))}
            {otherFields.map((f, i) => (
              <Line
                key={f.key}
                yAxisId="other"
                type="monotone"
                dataKey={'b_' + f.key}
                name={`${other.name} ${f.label}`}
                stroke={fieldColor(other, i)}
                strokeWidth={2.5}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ---------- Reading type builder ---------- */
