import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { apiClient, ApiException } from '@/lib/api-client'
import type { Product } from '@/types/api'

interface ProductQuickAddProps {
  seedName?: string
  onCreated: (product: Product) => void
  onCancel: () => void
}

/**
 * Compact inline product-create form for the New Order flow.
 * Submits → returns the created product to the parent (which auto-selects + fills snapshot fields).
 */
export function ProductQuickAdd({ seedName, onCreated, onCancel }: ProductQuickAddProps) {
  const { t } = useTranslation()
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
    e.stopPropagation()
    setSubmitting(true)
    setError(null)
    try {
      const created = await apiClient.post<Product>('/api/v1/products', {
        name: name.trim(),
        name_kr: nameKr.trim() || null,
        brand_name: brand.trim() || null,
        url: url.trim() || null,
        base_price_krw: basePriceKrw.trim() || null,
      })
      onCreated(created)
    } catch (err) {
      setError(err instanceof ApiException ? err.message : t('product.create_error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-surface-2 border border-border rounded-md p-3 mt-2 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
          {t('product.add_new')}
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-fg-subtle hover:text-fg"
        >
          ✕
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input
          type="text"
          placeholder={t('product.brand_placeholder')}
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          className="px-2 py-1.5 border border-border rounded-md text-sm"
        />
        <input
          type="text"
          required
          autoFocus
          placeholder={t('product.name_placeholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="px-2 py-1.5 border border-border rounded-md text-sm"
        />
        <input
          type="text"
          placeholder={t('product.name_kr_placeholder')}
          value={nameKr}
          onChange={(e) => setNameKr(e.target.value)}
          className="px-2 py-1.5 border border-border rounded-md text-sm"
        />
        <input
          type="number"
          step="0.01"
          min="0"
          placeholder={t('product.base_price_krw')}
          value={basePriceKrw}
          onChange={(e) => setBasePriceKrw(e.target.value)}
          className="px-2 py-1.5 border border-border rounded-md text-sm tabular"
        />
        <input
          type="url"
          placeholder="URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="px-2 py-1.5 border border-border rounded-md text-sm sm:col-span-2"
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
          {submitting ? t('product.saving') : t('product.save_product')}
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
