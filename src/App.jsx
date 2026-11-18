import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { logout, onAuthChange, subscribeReadings, addReading, updateReading, deleteReading, seedSampleData, deleteAllData, subscribeDefinitions, addDefinition, updateDefinition, deleteDefinition, subscribeGlobalDefinitions, getSeededDefinitionIds, seedUserDefinitions, subscribeMedications, addMedication, updateMedication, deleteMedication, subscribeMedicationLogs, setMedicationDose, clearMedicationDose } from './firebase'
import { readingDefinitionId } from './definitions'
import { slotLabel, dayKey, takenAtFor } from './medications'
import { readingsToCsv, downloadText, exportFilename } from './exporting'
import { loadReminderSettings, saveReminderSettings, useDoseReminders } from './reminders'
import { ReadingForm, QuickAddModal, EditReadingModal } from './components/ReadingForms'
import { ReadingsCard } from './components/ReadingsList'
import { ReadingChart, CorrelationChart } from './components/charts'
import { LoginScreen, SkeletonReadings, SkeletonStatCards, SkeletonChart, Toast, BrandMark, PageHeader, Sidebar } from './components/chrome'
import { MenuIcon } from './components/icons'
import { SETTINGS_PAGES } from './components/settingsPages'
import { DefinitionStats, StatCards } from './components/stats'
import { useToast } from './hooks/useToast'
import { ReadingTypesSettings } from './pages/ReadingTypesSettings'
import { ReminderSettings, MedicationsSettings, MedicationPage, MedicationHomeCards } from './pages/medications'
import { DataSettings, AccountSettings } from './pages/settings'
import { DEFINITION_COLORS } from './utils/chartTheme'
import { formatDayKey } from './utils/format'
import './App.css'

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
  const { toasts, show: showToast, dismiss: dismissToast } = useToast()
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

  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [reminderSettings, setReminderSettings] = useState(loadReminderSettings)
  const changeReminderSettings = useCallback((next) => {
    setReminderSettings(next)
    saveReminderSettings(next)
  }, [])
  const onRemind = useCallback((med, slot) => showToast(`Time for ${med.name} · ${slotLabel(slot)} dose`), [showToast])
  useDoseReminders(user ? medications : [], medicationLogs, reminderSettings, onRemind)

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

  // One chart per (host, correlated) pair, skipping partners that are gone,
  // switched off, or have nothing recorded yet.
  const correlationPairs = useMemo(() => {
    const withData = new Set(
      enabledDefinitions.filter(d => readings.some(r => readingDefinitionId(r) === d.id)).map(d => d.id)
    )
    const pairs = []
    definitions.forEach(base => {
      if (!base.enabled || !withData.has(base.id)) return
      ;(base.correlations || []).forEach(otherId => {
        const other = definitions.find(d => d.id === otherId)
        if (other?.enabled && withData.has(otherId)) pairs.push({ base, other })
      })
    })
    return pairs
  }, [definitions, enabledDefinitions, readings])

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
    const removed = readings.find(r => r.id === id)
    await deleteReading(user.uid, id)
    showToast('Reading deleted', 'success', removed && {
      label: 'Undo',
      onClick: () => {
        const { id: readingId, ...data } = removed
        updateReading(user.uid, readingId, data)
          .then(() => showToast('Reading restored'))
          .catch(() => showToast('Couldn’t restore the reading', 'error'))
      },
    })
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

  async function handleSetCorrelations(definition, correlations) {
    const { id, ...stored } = definition
    await updateDefinition(user.uid, id, { ...stored, correlations })
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
      await setMedicationDose(user.uid, medication.id, day, slot, takenAtFor(day, slot))
      showToast(day === dayKey() ? `${slotLabel(slot)} dose logged` : `${slotLabel(slot)} dose logged for ${formatDayKey(day)}`)
    }
  }

  async function handleDeleteAllData() {
    await deleteAllData(user.uid)
    showToast('All readings and dose logs deleted', 'error')
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
      <Toast toasts={toasts} onDismiss={dismissToast} />
      {quickAddOpen && (
        <QuickAddModal
          definitions={enabledDefinitions}
          onAdd={handleAddReading}
          onClose={() => setQuickAddOpen(false)}
        />
      )}
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
              <BrandMark />
              <div className="brand-text">
                <span className="brand-name">DataNurse</span>
                <span className="brand-tagline">Health Monitoring System</span>
              </div>
            </div>
          </div>
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
          <main key={page} className="main-content main-content-single page-enter">
            <PageHeader eyebrow="Settings" title={SETTINGS_PAGES.find(p => p.id === page)?.label || 'Settings'} />
            {settingsPage === 'readings' && (
              <ReadingTypesSettings
                definitions={definitions}
                counts={counts}
                onCreate={handleCreateDefinition}
                onUpdate={handleUpdateDefinition}
                onDelete={handleDeleteDefinition}
                onToggle={handleToggleDefinition}
                onSetCorrelations={handleSetCorrelations}
              />
            )}
            {settingsPage === 'medications' && (
              <ReminderSettings settings={reminderSettings} onChange={changeReminderSettings} />
            )}
            {settingsPage === 'medications' && (
              <MedicationsSettings
                medications={medications}
                onCreate={handleCreateMedication}
                onUpdate={handleUpdateMedication}
                onDelete={handleDeleteMedication}
                onToggle={handleToggleMedication}
              />
            )}
            {settingsPage === 'data' && (
              <DataSettings
                onDeleteData={handleDeleteAllData}
                onSeedData={handleSeedData}
                readingCount={readings.length}
                onExport={() => downloadText(exportFilename('all-readings'), readingsToCsv(readings, definitionById))}
              />
            )}
            {settingsPage === 'account' && (
              <AccountSettings user={user} onLogout={logout} />
            )}
          </main>
        ) : activeMedication ? (
          <main key={page} className="main-content main-content-stacked page-enter">
            <PageHeader eyebrow="Medication" title={activeMedication.name} />
            <MedicationPage
              medication={activeMedication}
              logs={medicationLogs}
              onToggleDose={handleToggleDose}
            />
          </main>
        ) : activeDefinition ? (
          /* Individual dashboard: stats, chart then readings on the left, with
             the entry form alongside. */
          <main key={page} className="main-content page-enter">
            <div className="panel-left">
              <PageHeader eyebrow="Reading" title={activeDefinition.name} color={activeDefinition.color} />

              {dataLoading ? (
                <>
                  <SkeletonStatCards />
                  <SkeletonChart />
                  <SkeletonReadings />
                </>
              ) : (
                <>
                  <DefinitionStats key={activeDefinition.id} definition={activeDefinition} readingsByDefinition={readingsByDefinition} />
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
          <main key={page} className="main-content main-content-stacked page-enter">
            {enabledMedications.length > 0 && (
              <>
                <PageHeader eyebrow="Today" title="Medications" />
                <MedicationHomeCards
                  medications={enabledMedications}
                  logs={medicationLogs}
                  onOpen={m => handleSelectPage(`med:${m.id}`)}
                />
              </>
            )}

            {enabledMedications.length === 0 && <PageHeader eyebrow="Overview" title="Your health" />}
            <div className="section-row">
              <h3 className="section-title">Readings</h3>
              {enabledDefinitions.length > 0 && (
                <button type="button" className="btn-add-reading" onClick={() => setQuickAddOpen(true)}>
                  <span aria-hidden="true">+</span> Add reading
                </button>
              )}
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
                  {correlationPairs.map(({ base, other }) => (
                    <CorrelationChart
                      key={`${base.id}-${other.id}`}
                      base={base}
                      other={other}
                      readingsByDefinition={readingsByDefinition}
                    />
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
