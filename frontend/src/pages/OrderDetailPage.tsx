import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'

import { StatusBadge } from '@/components/StatusBadge'
import { apiClient, ApiException, generateIdempotencyKey } from '@/lib/api-client'
import { formatVnd } from '@/lib/utils'
import {
  type Order,
  type OrderShortLink,
  type OrderStatus,
  type Payment,
  type PaymentType,
  type ProblemReason,
} from '@/types/api'

const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['ordered', 'cancelled', 'problem'],
  ordered: ['in_transit', 'cancelled', 'problem'],
  in_transit: ['arrived', 'problem', 'cancelled'],
  arrived: ['delivered', 'problem', 'cancelled'],
  delivered: ['completed', 'problem'],
  completed: ['problem'],
  problem: ['ordered', 'in_transit', 'arrived', 'delivered', 'completed', 'cancelled'],
  cancelled: [],
}

/** Map contact channel to a clickable URL where it makes sense. */
function contactHref(channel: string, value: string): string {
  switch (channel) {
    case 'phone':
      return `tel:${value.replace(/\s+/g, '')}`
    case 'email':
      return `mailto:${value}`
    case 'zalo':
      // Zalo deep link works on mobile if installed; gracefully fails on desktop
      return `https://zalo.me/${value.replace(/\D/g, '')}`
    case 'facebook':
      return value.startsWith('http') ? value : `https://facebook.com/${value}`
    case 'kakao':
      return `https://open.kakao.com/o/${value}` // best-effort; user may have plain ID
    default:
      return '#'
  }
}

