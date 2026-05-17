import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'

import { IntegerCurrencyInput } from '@/components/IntegerCurrencyInput'
import { Modal } from '@/components/Modal'
import { StatusBadge } from '@/components/StatusBadge'
import { useNotify } from '@/components/Toast'
import { apiClient, ApiException, generateIdempotencyKey } from '@/lib/api-client'
import { formatVnd } from '@/lib/utils'
import {
  type Order,
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
      return `https://zalo.me/${value.replace(/\D/g, '')}`
    case 'facebook':
      return value.startsWith('http') ? value : `https://facebook.com/${value}`
    case 'kakao':
      return `https://open.kakao.com/o/${value}`
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
  const notify = useNotify()
  const [order, setOrder] = useState<Order | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [problemModalOpen, setProblemModalOpen] = useState(false)

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

  async function applyStatus(newStatus: OrderStatus, problemReason?: string) {
    if (!order) return
    try {
      const body: { status: OrderStatus; problem_reason?: string } = { status: newStatus }
      if (problemReason) body.problem_reason = problemReason
      const updated = await apiClient.patch<Order>(`/api/v1/orders/${order.id}/status`, body)
      setOrder(updated)
    } catch (err) {
      notify.error(err instanceof ApiException ? err.message : t('order.status_change_error'))
    }
  }

  function onStatusButtonClick(newStatus: OrderStatus) {
    if (newStatus === 'problem') {
      setProblemModalOpen(true)
      return
    }
    void applyStatus(newStatus)
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
      notify.error(err instanceof ApiException ? err.message : t('payment.record_error'))
    }
  }

  async function updatePayment(
    paymentId: string,
    patch: { amount_vnd?: string; type?: PaymentType; notes?: string | null },
  ) {
    if (!order) return
    try {
      await apiClient.patch<Payment>(
        `/api/v1/orders/${order.id}/payments/${paymentId}`,
        patch,
      )
      await load()
    } catch (err) {
      notify.error(err instanceof ApiException ? err.message : t('payment.update_error'))
    }
  }

  async function deletePayment(paymentId: string) {
    if (!order) return
    if (!window.confirm(t('payment.delete_confirm'))) return
    try {
      await apiClient.delete(`/api/v1/orders/${order.id}/payments/${paymentId}`)
      await load()
    } catch (err) {
      notify.error(err instanceof ApiException ? err.message : t('payment.delete_error'))
    }
  }

  if (loading) return <OrderDetailSkeleton />
  if (error) {
    return (
      <div className="p-6 max-w-5xl">
        <div className="bg-danger-bg border border-danger/20 text-danger rounded-md p-3 text-sm">
          {error}
        </div>
      </div>
    )
  }
  if (!order) return null

  const publicUrl = `${window.location.origin}/o/${order.public_token}`
  const dateLocale = i18n.resolvedLanguage === 'ko' ? 'ko-KR' : 'vi-VN'
  const koreanShippingKrw = Number(order.korean_shipping_krw)

  return (
    <div className="p-4 md:p-6 max-w-5xl space-y-6">
      {/* Back link */}
      <Link
        to="/orders"
        className="inline-flex items-center text-sm text-fg-muted hover:text-fg transition-colors"
      >
        ← {t('order.title')}
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-fg-subtle font-mono">
            {t('order.id')} #{order.id.slice(0, 8)}
          </p>
          <div className="mt-2">
            <StatusBadge status={order.status} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(publicUrl)
                notify.success(t('order.share_link_copied', { url: publicUrl }))
              } catch {
                notify.error(t('order.share_link_copied', { url: publicUrl }))
              }
            }}
            className="text-sm text-accent hover:underline"
          >
            {t('order.share_link')}
          </button>
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
          <p
            className="text-xs font-medium uppercase tracking-wide"
            style={{ color: 'var(--color-danger)' }}
          >
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
                onClick={() => onStatusButtonClick(next)}
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
        <div className="bg-surface border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
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
                    {item.notes && <p className="text-xs text-fg-subtle mt-0.5">{item.notes}</p>}
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
          <Row
            label={t('order.totals.subtotal')}
            value={formatVnd(order.totals.total_vnd)}
            bold
          />
          {koreanShippingKrw > 0 && (
            <Row
              label={t('order.totals.korean_shipping_note')}
              value={`${koreanShippingKrw.toLocaleString('ko-KR')} ₩`}
              hint
            />
          )}
          <Row
            label={t('order.totals.intl_shipping')}
            value={formatVnd(order.totals.international_shipping_vnd)}
          />
          <Row label={t('order.totals.cost')} value={formatVnd(order.totals.cost_vnd)} hint />
          <Row
            label={t('order.totals.profit')}
            value={formatVnd(order.totals.profit_vnd)}
            highlight
          />
          <hr className="border-border my-2" />
          <Row label={t('order.totals.paid')} value={formatVnd(order.totals.total_paid_vnd)} />
          <Row
            label={t('order.totals.owed')}
            value={formatVnd(order.totals.amount_owed_vnd)}
            bold
          />
        </section>
      )}

      <PaymentRecorder
        payments={payments}
        onRecord={recordPayment}
        onUpdate={updatePayment}
        onDelete={deletePayment}
        dateLocale={dateLocale}
      />

      <ProblemReasonModal
        open={problemModalOpen}
        onClose={() => setProblemModalOpen(false)}
        onConfirm={(reason) => {
          setProblemModalOpen(false)
          void applyStatus('problem', reason)
        }}
      />
    </div>
  )
}

function ProblemReasonModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<ProblemReason | null>(null)
  const [other, setOther] = useState('')

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setSelected(null)
      setOther('')
    }
  }, [open])

  function confirm() {
    if (!selected) return
    const reason = selected === 'other' && other.trim() ? other.trim() : selected
    onConfirm(reason)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('problem_reason.prompt_title')}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm bg-surface text-fg-muted hover:text-fg border border-border"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!selected || (selected === 'other' && !other.trim())}
            className="px-3 py-1.5 rounded-md text-sm font-semibold bg-danger text-white hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--color-danger)', color: '#fff' }}
          >
            {t('common.submit')}
          </button>
        </>
      }
    >
      <fieldset className="space-y-2">
        <legend className="sr-only">{t('problem_reason.prompt_title')}</legend>
        {PROBLEM_REASON_KEYS.map((key) => (
          <label
            key={key}
            className={`flex items-start gap-3 p-2.5 rounded-md border cursor-pointer transition-colors ${
              selected === key
                ? 'border-accent bg-accent-subtle'
                : 'border-border hover:bg-surface-2'
            }`}
          >
            <input
              type="radio"
              name="problem-reason"
              value={key}
              checked={selected === key}
              onChange={() => setSelected(key)}
              className="mt-0.5"
            />
            <span className="text-sm">{t(`problem_reason.${key}`)}</span>
          </label>
        ))}
        {selected === 'other' && (
          <input
            type="text"
            autoFocus
            placeholder={t('problem_reason.prompt_help')}
            value={other}
            onChange={(e) => setOther(e.target.value)}
            className="w-full mt-2 px-3 py-2 border border-border rounded-md text-sm"
          />
        )}
      </fieldset>
    </Modal>
  )
}

