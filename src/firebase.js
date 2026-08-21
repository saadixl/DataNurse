import { initializeApp, getApps, getApp } from "firebase/app"
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged } from "firebase/auth"
import { getDatabase, ref, push, remove, set, update, get, onValue, query, orderByChild } from "firebase/database"
import { GLOBAL_DEFINITIONS, normalizeDefinition } from "./definitions"
import { normalizeMedication, logKey } from "./medications"

const firebaseConfig = {
  apiKey: "AIzaSyBM3xz7rh-qN-_LyUqJBF1LoXy94klFOec",
  authDomain: "datanurse-app.firebaseapp.com",
  projectId: "datanurse-app",
  storageBucket: "datanurse-app.firebasestorage.app",
  messagingSenderId: "964661041043",
  appId: "1:964661041043:web:b3d34f413eaf1c8a1e7a66",
  measurementId: "G-542RDHWJLQ",
  databaseURL: "https://datanurse-app-default-rtdb.firebaseio.com"
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getDatabase(app)
const googleProvider = new GoogleAuthProvider()

export function loginWithGoogle() {
  const isMobile = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Macintosh') && 'ontouchend' in document)
  if (isMobile) {
    return signInWithRedirect(auth, googleProvider)
  }
  return signInWithPopup(auth, googleProvider)
}

export function logout() {
  return signOut(auth)
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback)
}

export function subscribeReadings(uid, callback) {
  const readingsRef = query(ref(db, `users/${uid}/readings`), orderByChild("timestamp"))
  return onValue(readingsRef, snapshot => {
    const readings = []
    snapshot.forEach(child => {
      readings.push({ id: child.key, ...child.val() })
    })
    readings.reverse()
    callback(readings)
  })
}

export function addReading(uid, reading) {
  return push(ref(db, `users/${uid}/readings`), reading)
}

export function updateReading(uid, readingId, data) {
  return set(ref(db, `users/${uid}/readings/${readingId}`), data)
}

export function deleteReading(uid, readingId) {
  return remove(ref(db, `users/${uid}/readings/${readingId}`))
}

export function subscribeDefinitions(uid, callback) {
  return onValue(ref(db, `users/${uid}/reading-definitions`), snapshot => {
    const definitions = []
    snapshot.forEach(child => {
      const def = normalizeDefinition(child.key, child.val())
      if (def) definitions.push(def)
    })
    definitions.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
    callback(definitions)
  })
}

export function addDefinition(uid, definition) {
  return push(ref(db, `users/${uid}/reading-definitions`), definition)
}

export function updateDefinition(uid, definitionId, definition) {
  return set(ref(db, `users/${uid}/reading-definitions/${definitionId}`), definition)
}

export function deleteDefinition(uid, definitionId) {
  return remove(ref(db, `users/${uid}/reading-definitions/${definitionId}`))
}

// Built-in reading types shared by every user. Falls back to the bundled copy
// so the app still works if /global-definitions has not been seeded yet.
// Ids of global definitions already copied to this user. Recorded separately
// from the copies themselves so deleting a copy does not bring it back on the
// next login — only genuinely new global types get seeded.
export async function getSeededDefinitionIds(uid) {
  const snapshot = await get(ref(db, `users/${uid}/seeded-definitions`))
  return snapshot.exists() ? Object.keys(snapshot.val()) : []
}

// Writes each copy at the global definition's own key so readings already
// stored under that type keep resolving to it.
export function seedUserDefinitions(uid, definitions) {
  const now = new Date().toISOString()
  const updates = {}
  definitions.forEach(definition => {
    const { id, ...value } = definition
    updates[`users/${uid}/reading-definitions/${id}`] = { ...value, sourceId: id, seededAt: now }
    updates[`users/${uid}/seeded-definitions/${id}`] = now
  })
  return update(ref(db), updates)
}

export function subscribeGlobalDefinitions(callback) {
  return onValue(ref(db, "global-definitions"), snapshot => {
    const raw = snapshot.val() || GLOBAL_DEFINITIONS
    const definitions = Object.keys(raw)
      .map(id => normalizeDefinition(id, raw[id]))
      .filter(Boolean)
      .sort((a, b) => (a.order || 99) - (b.order || 99))
    callback(definitions)
  }, () => {
    callback(Object.keys(GLOBAL_DEFINITIONS)
      .map(id => normalizeDefinition(id, GLOBAL_DEFINITIONS[id]))
      .sort((a, b) => (a.order || 99) - (b.order || 99)))
  })
}

export function subscribeMedications(uid, callback) {
  return onValue(ref(db, `users/${uid}/medications`), snapshot => {
    const medications = []
    snapshot.forEach(child => {
      const med = normalizeMedication(child.key, child.val())
      if (med) medications.push(med)
    })
    medications.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
    callback(medications)
  })
}

