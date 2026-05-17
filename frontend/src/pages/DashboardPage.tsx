import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { apiClient, ApiException } from '@/lib/api-client'
import { formatVnd } from '@/lib/utils'
import { type DashboardData, type ProfitDashboardData } from '@/types/api'

const PROFIT_WINDOW_OPTIONS = [3, 6, 12] as const
type ProfitWindow = (typeof PROFIT_WINDOW_OPTIONS)[number]

export function DashboardPage() {
  const { t } = useTranslation()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiClient
      .get<DashboardData>('/api/v1/dashboard')
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((err) => {
        setError(err instanceof ApiException ? err.message : t('dashboard.load_error'))
      })
      .finally(() => setLoading(false))
  }, [t])

  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-6xl">
        <h1 className="text-2xl font-semibold tracking-tight mb-6">{t('dashboard.title')}</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-surface border border-border rounded-lg p-4 h-24 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 md:p-6 max-w-6xl">
        <div className="bg-danger-bg border border-danger/20 text-danger rounded-md p-4 text-sm">
          {error}{' '}
          <button onClick={() => window.location.reload()} className="underline">
            {t('common.retry')}
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  if (data.active_orders_count === 0) {
    return (
      <div className="p-4 md:p-6 max-w-6xl">
        <h1 className="text-2xl font-semibold tracking-tight mb-6">{t('dashboard.title')}</h1>
        <div className="bg-surface border border-border rounded-lg p-10 md:p-12 text-center">
          <p className="text-3xl mb-3" aria-hidden="true">▤</p>
          <p className="text-fg text-base font-medium">{t('dashboard.empty_state')}</p>
          <p className="text-fg-muted text-sm mt-1 mb-5">
            {t('order.create_title')}
          </p>
          <a
            href="/orders/new"
            className="inline-block px-5 py-2.5 bg-accent text-accent-fg rounded-md font-semibold text-sm hover:bg-accent-hover transition-colors"
          >
            {t('dashboard.create_first_order')}
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-6">{t('dashboard.title')}</h1>

      {/* FX rate freshness warning */}
      {data.fx_rate_is_stale && data.fx_rate_age_days !== null && (
        <div className="mb-4 px-4 py-3 rounded-md bg-warning-bg border border-warning/20 flex items-start justify-between gap-3">
          <div className="text-sm">
            <span className="font-semibold" style={{ color: 'var(--color-warning)' }}>
              {t('dashboard.fx_stale_title')}
            </span>
            <span className="text-fg-muted ml-1">
              {t('dashboard.fx_stale_body', { days: data.fx_rate_age_days })}
            </span>
          </div>
          <a
            href="/fx"
            className="text-sm font-semibold whitespace-nowrap"
            style={{ color: 'var(--color-warning)' }}
          >
            {t('dashboard.fx_update_action')}
          </a>
        </div>
      )}

      {/* Headline stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Stat label={t('dashboard.active_orders')} value={String(data.active_orders_count)} />
        <Stat label={t('dashboard.vnd_owed')} value={formatVnd(data.total_amount_owed_vnd)} />
        <Stat
          label={t('dashboard.krw_ordered_month')}
          value={`${Number(data.total_krw_ordered_this_month).toLocaleString('ko-KR')} ₩`}
        />
      </div>

      {/* Status breakdown */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted mb-3">
          {t('dashboard.by_status')}
        </h2>
        <div className="flex flex-wrap gap-2">
          {data.status_counts.map((sc) => (
            <span
              key={sc.status}
              className={`badge badge--${sc.status.replace('_', '-')}`}
            >
              {t(`status.${sc.status}`)} ({sc.count})
            </span>
          ))}
        </div>
      </section>

      {/* Top brands */}
      {data.top_brands_this_month.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted mb-3">
            {t('dashboard.top_brands')}
          </h2>
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs font-semibold uppercase text-fg-muted">
                <tr>
                  <th className="text-left py-2 px-4">{t('dashboard.brand')}</th>
                  <th className="text-right py-2 px-4">{t('dashboard.orders_count')}</th>
                  <th className="text-right py-2 px-4">{t('dashboard.total_vnd')}</th>
                </tr>
              </thead>
              <tbody>
                {data.top_brands_this_month.map((b) => (
                  <tr key={b.brand_name} className="border-t border-border">
                    <td className="py-2 px-4">{b.brand_name}</td>
                    <td className="py-2 px-4 text-right tabular">{b.order_count}</td>
                    <td className="py-2 px-4 text-right tabular">{formatVnd(b.total_vnd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <ProfitSection />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <p className="text-xs text-fg-muted font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold mt-2 tabular">{value}</p>
    </div>
  )
}

function ProfitSection() {
  const { t } = useTranslation()
  const [windowMonths, setWindowMonths] = useState<ProfitWindow>(12)
  const [profit, setProfit] = useState<ProfitDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiClient
      .get<ProfitDashboardData>(`/api/v1/dashboard/profit?window_months=${windowMonths}`)
      .then((d) => {
        if (cancelled) return
        setProfit(d)
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof ApiException ? err.message : t('dashboard.profit.load_error'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [t, windowMonths])

  return (
    <section className="mt-8">
      <div className="flex items-end justify-between mb-3 gap-3 flex-wrap">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
          {t('dashboard.profit.section_title')}
        </h2>
        <label className="text-xs text-fg-muted flex items-center gap-2">
          <span>{t('dashboard.profit.window_label')}</span>
          <select
            value={windowMonths}
            onChange={(e) => setWindowMonths(Number(e.target.value) as ProfitWindow)}
            className="bg-surface border border-border rounded px-2 py-1 text-sm text-fg"
          >
            {PROFIT_WINDOW_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {t('dashboard.profit.window_months', { count: m })}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && (
        <div className="bg-surface border border-border rounded-lg p-6 h-32 animate-pulse" />
      )}

      {!loading && error && (
        <div className="bg-danger-bg border border-danger/20 text-danger rounded-md p-4 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && profit && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CustomerProfitTable rows={profit.top_customers_by_profit} />
          <BrandProfitTable rows={profit.top_brands_by_profit} />
        </div>
      )}
    </section>
  )
}

function CustomerProfitTable({ rows }: { rows: ProfitDashboardData['top_customers_by_profit'] }) {
  const { t } = useTranslation()
  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-2 bg-surface-2 text-xs font-semibold uppercase text-fg-muted">
        {t('dashboard.profit.top_customers')}
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-fg-muted">{t('dashboard.profit.empty')}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs font-semibold uppercase text-fg-muted">
            <tr>
              <th className="text-left py-2 px-4">{t('dashboard.profit.customer')}</th>
              <th className="text-right py-2 px-4">{t('dashboard.orders_count')}</th>
              <th className="text-right py-2 px-4">{t('dashboard.profit.profit_vnd')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const profitNum = Number(r.profit_vnd)
              return (
                <tr key={r.customer_id} className="border-t border-border">
                  <td className="py-2 px-4 truncate max-w-[180px]" title={r.customer_name}>
                    {r.customer_name}
                  </td>
                  <td className="py-2 px-4 text-right tabular">{r.order_count}</td>
                  <td
                    className={`py-2 px-4 text-right tabular font-medium ${
                      profitNum < 0 ? 'text-danger' : ''
                    }`}
                  >
                    {formatVnd(r.profit_vnd)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

function BrandProfitTable({ rows }: { rows: ProfitDashboardData['top_brands_by_profit'] }) {
  const { t } = useTranslation()
  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-2 bg-surface-2 text-xs font-semibold uppercase text-fg-muted">
        {t('dashboard.profit.top_brands')}
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-fg-muted">{t('dashboard.profit.empty')}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs font-semibold uppercase text-fg-muted">
            <tr>
              <th className="text-left py-2 px-4">{t('dashboard.brand')}</th>
              <th className="text-right py-2 px-4">{t('dashboard.profit.profit_vnd')}</th>
              <th className="text-right py-2 px-4">{t('dashboard.profit.margin_pct')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const profitNum = Number(r.profit_vnd)
              return (
                <tr key={r.brand_name} className="border-t border-border">
                  <td className="py-2 px-4 truncate max-w-[180px]" title={r.brand_name}>
                    {r.brand_name}
                  </td>
                  <td
                    className={`py-2 px-4 text-right tabular font-medium ${
                      profitNum < 0 ? 'text-danger' : ''
                    }`}
                  >
                    {formatVnd(r.profit_vnd)}
                  </td>
                  <td className="py-2 px-4 text-right tabular text-fg-muted">
                    {r.margin_pct === null ? '—' : `${r.margin_pct}%`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
