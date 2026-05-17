import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { useNotify } from '@/components/Toast'
import { apiClient, ApiException } from '@/lib/api-client'
import { formatKrw } from '@/lib/utils'
import type { Product, ProductWithStats } from '@/types/api'

export function ProductListPage() {
  const { t } = useTranslation()
  const [products, setProducts] = useState<ProductWithStats[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [seedName, setSeedName] = useState('')

  async function load() {
    setLoading(true)
    const query = search ? `?search=${encodeURIComponent(search)}` : ''
    try {
      const data = await apiClient.get<ProductWithStats[]>(`/api/v1/products${query}`)
      setProducts(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t('product.title')}</h1>
        <button
          type="button"
          onClick={() => {
            setSeedName('')
            setShowAdd((s) => !s)
          }}
          className="px-4 py-2 bg-accent text-accent-fg rounded-md font-semibold text-sm hover:bg-accent-hover transition-colors"
        >
          {showAdd ? t('common.cancel') : t('product.add_new')}
        </button>
      </div>

      {showAdd && (
        <NewProductForm
          seedName={seedName}
          onCreated={() => {
            setShowAdd(false)
            setSeedName('')
            void load()
          }}
        />
      )}

      <div className="mb-4">
        <label htmlFor="product-search" className="sr-only">
          {t('product.search_placeholder')}
        </label>
        <input
          id="product-search"
          type="search"
          placeholder={t('product.search_placeholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent"
        />
      </div>

      {loading ? (
        <ProductListSkeleton />
      ) : products.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-8 text-center">
          <p className="text-fg-muted text-sm">
            {search ? t('product.no_search_results') : t('product.empty_state')}
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
              + {t('product.add_new')}: "{search}"
            </button>
          )}
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-surface-2 text-xs font-semibold uppercase text-fg-muted">
              <tr>
                <th className="text-left py-2 px-4">{t('product.brand')}</th>
                <th className="text-left py-2 px-4">{t('product.name')}</th>
                <th className="text-right py-2 px-4">{t('product.base_price_krw')}</th>
                <th className="text-right py-2 px-4">{t('product.stats.total')}</th>
                <th className="text-right py-2 px-4">{t('product.stats.ordered')}</th>
                <th className="text-right py-2 px-4">{t('product.stats.pending')}</th>
                <th className="text-right py-2 px-4">{t('product.stats.delivered')}</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const pendingNum = Number(p.stats.pending_qty)
                return (
                  <tr key={p.id} className="border-t border-border hover:bg-surface-2">
                    <td className="py-2 px-4 text-fg-muted">{p.brand_name ?? '—'}</td>
                    <td className="py-2 px-4 font-medium">
                      <div>{p.name}</div>
                      {p.name_kr && (
                        <div className="text-xs text-fg-subtle">{p.name_kr}</div>
                      )}
                    </td>
                    <td className="py-2 px-4 text-right tabular text-fg-muted">
                      {p.base_price_krw ? formatKrw(p.base_price_krw) : '—'}
                    </td>
                    <td className="py-2 px-4 text-right tabular">{formatQty(p.stats.total_qty)}</td>
                    <td className="py-2 px-4 text-right tabular">
                      {formatQty(p.stats.ordered_qty)}
                    </td>
                    <td
                      className={`py-2 px-4 text-right tabular font-medium ${
                        pendingNum > 0 ? 'text-warning' : 'text-fg-subtle'
                      }`}
                    >
                      {formatQty(p.stats.pending_qty)}
                    </td>
                    <td className="py-2 px-4 text-right tabular text-fg-muted">
                      {formatQty(p.stats.delivered_qty)}
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

/** Quantity display: drop trailing zeros on .00 to keep tables clean. */
function formatQty(value: string | number): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return Number.isInteger(n) ? String(n) : n.toString()
}

function ProductListSkeleton() {
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

function NewProductForm({
  seedName,
  onCreated,
}: {
  seedName?: string
  onCreated: () => void
}) {
  const { t } = useTranslation()
  const notify = useNotify()
  const [name, setName] = useState(seedName ?? '')
  const [nameKr, setNameKr] = useState('')
  const [brand, setBrand] = useState('')
  const [url, setUrl] = useState('')
  const [basePriceKrw, setBasePriceKrw] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (seedName) setName(seedName)
  }, [seedName])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await apiClient.post<Product>('/api/v1/products', {
        name: name.trim(),
        name_kr: nameKr.trim() || null,
        brand_name: brand.trim() || null,
        url: url.trim() || null,
        base_price_krw: basePriceKrw.trim() || null,
      })
      setName('')
      setNameKr('')
      setBrand('')
      setUrl('')
      setBasePriceKrw('')
      notify.success(t('product.save_product') + ' ✓')
      onCreated()
    } catch (err) {
      setError(err instanceof ApiException ? err.message : t('product.create_error'))
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
        <h2 className="text-sm font-semibold mb-3">{t('product.add_new')}</h2>
      </div>
      <Field id="prod-brand" label={t('product.brand')}>
        <input
          id="prod-brand"
          type="text"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          placeholder={t('product.brand_placeholder')}
          className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent"
        />
      </Field>
      <Field id="prod-name" label={t('product.name')} required>
        <input
          id="prod-name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent"
        />
      </Field>
      <Field id="prod-name-kr" label={t('product.name_kr')}>
        <input
          id="prod-name-kr"
          type="text"
          value={nameKr}
          onChange={(e) => setNameKr(e.target.value)}
          placeholder={t('product.name_kr_placeholder')}
          className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent"
        />
      </Field>
      <Field id="prod-base-price" label={t('product.base_price_krw')}>
        <input
          id="prod-base-price"
          type="number"
          step="0.01"
          min="0"
          value={basePriceKrw}
          onChange={(e) => setBasePriceKrw(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-md text-sm tabular focus:outline-none focus:border-accent"
        />
      </Field>
      <Field id="prod-url" label={t('product.url')} className="md:col-span-2">
        <input
          id="prod-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
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
          {submitting ? t('product.saving') : t('product.save_product')}
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
