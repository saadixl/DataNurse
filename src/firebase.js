import { initializeApp, getApps, getApp } from "firebase/app"
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth"
import { getDatabase, ref, push, remove, set, onValue, query, orderByChild } from "firebase/database"

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

export function subscribeTargets(uid, callback) {
  return onValue(ref(db, `users/${uid}/targets`), snapshot => {
    callback(snapshot.val() || {})
  })
}

export function saveTargets(uid, targets) {
  return set(ref(db, `users/${uid}/targets`), targets)
}

export function deleteAllData(uid) {
  return remove(ref(db, `users/${uid}`))
}

export function seedSampleData(uid) {
  const meals = ['fasting', 'before_meal', 'after_meal', 'bedtime']
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

  promises.push(set(ref(db, `users/${uid}/targets`), {
    systolic: 120,
    diastolic: 80,
    glucose: 5.5,
    bpEnabled: true,
    glucoseEnabled: true,
  }))

  return Promise.all(promises)
}

export { auth, db }
