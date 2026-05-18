import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'

import { QuickStatusMenu } from '@/components/QuickStatusMenu'
import { useNotify } from '@/components/Toast'
import { apiClient } from '@/lib/api-client'
import { csvRow, downloadFile, formatVnd, getPrimaryContact } from '@/lib/utils'
import { type Customer, type Order, type OrderStatus } from '@/types/api'

const STATUS_FILTERS: Array<OrderStatus | 'all'> = [
  'all',
  'chatting',
  'order_placed',
  'purchased',
  'at_kr_warehouse',
  'at_vn_warehouse',
  'received_by_owner',
  'shipping_to_customer',
  'customer_received',
  'problem',
  'cancelled',
]

export function OrderListPage() {
  const { t, i18n } = useTranslation()
  const notify = useNotify()
  const [searchParams, setSearchParams] = useSearchParams()
  const customerIdParam = searchParams.get('customer_id') ?? ''
  const [orders, setOrders] = useState<Order[]>([])
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Fetched separately so the filter pill can show the customer's name.
  const [customerFilter, setCustomerFilter] = useState<Customer | null>(null)

  // Debounce search input → reduce API calls while typing
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 250)
    return () => clearTimeout(id)
  }, [search])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filter !== 'all') params.set('status', filter)
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
    if (customerIdParam) params.set('customer_id', customerIdParam)
    const qs = params.toString()
    apiClient
      .get<Order[]>(`/api/v1/orders${qs ? `?${qs}` : ''}`)
      .then(setOrders)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [filter, debouncedSearch, customerIdParam])

  // Fetch customer details (for the filter pill label) — separate from orders.
  useEffect(() => {
    if (!customerIdParam) {
      setCustomerFilter(null)
      return
    }
    apiClient
      .get<Customer>(`/api/v1/customers/${customerIdParam}`)
      .then(setCustomerFilter)
      .catch(() => setCustomerFilter(null))
  }, [customerIdParam])

  function clearCustomerFilter() {
    const next = new URLSearchParams(searchParams)
    next.delete('customer_id')
    setSearchParams(next, { replace: true })
  }

  const dateLocale = i18n.resolvedLanguage === 'ko' ? 'ko-KR' : 'vi-VN'

  function handleExportCsv() {
    const headers = [
      'order_id',
      'status',
      'customer',
      'phone_or_contact',
      'item_count',
      'brands',
      'total_vnd',
      'profit_vnd',
      'amount_owed_vnd',
      'created_at',
    ]
    const rows = orders.map((o) => {
      const contact = getPrimaryContact(o.customer)
      const brands = Array.from(
        new Set(o.items.map((i) => i.brand_name_snapshot).filter(Boolean)),
      ).join(' / ')
      return csvRow([
        o.id,
        o.status,
        o.customer?.name ?? '',
        contact ? `${contact.channel}: ${contact.value}` : '',
        o.items.length,
        brands,
        o.totals?.total_vnd ?? '',
        o.totals?.profit_vnd ?? '',
        o.totals?.amount_owed_vnd ?? '',
        o.created_at,
      ])
    })
    const csv = [csvRow(headers), ...rows].join('\n')
    const stamp = new Date().toISOString().slice(0, 10)
    downloadFile(`pom-orders-${stamp}.csv`, '﻿' + csv, 'text/csv;charset=utf-8')
    notify.success(t('order.export_csv') + ' ✓')
  }

  function handleOrderUpdate(updated: Order) {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4 md:mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t('order.title')}</h1>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={orders.length === 0}
            className="px-3 py-2 bg-surface-2 text-fg-muted rounded-md text-sm hover:bg-border disabled:opacity-50"
          >
            ↓ {t('order.export_csv')}
          </button>
          <Link
            to="/orders/new"
            className="px-4 py-2 bg-accent text-accent-fg rounded-md font-semibold text-sm hover:bg-accent-hover transition-colors"
          >
            {t('order.create_new')}
          </Link>
        </div>
      </div>

      {/* Customer filter pill (from /customers click-through) */}
      {customerIdParam && (
        <div className="mb-3 inline-flex items-center gap-2 bg-surface-2 border border-border rounded-md px-3 py-1.5 text-sm">
          <span className="text-fg-muted text-xs uppercase tracking-wide">
            {t('order.filter_by_customer')}
          </span>
          <span className="font-medium">
            {customerFilter?.name ?? customerIdParam.slice(0, 8)}
          </span>
          <button
            type="button"
            onClick={clearCustomerFilter}
            className="text-fg-subtle hover:text-fg ml-1"
            aria-label={t('common.cancel')}
          >
            ×
          </button>
        </div>
      )}

      {/* Search bar */}
      <div className="mb-3">
        <label htmlFor="order-search" className="sr-only">
          {t('order.search_placeholder')}
        </label>
        <input
          id="order-search"
          type="search"
          placeholder={t('order.search_placeholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-md text-sm bg-surface focus:outline-none focus:border-accent"
        />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              filter === s
                ? 'bg-fg text-bg'
                : 'bg-surface-2 text-fg-muted hover:bg-border'
            }`}
          >
            {s === 'all' ? t('common.all') : t(`status.${s}`)}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <OrderListSkeleton />
      ) : error ? (
        <div className="bg-danger-bg border border-danger/20 text-danger rounded-md p-4 text-sm">
          {error}
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-8 text-center">
          <p className="text-fg-muted">
            {filter === 'all' && !debouncedSearch
              ? t('order.no_orders')
              : t('order.no_filter_results', {
                  label: filter !== 'all' ? t(`status.${filter}`) : debouncedSearch,
                })}
          </p>
          {(filter !== 'all' || debouncedSearch) && (
            <button
              type="button"
              onClick={() => {
                setFilter('all')
                setSearch('')
              }}
              className="mt-3 text-sm text-accent hover:underline"
            >
              {t('order.view_all')}
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop / tablet table view (md+) */}
          <div className="hidden md:block bg-surface border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs font-semibold uppercase text-fg-muted">
                <tr>
                  <th className="text-left py-2 px-4">{t('order.id')}</th>
                  <th className="text-left py-2 px-4">{t('payment.table_type')}</th>
                  <th className="text-left py-2 px-4">{t('order.customer_column')}</th>
                  <th className="text-left py-2 px-4">{t('order.phone_column')}</th>
                  <th className="text-left py-2 px-4">{t('order.items')}</th>
                  <th className="text-right py-2 px-4">{t('order.totals.subtotal')}</th>
                  <th className="text-right py-2 px-4">{t('payment.table_time')}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const contact = getPrimaryContact(o.customer)
                  return (
                    <tr key={o.id} className="border-t border-border hover:bg-surface-2">
                      <td className="py-2 px-4">
                        <Link
                          to={`/orders/${o.id}`}
                          className="text-accent hover:underline font-mono text-xs"
                        >
                          {o.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="py-2 px-4">
                        <QuickStatusMenu order={o} onUpdate={handleOrderUpdate} />
                      </td>
                      <td className="py-2 px-4">
                        {o.customer ? (
                          <span className="font-medium">{o.customer.name}</span>
                        ) : (
                          <span className="text-fg-subtle text-xs">{t('order.no_customer')}</span>
                        )}
                      </td>
                      <td className="py-2 px-4 tabular text-fg-muted">
                        {contact ? (
                          contact.channel === 'phone' ? (
                            <span>{contact.value}</span>
                          ) : (
                            <span title={contact.channel}>
                              <span className="text-xs text-fg-subtle uppercase">
                                {contact.channel}:
                              </span>{' '}
                              {contact.value}
                            </span>
                          )
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                      <td className="py-2 px-4 text-fg-muted">
                        {o.items.length} {t('order.item_singular')}
                        {o.items[0] && (
                          <span className="text-fg-subtle ml-1">
                            ({o.items[0].brand_name_snapshot ??
                              o.items[0].product_name_snapshot.slice(0, 20)}
                            {o.items.length > 1 ? '...' : ''})
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-4 text-right tabular">
                        {o.totals ? formatVnd(o.totals.total_vnd) : '—'}
                      </td>
                      <td className="py-2 px-4 text-right text-fg-muted text-xs">
                        {new Date(o.created_at).toLocaleDateString(dateLocale)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card view (< md) */}
          <div className="md:hidden space-y-2">
            {orders.map((o) => {
              const contact = getPrimaryContact(o.customer)
              return (
                <div
                  key={o.id}
                  className="bg-surface border border-border rounded-lg p-3"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <Link
                      to={`/orders/${o.id}`}
                      className="text-accent hover:underline font-mono text-xs"
                    >
                      #{o.id.slice(0, 8)}
                    </Link>
                    <QuickStatusMenu order={o} onUpdate={handleOrderUpdate} />
                  </div>
                  {o.customer && (
                    <p className="font-medium text-sm">{o.customer.name}</p>
                  )}
                  {contact && (
                    <p className="text-xs text-fg-muted tabular">
                      {contact.channel !== 'phone' && (
                        <span className="uppercase text-fg-subtle">{contact.channel}: </span>
                      )}
                      {contact.value}
                    </p>
                  )}
                  <div className="flex items-baseline justify-between mt-2 text-xs">
                    <span className="text-fg-muted">
                      {o.items.length} {t('order.item_singular')}
                      {o.items[0]?.brand_name_snapshot && (
                        <span className="text-fg-subtle"> · {o.items[0].brand_name_snapshot}</span>
                      )}
                    </span>
                    <span className="tabular font-semibold">
                      {o.totals ? formatVnd(o.totals.total_vnd) : '—'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function OrderListSkeleton() {
  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden animate-pulse">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-b-0"
        >
          <div className="h-3 w-16 bg-surface-2 rounded" />
          <div className="h-5 w-20 bg-surface-2 rounded" />
          <div className="h-3 flex-1 bg-surface-2 rounded" />
          <div className="h-3 w-24 bg-surface-2 rounded" />
        </div>
      ))}
    </div>
  )
}
