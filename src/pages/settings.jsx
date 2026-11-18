import { useState } from 'react'

export function DataSettings({ onDeleteData, onSeedData, onExport, readingCount }) {
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
            <p className="settings-desc">Manage your health readings and sample data.</p>

            <div className="card">
              <div className="danger-action">
                <div>
                  <div className="danger-label">Export readings</div>
                  <div className="danger-desc">Download every reading as a CSV file for a spreadsheet or your doctor. For a single type, use CSV or Report on its page.</div>
                </div>
                <button className="btn-danger-outline btn-neutral-outline" onClick={onExport} disabled={readingCount === 0}>
                  Export CSV
                </button>
              </div>
            </div>
            <div className="card">
              <div className="danger-action">
                <div>
                  <div className="danger-label">Load sample data</div>
                  <div className="danger-desc">Generate a month of readings across four types, plus three medications with dose history.</div>
                </div>
                <button className="btn-danger-outline btn-neutral-outline" onClick={onSeedData}>Load Sample Data</button>
              </div>
            </div>
            <div className="card">
              <div className="danger-action">
                <div>
                  <div className="danger-label">Delete all readings</div>
                  <div className="danger-desc">Remove every reading and dose log. Your reading types and medications are kept. This cannot be undone.</div>
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

export function AccountSettings({ user, onLogout }) {
  return (
    <div className="settings-page">
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