export function addMedication(uid, medication) {
  return push(ref(db, `users/${uid}/medications`), medication)
}

export function updateMedication(uid, medicationId, medication) {
  return set(ref(db, `users/${uid}/medications/${medicationId}`), medication)
}

// Removing a medication takes its dose history with it.
export async function deleteMedication(uid, medicationId) {
  const snapshot = await get(ref(db, `users/${uid}/medication-logs`))
  const updates = { [`users/${uid}/medications/${medicationId}`]: null }
  snapshot.forEach(child => {
    if (child.val()?.medicationId === medicationId) {
      updates[`users/${uid}/medication-logs/${child.key}`] = null
    }
  })
  return update(ref(db), updates)
}

export function subscribeMedicationLogs(uid, callback) {
  return onValue(ref(db, `users/${uid}/medication-logs`), snapshot => {
    callback(snapshot.val() || {})
  })
}

// Keyed by medication + day + slot, so ticking is idempotent.
export function setMedicationDose(uid, medicationId, day, slot, takenAt) {
  return set(ref(db, `users/${uid}/medication-logs/${logKey(medicationId, day, slot)}`), {
    medicationId, day, slot, takenAt,
  })
}

export function clearMedicationDose(uid, medicationId, day, slot) {
  return remove(ref(db, `users/${uid}/medication-logs/${logKey(medicationId, day, slot)}`))
}

export function deleteAllData(uid) {
  return remove(ref(db, `users/${uid}/readings`))
}

export function seedSampleData(uid) {
  const bpNotes = ['', '', '', 'after coffee', 'resting', 'after walk', 'morning check', '']
  const bgNotes = ['', '', '', 'felt tired', 'after snack', 'before lunch', '']
  const promises = []
  const now = Date.now()

  for (let day = 30; day >= 0; day--) {
    const baseDate = new Date(now - day * 86400000)

    // Morning BP — 7:00-9:00am
    const bpMorning = new Date(baseDate)
    bpMorning.setHours(7 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60), 0, 0)
    promises.push(push(ref(db, `users/${uid}/readings`), {
      type: 'bp',
      systolic: 115 + Math.floor(Math.random() * 25),
      diastolic: 72 + Math.floor(Math.random() * 16),
      pulse: 62 + Math.floor(Math.random() * 20),
      notes: bpNotes[Math.floor(Math.random() * bpNotes.length)],
      timestamp: bpMorning.toISOString(),
    }))

    // Evening BP — 6:00-10:00pm (some days only)
    if (Math.random() > 0.35) {
      const bpEvening = new Date(baseDate)
      bpEvening.setHours(18 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 60), 0, 0)
      promises.push(push(ref(db, `users/${uid}/readings`), {
        type: 'bp',
        systolic: 118 + Math.floor(Math.random() * 22),
        diastolic: 74 + Math.floor(Math.random() * 14),
        pulse: 65 + Math.floor(Math.random() * 18),
        notes: bpNotes[Math.floor(Math.random() * bpNotes.length)],
        timestamp: bpEvening.toISOString(),
      }))
    }

    // Fasting glucose — 6:00-8:00am
    const bgFasting = new Date(baseDate)
    bgFasting.setHours(6 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60), 0, 0)
    promises.push(push(ref(db, `users/${uid}/readings`), {
      type: 'glucose',
      glucose: +(4.5 + Math.random() * 2.5).toFixed(1),
      meal: 'fasting',
      notes: bgNotes[Math.floor(Math.random() * bgNotes.length)],
      timestamp: bgFasting.toISOString(),
    }))

    // After-meal glucose — 12:00-2:00pm (most days)
    if (Math.random() > 0.25) {
      const bgLunch = new Date(baseDate)
      bgLunch.setHours(12 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60), 0, 0)
      promises.push(push(ref(db, `users/${uid}/readings`), {
        type: 'glucose',
        glucose: +(6.0 + Math.random() * 3.5).toFixed(1),
        meal: 'after_meal',
        notes: bgNotes[Math.floor(Math.random() * bgNotes.length)],
        timestamp: bgLunch.toISOString(),
      }))
    }

    // Bedtime glucose — some days
    if (Math.random() > 0.6) {
      const bgBed = new Date(baseDate)
      bgBed.setHours(21 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60), 0, 0)
      promises.push(push(ref(db, `users/${uid}/readings`), {
        type: 'glucose',
        glucose: +(5.0 + Math.random() * 3.0).toFixed(1),
        meal: 'bedtime',
        notes: bgNotes[Math.floor(Math.random() * bgNotes.length)],
        timestamp: bgBed.toISOString(),
      }))
    }
  }

  return Promise.all(promises)
}

export { auth, db }
