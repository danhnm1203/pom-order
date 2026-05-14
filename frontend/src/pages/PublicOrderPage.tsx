import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'

import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { apiClient, ApiException } from '@/lib/api-client'
import { formatVnd } from '@/lib/utils'
import { type PublicOrderResponse, type OrderStatus } from '@/types/api'

const STATUS_PROGRESS: OrderStatus[] = [
  'pending',
  'ordered',
  'in_transit',
  'arrived',
  'delivered',
  'completed',
]

export function PublicOrderPage() {
  const { token } = useParams<{ token: string }>()
  const { t, i18n } = useTranslation()
  const [data, setData] = useState<PublicOrderResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    apiClient
      .get<PublicOrderResponse>(`/api/v1/public/orders/${token}`, { skipAuth: true })
      .then(setData)
      .catch((err) =>
        setError(err instanceof ApiException ? err.message : t('public.not_found_title')),
      )
      .finally(() => setLoading(false))
  }, [token, t])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-fg-subtle">
        {t('public.loading')}
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <p className="text-lg font-medium">{t('public.not_found_title')}</p>
          <p className="text-sm text-fg-muted mt-2">{t('public.not_found_body')}</p>
        </div>
      </div>
    )
  }

  const isProblem = data.status === 'problem'
  const isCancelled = data.status === 'cancelled'
  const currentStep = STATUS_PROGRESS.indexOf(data.status)
  const dateLocale = i18n.resolvedLanguage === 'ko' ? 'ko-KR' : 'vi-VN'

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold">{t('public.page_title')}</h1>
            <p className="text-xs text-fg-subtle mt-1 font-mono">{token?.slice(0, 8)}</p>
          </div>
          <LanguageSwitcher compact className="text-xs" />
        </header>

        {/* Status card */}
        <div
          className={`rounded-lg p-5 mb-6 ${
            isProblem
              ? 'bg-danger-bg border border-danger/20'
              : isCancelled
                ? 'bg-surface-2 border border-border'
                : 'bg-surface border border-border'
          }`}
        >
          <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
            {t('public.current_status')}
          </p>
          <div className="mt-3">
            <span
              className={`badge badge--${data.status.replace('_', '-')}`}
              style={{ fontSize: '0.95rem', padding: '0.4rem 0.75rem' }}
            >
              {t(`status.${data.status}`)}
            </span>
          </div>
          {data.expected_arrival_date && !isCancelled && (
            <p className="text-sm text-fg-muted mt-3">
              {t('public.expected_arrival', {
                date: new Date(data.expected_arrival_date).toLocaleDateString(dateLocale),
              })}
            </p>
          )}
        </div>

        {/* Progress timeline */}
        {!isCancelled && (
          <section className="mb-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted mb-3">
              {t('public.progress')}
            </h2>
            <ol className="space-y-2">
              {STATUS_PROGRESS.map((step, i) => {
                const done = i <= currentStep
                const isCurrent = i === currentStep
                return (
                  <li key={step} className="flex items-center gap-3">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                        done
                          ? 'bg-accent text-accent-fg'
                          : 'bg-surface-2 text-fg-subtle border border-border'
                      }`}
                    >
                      {done ? '✓' : i + 1}
                    </span>
                    <span
                      className={`text-sm ${
                        isCurrent ? 'font-semibold' : done ? 'text-fg' : 'text-fg-subtle'
                      }`}
                    >
                      {t(`status.${step}`)}
                    </span>
                  </li>
                )
              })}
            </ol>
          </section>
        )}

        {/* Items */}
        <section className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted mb-3">
            {t('public.products_count', { count: data.items.length })}
          </h2>
          <div className="bg-surface border border-border rounded-lg overflow-hidden divide-y divide-border">
            {data.items.map((item, i) => (
              <div key={i} className="p-3">
                <p className="font-medium text-sm">{item.product_name}</p>
                <p className="text-xs text-fg-muted mt-1">
                  {item.brand && <span>{item.brand} · </span>}
                  {t('public.qty_label')} {item.quantity}
                  {item.notes && <> · {item.notes}</>}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Amount */}
        <section className="bg-surface border border-border rounded-lg p-4 space-y-1.5 text-sm mb-6">
          <div className="flex justify-between">
            <span className="text-fg-muted">{t('public.subtotal')}</span>
            <span className="tabular font-semibold">{formatVnd(data.total_vnd)}</span>
          </div>
          {Number(data.international_shipping_vnd) > 0 && (
            <div className="flex justify-between">
              <span className="text-fg-muted">{t('public.intl_shipping')}</span>
              <span className="tabular">{formatVnd(data.international_shipping_vnd)}</span>
            </div>
          )}
          <hr className="border-border my-2" />
          <div className="flex justify-between text-base">
            <span className="font-semibold">{t('public.amount_owed')}</span>
            <span className="tabular font-bold">{formatVnd(data.amount_owed_vnd)}</span>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center text-xs text-fg-subtle pt-4">
          <p>{t('public.footer_note')}</p>
        </footer>
      </div>
    </div>
  )
}
