import { useCallback, useEffect, useRef, useState } from 'react'
import './network-guard.css'

export function useNetworkGuard() {
  const [online, setOnline] = useState(() => navigator.onLine !== false)
  const [toast, setToast] = useState(null)
  const timersRef = useRef({ leave: null, clear: null })
  const toastIdRef = useRef(0)

  const clearTimers = useCallback(() => {
    const timers = timersRef.current
    if (timers.leave) window.clearTimeout(timers.leave)
    if (timers.clear) window.clearTimeout(timers.clear)
    timers.leave = null
    timers.clear = null
  }, [])

  const showOfflineToast = useCallback((action = '이 작업을 계속') => {
    clearTimers()
    const id = toastIdRef.current + 1
    toastIdRef.current = id
    setToast({
      id,
      message: `${action}하려면 인터넷에 연결해야 해.`,
      leaving: false,
    })

    timersRef.current.leave = window.setTimeout(() => {
      setToast((current) => current?.id === id ? { ...current, leaving: true } : current)
    }, 2000)
    timersRef.current.clear = window.setTimeout(() => {
      setToast((current) => current?.id === id ? null : current)
    }, 2280)
  }, [clearTimers])

  const requireOnline = useCallback((action) => {
    if (navigator.onLine !== false) {
      setOnline(true)
      return true
    }
    setOnline(false)
    showOfflineToast(action)
    return false
  }, [showOfflineToast])

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearTimers()
    }
  }, [clearTimers])

  return { online, toast, requireOnline }
}

export function OfflineToast({ toast }) {
  if (!toast) return null
  return (
    <div
      className={`school-offline-toast ${toast.leaving ? 'is-leaving' : ''}`.trim()}
      role="status"
      aria-live="polite"
    >
      {toast.message}
    </div>
  )
}
