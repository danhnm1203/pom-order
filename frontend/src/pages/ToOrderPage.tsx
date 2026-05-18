import { useEffect, useMemo, useState } from 'react'
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
  { key: 'to_order', statuses: PENDING_STATUSES },
  { key: 'placed', statuses: PLACED_STATUSES },
  { key: 'all', statuses: null },
]

/** A bucket of order_items aggregated by product. */
interface ProductGroup {
  /** Stable key: product_id when present, otherwise a normalised name fallback. */
  key: string
  brand_name: string | null
  product_name: string
  product_url: string | null
  product_id: string | null
  total_qty: number
  items: OrderItemListRow[]
}

/** Group items by product_id; fall back to brand+name when product_id is null
 *  (legacy items that pre-date the auto-link feature). */
function groupByProduct(items: OrderItemListRow[]): ProductGroup[] {
  const map = new Map<string, ProductGroup>()
  for (const it of items) {
    const key =
      it.product_id ??
      `legacy::${(it.brand_name ?? '').toLowerCase()}::${it.product_name.toLowerCase()}`
    const existing = map.get(key)
    if (existing) {
      existing.total_qty += Number(it.quantity || 0)
      existing.items.push(it)
    } else {
      map.set(key, {
        key,
        brand_name: it.brand_name,
        product_name: it.product_name,
        product_url: it.product_url,
        product_id: it.product_id,
        total_qty: Number(it.quantity || 0),
        items: [it],
      })
    }
  }
  // Sort by total_qty desc — the busiest products are usually the most useful to see first.
  return Array.from(map.values()).sort((a, b) => b.total_qty - a.total_qty)
}

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

  const visibleItems = useMemo(
    () =>
      items.filter((it) => {
        const f = FILTERS.find((x) => x.key === filter)
        if (!f || f.statuses === null) return true
        return f.statuses.includes(it.order_status)
      }),
    [items, filter],
  )

  const groups = useMemo(() => groupByProduct(visibleItems), [visibleItems])
  const totalQty = groups.reduce((sum, g) => sum + g.total_qty, 0)

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold tracking-tight">{t('to_order.title')}</h1>
        <p className="text-sm text-fg-muted">
          {t('to_order.summary', { products: groups.length, qty: totalQty })}
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
      ) : groups.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-8 text-center text-fg-muted text-sm">
          {t('to_order.empty')}
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-surface-2 text-xs font-semibold uppercase text-fg-muted">
              <tr>
                <th className="text-left py-2 px-3">{t('to_order.col_brand')}</th>
                <th className="text-left py-2 px-3">{t('to_order.col_product')}</th>
                <th className="text-right py-2 px-3">{t('to_order.col_total_qty')}</th>
                <th className="text-left py-2 px-3">{t('to_order.col_breakdown')}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.key} className="border-t border-border align-top">
                  <td className="py-2 px-3 text-fg-muted">{g.brand_name ?? '—'}</td>
                  <td className="py-2 px-3 font-medium">
                    {g.product_url ? (
                      <a
                        href={g.product_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline"
                        title={g.product_url}
                      >
                        {g.product_name}
                      </a>
                    ) : (
                      g.product_name
                    )}
                  </td>
                  <td className="py-2 px-3 text-right tabular text-base font-bold">
                    {formatQty(g.total_qty)}
                  </td>
                  <td className="py-2 px-3">
                    <ul className="space-y-1 text-xs">
                      {g.items.map((it) => (
                        <li key={it.item_id} className="flex items-baseline gap-1.5 flex-wrap">
                          <span className="tabular font-semibold text-fg">
                            {formatQty(it.quantity)}×
                          </span>
                          {filter === 'all' && (
                            <span
                              className={`badge badge--${it.order_status.replace('_', '-')} text-[10px]`}
                            >
                              {t(`status.${it.order_status}`)}
                            </span>
                          )}
                          {it.notes && (
                            <span className="text-fg-muted">{it.notes}</span>
                          )}
                          <span className="text-fg-subtle">·</span>
                          {it.customer_id ? (
                            <Link
                              to={`/orders?customer_id=${it.customer_id}`}
                              className="text-accent hover:underline"
                            >
                              {it.customer_name ?? '—'}
                            </Link>
                          ) : (
                            <span className="text-fg-subtle">—</span>
                          )}
                          <Link
                            to={`/orders/${it.order_id}`}
                            className="text-fg-subtle hover:text-accent hover:underline font-mono"
                          >
                            #{it.order_id.slice(0, 8)}
                          </Link>
                          <span className="text-fg-subtle">
                            ·{' '}
                            {new Date(it.order_created_at).toLocaleDateString(dateLocale)}
                          </span>
                        </li>
                      ))}
                    </ul>
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
