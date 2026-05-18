import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { apiClient, ApiException } from '@/lib/api-client'
import { type OrderItemListRow, type OrderStatus } from '@/types/api'

/** Statuses considered "still need to be placed with Korea". */
const PENDING_STATUSES: OrderStatus[] = ['pending']
/** Statuses considered "already placed with Korea (or further along)". */
const PLACED_STATUSES: OrderStatus[] = [
  'ordered',
  'in_transit',
  'arrived',
  'delivered',
  'completed',
]

type Filter = 'all' | 'to_order' | 'placed'

const FILTERS: Array<{ key: Filter; statuses: OrderStatus[] | null }> = [
  { key: 'all', statuses: null },
  { key: 'to_order', statuses: PENDING_STATUSES },
  { key: 'placed', statuses: PLACED_STATUSES },
]

export function ToOrderPage() {
  const { t, i18n } = useTranslation()
  const [items, setItems] = useState<OrderItemListRow[]>([])
  const [filter, setFilter] = useState<Filter>('to_order')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiClient
      .get<OrderItemListRow[]>('/api/v1/order-items?limit=500')
      .then((data) => {
        if (!cancelled) {
          setItems(data)
          setError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiException ? err.message : t('to_order.load_error'))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [t])

  const dateLocale = i18n.resolvedLanguage === 'ko' ? 'ko-KR' : 'vi-VN'

  const visibleItems = items.filter((it) => {
    const f = FILTERS.find((x) => x.key === filter)
    if (!f || f.statuses === null) return true
    return f.statuses.includes(it.order_status)
  })

  // Total quantity for the current filter — useful summary number at the top.
  const totalQty = visibleItems.reduce((sum, it) => sum + Number(it.quantity || 0), 0)

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold tracking-tight">{t('to_order.title')}</h1>
        <p className="text-sm text-fg-muted">
          {t('to_order.summary', { count: visibleItems.length, qty: totalQty })}
        </p>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              filter === f.key
                ? 'bg-fg text-bg'
                : 'bg-surface-2 text-fg-muted hover:bg-border'
            }`}
          >
            {t(`to_order.filter_${f.key}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-surface border border-border rounded-lg p-8 animate-pulse h-32" />
      ) : error ? (
        <div className="bg-danger-bg border border-danger/20 text-danger rounded-md p-4 text-sm">
          {error}
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-8 text-center text-fg-muted text-sm">
          {t('to_order.empty')}
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-surface-2 text-xs font-semibold uppercase text-fg-muted">
              <tr>
                <th className="text-left py-2 px-3">{t('to_order.col_status')}</th>
                <th className="text-left py-2 px-3">{t('to_order.col_brand')}</th>
                <th className="text-left py-2 px-3">{t('to_order.col_product')}</th>
                <th className="text-right py-2 px-3">{t('to_order.col_qty')}</th>
                <th className="text-left py-2 px-3">{t('to_order.col_notes')}</th>
                <th className="text-left py-2 px-3">{t('to_order.col_customer')}</th>
                <th className="text-right py-2 px-3">{t('to_order.col_date')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((it) => (
                <tr key={it.item_id} className="border-t border-border hover:bg-surface-2">
                  <td className="py-2 px-3">
                    <span className={`badge badge--${it.order_status.replace('_', '-')}`}>
                      {t(`status.${it.order_status}`)}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-fg-muted">{it.brand_name ?? '—'}</td>
                  <td className="py-2 px-3 font-medium">
                    {it.product_url ? (
                      <a
                        href={it.product_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline"
                        title={it.product_url}
                      >
                        {it.product_name}
                      </a>
                    ) : (
                      it.product_name
                    )}
                  </td>
                  <td className="py-2 px-3 text-right tabular font-semibold">
                    {formatQty(it.quantity)}
                  </td>
                  <td className="py-2 px-3 text-xs text-fg-muted truncate max-w-[220px]" title={it.notes ?? undefined}>
                    {it.notes ?? '—'}
                  </td>
                  <td className="py-2 px-3 text-xs">
                    {it.customer_id ? (
                      <Link
                        to={`/orders?customer_id=${it.customer_id}`}
                        className="text-accent hover:underline"
                      >
                        {it.customer_name ?? '—'}
                      </Link>
                    ) : (
                      <span className="text-fg-subtle">—</span>
                    )}{' '}
                    ·{' '}
                    <Link
                      to={`/orders/${it.order_id}`}
                      className="text-xs text-fg-subtle hover:text-accent hover:underline font-mono"
                    >
                      #{it.order_id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="py-2 px-3 text-right text-xs text-fg-muted tabular">
                    {new Date(it.order_created_at).toLocaleDateString(dateLocale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Drop trailing .00 on integer quantities. */
function formatQty(v: string | number): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return Number.isInteger(n) ? String(n) : n.toString()
}