const PROBLEM_REASON_KEYS: ProblemReason[] = [
  'out_of_stock',
  'wrong_variant',
  'ship_delay',
  'customer_cancel',
  'damaged',
  'customs_hold',
  'other',
]

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t, i18n } = useTranslation()
  const [order, setOrder] = useState<Order | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // TODO: re-enable when production-deployed. Uncomment together with
  // the short-link button + copyShortLink() below.
  // const [shortLinkLoading, setShortLinkLoading] = useState(false)

  async function load() {
    if (!id) return
    setLoading(true)
    try {
      const [orderData, paymentsData] = await Promise.all([
        apiClient.get<Order>(`/api/v1/orders/${id}`),
        apiClient.get<Payment[]>(`/api/v1/orders/${id}/payments`),
      ])
      setOrder(orderData)
      setPayments(paymentsData)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiException ? err.message : t('order.load_error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function transitionStatus(newStatus: OrderStatus) {
    if (!order) return

    let body: { status: OrderStatus; problem_reason?: string } = { status: newStatus }

    // Transitioning to 'problem' requires a reason.
    if (newStatus === 'problem') {
      const reasonOptions = PROBLEM_REASON_KEYS.map(
        (k, i) => `${i + 1}. ${t(`problem_reason.${k}`)} (${k})`,
      ).join('\n')
      const choice = window.prompt(
        `${t('problem_reason.prompt_title')} ${t('problem_reason.prompt_help')}:\n\n${reasonOptions}`,
      )
      if (!choice || !choice.trim()) return
      const num = parseInt(choice.trim(), 10)
      const selected =
        !isNaN(num) && num >= 1 && num <= PROBLEM_REASON_KEYS.length
          ? PROBLEM_REASON_KEYS[num - 1]
          : choice.trim()
      body.problem_reason = selected
    }

    try {
      const updated = await apiClient.patch<Order>(`/api/v1/orders/${order.id}/status`, body)
      setOrder(updated)
    } catch (err) {
      alert(err instanceof ApiException ? err.message : t('order.status_change_error'))
    }
  }

  async function recordPayment(amount: string, type: PaymentType, notes: string) {
    if (!order) return
    try {
      await apiClient.post<Payment>(
        `/api/v1/orders/${order.id}/payments`,
        { amount_vnd: amount, type, notes },
        { idempotencyKey: generateIdempotencyKey() },
      )
      await load()
    } catch (err) {
      alert(err instanceof ApiException ? err.message : t('payment.record_error'))
    }
  }

  async function copyShortLink() {
    if (!order) return
    setShortLinkLoading(true)
    try {
      const data = await apiClient.post<OrderShortLink>(
        `/api/v1/orders/${order.id}/short-link`,
        {},
      )
      const urlToCopy = data.short_url ?? data.long_url
      await navigator.clipboard.writeText(urlToCopy)
      if (data.short_url) {
        alert(t('order.share_link_short_copied', { url: urlToCopy }))
      } else {
        const reasonSuffix = data.error_reason ? ` (${data.error_reason})` : ''
        alert(t('order.share_link_short_unavailable') + reasonSuffix)
      }
    } catch (err) {
      // Fallback: copy long URL from local order data
      const fallback = `${window.location.origin}/o/${order.public_token}`
      await navigator.clipboard.writeText(fallback)
      alert(
        err instanceof ApiException
          ? `${err.message}\n${t('order.share_link_copied', { url: fallback })}`
          : t('order.share_link_short_unavailable'),
      )
    } finally {
      setShortLinkLoading(false)
    }
  }

  if (loading) return <div className="p-6 text-fg-subtle">{t('common.loading')}</div>
  if (error) return <div className="p-6 text-danger">{error}</div>
  if (!order) return null

  const publicUrl = `${window.location.origin}/o/${order.public_token}`
  const dateLocale = i18n.resolvedLanguage === 'ko' ? 'ko-KR' : 'vi-VN'

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-fg-subtle font-mono">{t('order.id')} #{order.id.slice(0, 8)}</p>
          <h1 className="text-xl font-semibold mt-1">
            <StatusBadge status={order.status} />
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(publicUrl)
              alert(t('order.share_link_copied', { url: publicUrl }))
            }}
            className="text-sm text-accent hover:underline"
          >
            {t('order.share_link')}
          </button>
          {/* TODO: Re-enable when deploying to production with real PUBLIC_BASE_URL.
              Backend endpoint + adurl.io integration vẫn còn ở backend, chỉ ẩn UI.
              Để bật lại: uncomment block dưới + xóa eslint-disable trên copyShortLink.
          <span className="text-fg-subtle">·</span>
          <button
            type="button"
            onClick={copyShortLink}
            disabled={shortLinkLoading}
            className="text-sm text-accent hover:underline disabled:opacity-50"
          >
            {shortLinkLoading ? t('order.share_link_loading') : t('order.share_link_short')}
          </button>
          */}
        </div>
      </div>

      {/* Customer */}
      {order.customer && (
        <section className="bg-surface border border-border rounded-lg p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted mb-2">
            {t('order.customer_section')}
          </h2>
          <p className="text-lg font-semibold">{order.customer.name}</p>
          {order.customer.contacts.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm">
              {order.customer.contacts.map((c) => {
                const channelKey = `contact_channel.${c.channel}`
                const channelLabel = t(channelKey, { defaultValue: c.channel })
                return (
                  <li key={c.id} className="flex items-baseline gap-2">
                    <span className="text-xs text-fg-subtle uppercase w-20 tracking-wide">
                      {channelLabel}
                    </span>
                    <a
                      href={contactHref(c.channel, c.value)}
                      className="tabular text-accent hover:underline"
                    >
                      {c.value}
                    </a>
                    {c.is_primary && (
                      <span className="text-xs text-fg-subtle">{t('order.primary_label')}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-fg-subtle mt-1">—</p>
          )}
        </section>
      )}

      {/* Problem reason banner */}
      {order.status === 'problem' && order.problem_reason && (
        <div className="px-4 py-3 rounded-md bg-danger-bg border border-danger/20">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-danger)' }}>
            {t('problem_reason.label')}
          </p>
          <p className="text-sm mt-1">
            {PROBLEM_REASON_KEYS.includes(order.problem_reason as ProblemReason)
              ? t(`problem_reason.${order.problem_reason}`)
              : order.problem_reason}
          </p>
        </div>
      )}

      {/* Status transitions */}
      {NEXT_STATUS[order.status].length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted mb-2">
            {t('order.status_update_label')}
          </h2>
          <div className="flex flex-wrap gap-2">
            {NEXT_STATUS[order.status].map((next) => (
              <button
                key={next}
                type="button"
                onClick={() => transitionStatus(next)}
                className="px-3 py-1.5 rounded-md text-sm bg-surface-2 text-fg hover:bg-border transition-colors"
              >
                → {t(`status.${next}`)}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Items */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted mb-2">
          {t('order.items')} ({order.items.length})
        </h2>
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs font-semibold uppercase text-fg-muted">
              <tr>
                <th className="text-left py-2 px-3">{t('order.items_table.brand')}</th>
                <th className="text-left py-2 px-3">{t('order.items_table.product')}</th>
                <th className="text-right py-2 px-3">{t('order.items_table.qty_short')}</th>
                <th className="text-right py-2 px-3">{t('order.items_table.krw_cost')}</th>
                <th className="text-right py-2 px-3">{t('order.items_table.vnd_sale_per_unit')}</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="py-2 px-3">{item.brand_name_snapshot ?? '—'}</td>
                  <td className="py-2 px-3">
                    {item.product_url_snapshot ? (
                      <a
                        href={item.product_url_snapshot}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline"
                      >
                        {item.product_name_snapshot}
                      </a>
                    ) : (
                      item.product_name_snapshot
                    )}
                    {item.notes && (
                      <p className="text-xs text-fg-subtle mt-0.5">{item.notes}</p>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right tabular">{item.quantity}</td>
                  <td className="py-2 px-3 text-right tabular text-fg-muted">
                    {Number(item.unit_cost_krw).toLocaleString('ko-KR')} ₩
                  </td>
                  <td className="py-2 px-3 text-right tabular">
                    {formatVnd(item.unit_sale_price_vnd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Totals */}
      {order.totals && (
        <section className="bg-surface border border-border rounded-lg p-4 space-y-1.5 text-sm">
          <Row label={t('order.totals.subtotal')} value={formatVnd(order.totals.total_vnd)} bold />
          <Row label={t('order.totals.korean_shipping_note')} value="—" hint />
          <Row label={t('order.totals.intl_shipping')} value={formatVnd(order.totals.international_shipping_vnd)} />
          <Row label={t('order.totals.cost')} value={formatVnd(order.totals.cost_vnd)} hint />
          <Row label={t('order.totals.profit')} value={formatVnd(order.totals.profit_vnd)} highlight />
          <hr className="border-border my-2" />
          <Row label={t('order.totals.paid')} value={formatVnd(order.totals.total_paid_vnd)} />
          <Row label={t('order.totals.owed')} value={formatVnd(order.totals.amount_owed_vnd)} bold />
        </section>
      )}

      <PaymentRecorder payments={payments} onRecord={recordPayment} dateLocale={dateLocale} />
    </div>
  )
}

function Row({
  label,
  value,
  bold,
  hint,
  highlight,
}: {
  label: string
  value: string
  bold?: boolean
  hint?: boolean
  highlight?: boolean
}) {
  return (
    <div className="flex justify-between">
      <span className={hint ? 'text-fg-subtle' : 'text-fg-muted'}>{label}</span>
      <span
        className={`tabular ${bold ? 'font-semibold' : ''} ${
          highlight ? 'text-success font-semibold' : ''
        }`}
      >
        {value}
      </span>
    </div>
  )
}

function PaymentRecorder({
  payments,
  onRecord,
  dateLocale,
}: {
  payments: Payment[]
  onRecord: (amount: string, type: PaymentType, notes: string) => Promise<void>
  dateLocale: string
}) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState('')
  const [type, setType] = useState<PaymentType>('deposit')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const typeLabels: Record<PaymentType, string> = {
    deposit: t('payment.type_deposit'),
    balance: t('payment.type_balance'),
    refund: t('payment.type_refund'),
    adjustment: t('payment.type_adjustment'),
  }

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted mb-2">
        {t('payment.count_label', { count: payments.length })}
      </h2>

      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!amount) return
          setSubmitting(true)
          await onRecord(amount, type, notes)
          setAmount('')
          setNotes('')
          setSubmitting(false)
        }}
        className="bg-surface border border-border rounded-lg p-4 mb-3 flex flex-wrap gap-2 items-end"
      >
        <div className="flex-1 min-w-32">
          <label className="block text-xs text-fg-muted mb-1">{t('payment.amount')}</label>
          <input
            type="number"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100000"
            className="w-full px-3 py-1.5 border border-border rounded-md focus:outline-none focus:border-accent text-sm tabular"
          />
        </div>
        <div>
          <label className="block text-xs text-fg-muted mb-1">{t('payment.type')}</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as PaymentType)}
            className="px-3 py-1.5 border border-border rounded-md text-sm"
          >
            {(['deposit', 'balance', 'refund', 'adjustment'] as PaymentType[]).map((tt) => (
              <option key={tt} value={tt}>
                {typeLabels[tt]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-32">
          <label className="block text-xs text-fg-muted mb-1">{t('payment.notes')}</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('common.optional')}
            className="w-full px-3 py-1.5 border border-border rounded-md focus:outline-none focus:border-accent text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !amount}
          className="px-4 py-1.5 bg-accent text-accent-fg rounded-md font-semibold text-sm hover:bg-accent-hover disabled:opacity-50"
        >
          {submitting ? t('payment.submitting') : t('payment.submit')}
        </button>
      </form>

      {payments.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t('payment.no_payments')}</p>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs font-semibold uppercase text-fg-muted">
              <tr>
                <th className="text-left py-2 px-3">{t('payment.table_time')}</th>
                <th className="text-left py-2 px-3">{t('payment.table_type')}</th>
                <th className="text-right py-2 px-3">{t('payment.table_amount')}</th>
                <th className="text-left py-2 px-3">{t('payment.table_notes')}</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="py-2 px-3 text-xs text-fg-muted tabular">
                    {new Date(p.paid_at).toLocaleString(dateLocale)}
                  </td>
                  <td className="py-2 px-3">{typeLabels[p.type]}</td>
                  <td className="py-2 px-3 text-right tabular">{formatVnd(p.amount_vnd)}</td>
                  <td className="py-2 px-3 text-fg-muted">{p.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
