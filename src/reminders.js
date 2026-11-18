// Dose reminders: a notification when a scheduled dose's time passes and it
// isn't logged yet. They are checked while DataNurse is open (in a tab or as
// the installed app); there is no push server, so a closed app can't remind.
import { useEffect } from 'react'
import { SLOTS, slotsFor, dayKey, logKey } from './medications'

const SETTINGS_KEY = 'datanurse:reminders'
const SENT_KEY = 'datanurse:reminders-sent'

export const DEFAULT_REMINDER_TIMES = { morning: '08:00', afternoon: '14:00', night: '21:00' }

export const remindersSupported = () => typeof window !== 'undefined' && 'Notification' in window

export function loadReminderSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    return { enabled: Boolean(saved.enabled), times: { ...DEFAULT_REMINDER_TIMES, ...(saved.times || {}) } }
  } catch {
    return { enabled: false, times: { ...DEFAULT_REMINDER_TIMES } }
  }
}

export function saveReminderSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch { /* storage unavailable */ }
}

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* reminders fall back to page notifications */ })
  }
}

async function notify(title, body, tag) {
  const options = { body, tag, icon: '/icon-192.png', badge: '/icon-192.png', data: { url: '/' } }
  const registration = await navigator.serviceWorker?.getRegistration?.()
  if (registration) return registration.showNotification(title, options)
  return new Notification(title, options)
}

function loadSent(today) {
  try {
    const sent = JSON.parse(localStorage.getItem(SENT_KEY) || '{}')
    return sent.day === today ? sent : { day: today, keys: [] }
  } catch {
    return { day: today, keys: [] }
  }
}

const minutesOf = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + (m || 0)
}

/** Every minute, reminds once per dose whose time has passed and isn't logged. */
export function useDoseReminders(medications, logs, settings, onRemind) {
  useEffect(() => {
    if (!settings.enabled || !remindersSupported()) return undefined
    const check = () => {
      if (Notification.permission !== 'granted') return
      const now = new Date()
      const today = dayKey(now)
      const minutes = now.getHours() * 60 + now.getMinutes()
      const sent = loadSent(today)
      medications.filter(m => m.enabled).forEach(med => {
        slotsFor(med.frequency).forEach(slot => {
          const key = logKey(med.id, today, slot.key)
          const due = minutesOf(settings.times[slot.key] || DEFAULT_REMINDER_TIMES[slot.key])
          // Only within two hours of the dose time, so opening the app late
          // in the day doesn't fire a pile of old reminders.
          if (logs[key] || sent.keys.includes(key) || minutes < due || minutes > due + 120) return
          sent.keys.push(key)
          const label = SLOTS.find(s => s.key === slot.key)?.label || slot.key
          notify(`Time for ${med.name}`, `${label} dose${med.dose ? ` · ${med.dose}` : ''}`, key).catch(() => {})
          onRemind?.(med, slot.key)
        })
      })
      try {
        localStorage.setItem(SENT_KEY, JSON.stringify(sent))
      } catch { /* storage unavailable */ }
    }
    check()
    const timer = setInterval(check, 60 * 1000)
    return () => clearInterval(timer)
  }, [medications, logs, settings, onRemind])
}
