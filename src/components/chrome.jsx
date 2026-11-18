import { useState, useEffect } from 'react'
import { loginWithGoogle, consumeRedirectError } from '../firebase'
import { dayKey, todayProgress, progressState } from '../medications'
import { HomeIcon } from './icons'
import { SETTINGS_PAGES } from './settingsPages'

export function LoginScreen() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    consumeRedirectError().then(err => {
      if (err && err.code !== 'auth/popup-closed-by-user') {
        setError('Sign-in failed. Please try again.')
      }
    })
  }, [])

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
        <span className="login-logo"><BrandMark size={60} /></span>
        <p className="eyebrow eyebrow-accent">Your health, in numbers</p>
        <h1>DataNurse</h1>
        <p>Track readings and medications, and see how they trend over time.</p>
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

export function SkeletonReadings() {
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

export function SkeletonStatCards() {
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

export function SkeletonChart() {
  return (
    <div className="chart-card">
      <div className="skeleton skeleton-text" style={{ width: 180, height: 14, marginBottom: 16 }} />
      <div className="skeleton skeleton-chart" />
    </div>
  )
}

export function Toast({ toasts, onDismiss }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type || 'success'}${t.action ? ' toast-with-action' : ''}`}>
          <span>{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                t.action.onClick()
                onDismiss(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

// A toast with an action (e.g. Undo) stays longer, so there's time to use it.
export function BrandMark({ size = 32 }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 24 24" width={size * 0.58} height={size * 0.58}>
        <path d="M12 4v16M4 12h16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
        <path d="M3 14h4l2.5-5 4 8 2.5-5H21" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

export function PageHeader({ eyebrow, title, color, lead }) {
  return (
    <header className="page-header">
      {eyebrow && (
        <p className="eyebrow" style={color ? { '--eyebrow-color': color } : undefined}>
          {eyebrow}
        </p>
      )}
      <h2 className="page-title">{title}</h2>
      {lead && <p className="page-lead">{lead}</p>}
    </header>
  )
}

export function Sidebar({ definitions, medications, medicationLogs, page, onSelect, counts, total, open, onClose }) {
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
