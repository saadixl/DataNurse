import { useState, useCallback } from 'react'

export function useToast() {
  const [toasts, setToasts] = useState([])
  const dismiss = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), [])
  const show = useCallback((message, type = 'success', action = null) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type, action }])
    setTimeout(() => dismiss(id), action ? 6000 : 3000)
  }, [dismiss])
  return { toasts, show, dismiss }
}
