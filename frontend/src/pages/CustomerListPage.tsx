import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useNotify } from '@/components/Toast'
import { apiClient, ApiException } from '@/lib/api-client'
import type { Customer } from '@/types/api'

export function CustomerListPage() {
  const { t } = useTranslation()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [seedName, setSeedName] = useState('')

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
    <div className="p-4 md:p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t('customer.title')}</h1>
        <button
          type="button"
          onClick={() => {
            setSeedName('')
            setShowAdd((s) => !s)
          }}
          className="px-4 py-2 bg-accent text-accent-fg rounded-md font-semibold text-sm hover:bg-accent-hover transition-colors"
        >
          {showAdd ? t('common.cancel') : t('customer.add_new')}
        </button>
      </div>

      {showAdd && (
        <NewCustomerForm
          seedName={seedName}
          onCreated={() => {
            setShowAdd(false)
            setSeedName('')
            void load()
          }}
        />
      )}

      <div className="mb-4">
        <label htmlFor="customer-search" className="sr-only">
          {t('customer.search_placeholder')}
        </label>
        <input
          id="customer-search"
          type="search"
          placeholder={t('customer.search_placeholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent"
        />
      </div>

      {loading ? (
        <CustomerListSkeleton />
      ) : customers.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-8 text-center">
          <p className="text-fg-muted text-sm">
            {search ? t('customer.no_search_results') : t('customer.empty_state')}
          </p>
          {search && (
            <button
              type="button"
              onClick={() => {
                setSeedName(search)
                setShowAdd(true)
              }}
              className="mt-3 inline-flex items-center gap-1 text-sm text-accent hover:underline"
            >
              + {t('customer.add_new')}: "{search}"
            </button>
          )}
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[780px]">
            <thead className="bg-surface-2 text-xs font-semibold uppercase text-fg-muted">
              <tr>
                <th className="text-left py-2 px-4">{t('customer.real_name')}</th>
                <th className="text-left py-2 px-4">{t('customer.app_account')}</th>
                <th className="text-left py-2 px-4">{t('customer.phone')}</th>
                <th className="text-left py-2 px-4">{t('customer.contact_url')}</th>
                <th className="text-left py-2 px-4">{t('customer.address')}</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const appContact = c.contacts.find((ct) => ct.channel !== 'phone')
                const phoneContact = c.contacts.find((ct) => ct.channel === 'phone')
                // URL lives on the same contact row as (app, username), not on
                // its own pseudo-channel row.
                const url = appContact?.url ?? null
                const defaultAddr = c.addresses?.find((a) => a.is_default) ?? c.addresses?.[0]
                return (
                  <tr key={c.id} className="border-t border-border hover:bg-surface-2">
                    <td className="py-2 px-4 font-medium">
                      <Link
                        to={`/orders?customer_id=${c.id}`}
                        className="text-accent hover:underline"
                        title={t('customer.view_orders')}
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="py-2 px-4 text-xs text-fg-muted">
                      {appContact
                        ? `${appContact.channel}: ${appContact.value}`
                        : '—'}
                    </td>
                    <td className="py-2 px-4 text-xs text-fg-muted tabular">
                      {phoneContact?.value ?? c.primary_phone ?? '—'}
                    </td>
                    <td className="py-2 px-4 text-xs truncate max-w-[200px]">
                      {url ? (
                        <a
                          href={url.startsWith('http') ? url : `https://${url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:underline"
                        >
                          {url}
                        </a>
                      ) : (
                        <span className="text-fg-muted">—</span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-xs text-fg-muted truncate max-w-[260px]">
                      {defaultAddr?.street ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function CustomerListSkeleton() {
  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden animate-pulse">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex gap-4 px-4 py-3 border-b border-border last:border-b-0"
        >
          <div className="h-3 w-32 bg-surface-2 rounded" />
          <div className="h-3 flex-1 bg-surface-2 rounded" />
        </div>
      ))}
    </div>
  )
}

/** Common social apps surfaced as suggestions; users can still type anything. */
const APP_SUGGESTIONS = ['zalo', 'facebook', 'instagram', 'kakao', 'line']

function NewCustomerForm({
  seedName,
  onCreated,
}: {
  seedName?: string
  onCreated: () => void
}) {
  const { t } = useTranslation()
  const notify = useNotify()
  const [name, setName] = useState(seedName ?? '')
  const [app, setApp] = useState('zalo')
  const [appUsername, setAppUsername] = useState('')
  const [phone, setPhone] = useState('')
  const [contactUrl, setContactUrl] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // If parent passes a new seed (e.g. user clicks "create with name X"), pick it up
  useEffect(() => {
    if (seedName) setName(seedName)
  }, [seedName])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const appChannel = app.trim().toLowerCase()
      const url = contactUrl.trim() || null
      const contacts: Array<{
        channel: string
        value: string
        url: string | null
        is_primary: boolean
      }> = []
      if (appUsername.trim() && appChannel) {
        // URL belongs with the app contact (deep link for that channel/username).
        contacts.push({
          channel: appChannel,
          value: appUsername.trim(),
          url,
          is_primary: true,
        })
      } else if (url && appChannel) {
        // URL but no username — still store under the chosen channel using URL as value.
        contacts.push({
          channel: appChannel,
          value: url,
          url,
          is_primary: true,
        })
      }
      if (phone.trim()) {
        contacts.push({
          channel: 'phone',
          value: phone.trim(),
          url: null,
          is_primary: contacts.length === 0,
        })
      }
      await apiClient.post('/api/v1/customers', {
        name: name.trim(),
        notes: notes.trim() || null,
        contacts,
        address: address.trim() || null,
      })
      setName('')
      setAppUsername('')
      setPhone('')
      setContactUrl('')
      setAddress('')
      setNotes('')
      notify.success(t('customer.save_customer') + ' ✓')
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
      <div className="md:col-span-2">
        <h2 className="text-sm font-semibold mb-3">{t('order.new_customer_form_title')}</h2>
      </div>
      <Field id="cust-name" label={t('customer.real_name')} required>
        <input
          id="cust-name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent"
        />
      </Field>
      <Field id="cust-phone" label={t('customer.phone')}>
        <input
          id="cust-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent"
        />
      </Field>
      <Field id="cust-app" label={t('customer.app')}>
        <input
          id="cust-app"
          type="text"
          list="cust-app-suggestions"
          value={app}
          onChange={(e) => setApp(e.target.value)}
          placeholder={t('customer.app_placeholder')}
          className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent"
        />
        <datalist id="cust-app-suggestions">
          {APP_SUGGESTIONS.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
      </Field>
      <Field id="cust-app-username" label={t('customer.app_username')}>
        <input
          id="cust-app-username"
          type="text"
          value={appUsername}
          onChange={(e) => setAppUsername(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent"
        />
      </Field>
      <Field id="cust-contact-url" label={t('customer.contact_url')} className="md:col-span-2">
        <input
          id="cust-contact-url"
          type="url"
          value={contactUrl}
          onChange={(e) => setContactUrl(e.target.value)}
          placeholder={t('customer.contact_url_placeholder')}
          className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent"
        />
      </Field>
      <Field id="cust-address" label={t('customer.address')}>
        <input
          id="cust-address"
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={t('customer.address_placeholder')}
          className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent md:col-span-2"
        />
      </Field>
      <Field id="cust-notes" label={t('customer.notes')}>
        <input
          id="cust-notes"
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent"
        />
      </Field>
      {error && <div className="md:col-span-2 text-sm text-danger">{error}</div>}
      <div className="md:col-span-2">
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="px-4 py-2 bg-accent text-accent-fg rounded-md font-semibold text-sm hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {submitting ? t('customer.saving') : t('customer.save_customer')}
        </button>
      </div>
    </form>
  )
}

function Field({
  id,
  label,
  required,
  className,
  children,
}: {
  id: string
  label: string
  required?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-medium text-fg-muted mb-1">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
    </div>
  )
}
