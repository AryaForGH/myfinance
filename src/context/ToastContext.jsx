import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from './I18nContext.js'
import { ToastContext } from './ToastContext.js'

export function ToastProvider({ children }) {
  const { t } = useI18n()
  const [items, setItems] = useState([])
  const timers = useRef(new Map())
  const removalTimers = useRef(new Map())

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setItems((current) => current.map((item) => item.id === id ? { ...item, leaving: true } : item))
    removalTimers.current.set(id, setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id))
      removalTimers.current.delete(id)
    }, 180))
  }, [])

  const notify = useCallback((type, message) => {
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
    setItems((current) => [...current, { id, type, message }])
    timers.current.set(id, setTimeout(() => dismiss(id), 5000))
    return id
  }, [dismiss])

  useEffect(() => () => {
    timers.current.forEach(clearTimeout)
    timers.current.clear()
    removalTimers.current.forEach(clearTimeout)
    removalTimers.current.clear()
  }, [])

  const value = useMemo(() => ({ notify }), [notify])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-label={t('toast.region')} className="toast-viewport" aria-live="polite" aria-relevant="additions">
        {items.map((item) => (
          <div className={`toast toast-${item.type}${item.leaving ? ' toast-leaving' : ''}`} key={item.id} role={item.type === 'error' ? 'alert' : 'status'}>
            <span aria-hidden="true" className="toast-icon">
              {item.type === 'success' ? '✓' : item.type === 'error' ? '!' : item.type === 'warning' ? '⚠' : 'i'}
            </span>
            <span className="toast-message">{item.message}</span>
            <button aria-label={t('toast.dismiss')} className="toast-dismiss" onClick={() => dismiss(item.id)} type="button">×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
