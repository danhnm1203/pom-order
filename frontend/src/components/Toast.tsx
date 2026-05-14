import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type ToastKind = 'success' | 'error' | 'info'

interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ToastContextValue {
  show: (kind: ToastKind, message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const show = useCallback((kind: ToastKind, message: string) => {
    const id = nextId++
    setToasts((prev) => [...prev, { id, kind, message }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        className="fixed bottom-20 md:bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm"
        role="region"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto rounded-md px-4 py-3 text-sm shadow-md border ${
              t.kind === 'success'
                ? 'bg-success-bg border-success/20 text-success'
                : t.kind === 'error'
                  ? 'bg-danger-bg border-danger/20 text-danger'
                  : 'bg-surface border-border text-fg'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

/**
 * Hook returning helpers that mimic native alert() signatures so existing
 * call sites can swap in with minimal churn.
 */
export function useNotify() {
  const { show } = useToast()
  return {
    success: useCallback((msg: string) => show('success', msg), [show]),
    error: useCallback((msg: string) => show('error', msg), [show]),
    info: useCallback((msg: string) => show('info', msg), [show]),
  }
}

