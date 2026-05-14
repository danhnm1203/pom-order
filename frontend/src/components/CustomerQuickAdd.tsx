import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { apiClient, ApiException } from '@/lib/api-client'
import type { Customer } from '@/types/api'

interface CustomerQuickAddProps {
  onCreated: (customer: Customer) => void
  onCancel: () => void
}

/**
 * Inline customer-create form for the New Order flow.
 * Submits → returns the created customer to the parent (which auto-selects it).
 */
export function CustomerQuickAdd({ onCreated, onCancel }: CustomerQuickAddProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [zalo, setZalo] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    e.stopPropagation()
    setSubmitting(true)
    setError(null)
    try {
      const contacts = [
        zalo ? { channel: 'zalo' as const, value: zalo, is_primary: true } : null,
        phone ? { channel: 'phone' as const, value: phone, is_primary: !zalo } : null,
      ].filter(Boolean)
      const created = await apiClient.post<Customer>('/api/v1/customers', {
        name: name.trim(),
        notes: null,
        contacts,
      })
      onCreated(created)
    } catch (err) {
      setError(err instanceof ApiException ? err.message : t('customer.create_error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-surface-2 border border-border rounded-md p-3 mt-2 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
          {t('order.new_customer_form_title')}
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-fg-subtle hover:text-fg"
        >
          ✕
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          type="text"
          required
          autoFocus
          placeholder={t('customer.name_placeholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="px-2 py-1.5 border border-border rounded-md text-sm"
        />
        <input
          type="text"
          placeholder={t('customer.zalo')}
          value={zalo}
          onChange={(e) => setZalo(e.target.value)}
          className="px-2 py-1.5 border border-border rounded-md text-sm"
        />
        <input
          type="text"
          placeholder={t('customer.phone')}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="px-2 py-1.5 border border-border rounded-md text-sm"
        />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={submitting || !name.trim()}
          className="px-3 py-1.5 bg-accent text-accent-fg rounded-md text-sm font-semibold hover:bg-accent-hover disabled:opacity-50"
        >
          {submitting ? t('customer.saving') : t('customer.save_customer')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-fg-muted hover:text-fg"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}