function OrderDetailSkeleton() {
  return (
    <div className="p-4 md:p-6 max-w-5xl space-y-6 animate-pulse">
      <div className="h-4 w-24 bg-surface-2 rounded" />
      <div className="space-y-2">
        <div className="h-3 w-32 bg-surface-2 rounded" />
        <div className="h-7 w-40 bg-surface-2 rounded" />
      </div>
      <div className="bg-surface border border-border rounded-lg p-4 space-y-2">
        <div className="h-3 w-20 bg-surface-2 rounded" />
        <div className="h-5 w-48 bg-surface-2 rounded" />
        <div className="h-3 w-56 bg-surface-2 rounded" />
      </div>
      <div className="h-32 bg-surface border border-border rounded-lg" />
      <div className="h-40 bg-surface border border-border rounded-lg" />
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
  onUpdate,
  onDelete,
  dateLocale,
}: {
  payments: Payment[]
  onRecord: (amount: string, type: PaymentType, notes: string) => Promise<void>
  onUpdate: (
    paymentId: string,
    patch: { amount_vnd?: string; type?: PaymentType; notes?: string | null },
  ) => Promise<void>
  onDelete: (paymentId: string) => Promise<void>
  dateLocale: string
}) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState('')
  const [type, setType] = useState<PaymentType>('deposit')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

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
        className="bg-surface border border-border rounded-lg p-4 mb-3 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
      >
        <div className="sm:col-span-1">
          <label htmlFor="pay-amount" className="block text-xs text-fg-muted mb-1">
            {t('payment.amount')}
          </label>
          <IntegerCurrencyInput
            id="pay-amount"
            required
            value={amount}
            onChange={setAmount}
            placeholder="100.000"
            className="w-full px-3 py-1.5 border border-border rounded-md focus:outline-none focus:border-accent text-sm tabular"
          />
        </div>
        <div>
          <label htmlFor="pay-type" className="block text-xs text-fg-muted mb-1">
            {t('payment.type')}
          </label>
          <select
            id="pay-type"
            value={type}
            onChange={(e) => setType(e.target.value as PaymentType)}
            className="w-full px-3 py-1.5 border border-border rounded-md text-sm bg-surface"
          >
            {(['deposit', 'balance', 'refund', 'adjustment'] as PaymentType[]).map((tt) => (
              <option key={tt} value={tt}>
                {typeLabels[tt]}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-1">
          <label htmlFor="pay-notes" className="block text-xs text-fg-muted mb-1">
            {t('payment.notes')}
          </label>
          <input
            id="pay-notes"
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
        <div className="bg-surface border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-surface-2 text-xs font-semibold uppercase text-fg-muted">
              <tr>
                <th className="text-left py-2 px-3">{t('payment.table_time')}</th>
                <th className="text-left py-2 px-3">{t('payment.table_type')}</th>
                <th className="text-right py-2 px-3">{t('payment.table_amount')}</th>
                <th className="text-left py-2 px-3">{t('payment.table_notes')}</th>
                <th className="text-right py-2 px-3 w-1">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) =>
                editingId === p.id ? (
                  <PaymentEditRow
                    key={p.id}
                    payment={p}
                    typeLabels={typeLabels}
                    dateLocale={dateLocale}
                    onSave={async (patch) => {
                      await onUpdate(p.id, patch)
                      setEditingId(null)
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <tr key={p.id} className="border-t border-border">
                    <td className="py-2 px-3 text-xs text-fg-muted tabular">
                      {new Date(p.paid_at).toLocaleString(dateLocale)}
                    </td>
                    <td className="py-2 px-3">{typeLabels[p.type]}</td>
                    <td className="py-2 px-3 text-right tabular">{formatVnd(p.amount_vnd)}</td>
                    <td className="py-2 px-3 text-fg-muted">{p.notes ?? '—'}</td>
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setEditingId(p.id)}
                        className="text-xs text-accent hover:underline px-1"
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDelete(p.id)}
                        className="text-xs text-fg-subtle hover:text-danger px-1"
                      >
                        {t('common.delete')}
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function PaymentEditRow({
  payment,
  typeLabels,
  dateLocale,
  onSave,
  onCancel,
}: {
  payment: Payment
  typeLabels: Record<PaymentType, string>
  dateLocale: string
  onSave: (patch: {
    amount_vnd?: string
    type?: PaymentType
    notes?: string | null
  }) => Promise<void>
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState(String(payment.amount_vnd))
  const [type, setType] = useState<PaymentType>(payment.type)
  const [notes, setNotes] = useState(payment.notes ?? '')
  const [submitting, setSubmitting] = useState(false)

  async function handleSave() {
    if (!amount) return
    setSubmitting(true)
    try {
      await onSave({
        amount_vnd: amount,
        type,
        notes: notes.trim() || null,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <tr className="border-t border-border bg-surface-2">
      <td className="py-2 px-3 text-xs text-fg-muted tabular">
        {new Date(payment.paid_at).toLocaleString(dateLocale)}
      </td>
      <td className="py-2 px-3">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as PaymentType)}
          className="w-full px-2 py-1 border border-border rounded text-sm bg-surface"
        >
          {(['deposit', 'balance', 'refund', 'adjustment'] as PaymentType[]).map((tt) => (
            <option key={tt} value={tt}>
              {typeLabels[tt]}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 px-3">
        <IntegerCurrencyInput
          required
          value={amount}
          onChange={setAmount}
          className="w-full px-2 py-1 border border-border rounded text-sm tabular text-right"
        />
      </td>
      <td className="py-2 px-3">
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full px-2 py-1 border border-border rounded text-sm"
        />
      </td>
      <td className="py-2 px-3 text-right whitespace-nowrap">
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting || !amount}
          className="text-xs font-semibold text-accent hover:underline px-1 disabled:opacity-50"
        >
          {submitting ? t('common.loading') : t('common.save')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-fg-subtle hover:text-fg px-1"
        >
          {t('common.cancel')}
        </button>
      </td>
    </tr>
  )
}
