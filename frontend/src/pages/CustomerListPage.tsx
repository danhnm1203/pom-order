import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { apiClient, ApiException } from '@/lib/api-client'
import type { Customer } from '@/types/api'

export function CustomerListPage() {
  const { t } = useTranslation()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  async function load() {
    setLoading(true)
    const query = search ? `?search=${encodeURIComponent(search)}` : ''
    try {
      const data = await apiClient.get<Customer[]>(`/api/v1/customers${query}`)
      setCustomers(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">{t('customer.title')}</h1>
        <button
          type="button"
          onClick={() => setShowAdd((s) => !s)}
          className="px-4 py-2 bg-accent text-accent-fg rounded-md font-semibold text-sm hover:bg-accent-hover"
        >
          {showAdd ? t('common.cancel') : t('customer.add_new')}
        </button>
      </div>

      {showAdd && (
        <NewCustomerForm
          onCreated={() => {
            setShowAdd(false)
            void load()
          }}
        />
      )}

      <input
        type="search"
        placeholder={t('customer.search_placeholder')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full mb-4 px-3 py-2 border border-border rounded-md text-sm"
      />

      {loading ? (
        <div className="text-fg-subtle text-sm">{t('common.loading')}</div>
      ) : customers.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-8 text-center text-fg-muted">
          {search ? t('customer.no_search_results') : t('customer.empty_state')}
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs font-semibold uppercase text-fg-muted">
              <tr>
                <th className="text-left py-2 px-4">{t('customer.name')}</th>
                <th className="text-left py-2 px-4">{t('customer.contacts')}</th>
                <th className="text-left py-2 px-4">{t('customer.notes')}</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-surface-2">
                  <td className="py-2 px-4 font-medium">{c.name}</td>
                  <td className="py-2 px-4 text-xs text-fg-muted">
                    {c.contacts.map((ct) => `${ct.channel}: ${ct.value}`).join(' · ') || '—'}
                  </td>
                  <td className="py-2 px-4 text-fg-muted">{c.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function NewCustomerForm({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [zalo, setZalo] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const contacts = [
        zalo ? { channel: 'zalo' as const, value: zalo, is_primary: true } : null,
        phone ? { channel: 'phone' as const, value: phone, is_primary: !zalo } : null,
      ].filter(Boolean)
      await apiClient.post('/api/v1/customers', {
        name,
        notes: notes || null,
        contacts,
      })
      setName('')
      setZalo('')
      setPhone('')
      setNotes('')
      onCreated()
    } catch (err) {
      setError(err instanceof ApiException ? err.message : t('customer.create_error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="bg-surface border border-border rounded-lg p-4 mb-4 grid grid-cols-1 md:grid-cols-2 gap-3"
    >
      <input
        type="text"
        required
        placeholder={t('customer.name_placeholder')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="px-3 py-2 border border-border rounded-md text-sm"
      />
      <input
        type="text"
        placeholder={t('customer.zalo')}
        value={zalo}
        onChange={(e) => setZalo(e.target.value)}
        className="px-3 py-2 border border-border rounded-md text-sm"
      />
      <input
        type="text"
        placeholder={t('customer.phone')}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="px-3 py-2 border border-border rounded-md text-sm"
      />
      <input
        type="text"
        placeholder={t('customer.notes')}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="px-3 py-2 border border-border rounded-md text-sm"
      />
      {error && <div className="md:col-span-2 text-sm text-danger">{error}</div>}
      <div className="md:col-span-2">
        <button
          type="submit"
          disabled={submitting || !name}
          className="px-4 py-2 bg-accent text-accent-fg rounded-md font-semibold text-sm hover:bg-accent-hover disabled:opacity-50"
        >
          {submitting ? t('customer.saving') : t('customer.save_customer')}
        </button>
      </div>
    </form>
  )
}
