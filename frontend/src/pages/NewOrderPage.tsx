import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { CustomerCombobox } from '@/components/CustomerCombobox'
import { CustomerQuickAdd } from '@/components/CustomerQuickAdd'
import { useNotify } from '@/components/Toast'
import { apiClient, ApiException } from '@/lib/api-client'
import { formatVnd } from '@/lib/utils'
import type { Customer, FxRate, Order } from '@/types/api'

const FX_STALE_THRESHOLD_DAYS = 7

interface DraftItem {
  product_name_snapshot: string
  product_url_snapshot: string
  brand_name_snapshot: string
  quantity: string
  unit_cost_krw: string
  unit_sale_price_vnd: string
  notes: string
}

const EMPTY_ITEM: DraftItem = {
  product_name_snapshot: '',
  product_url_snapshot: '',
  brand_name_snapshot: '',
  quantity: '1',
  unit_cost_krw: '',
  unit_sale_price_vnd: '',
  notes: '',
}

export function NewOrderPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const notify = useNotify()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [fx, setFx] = useState<FxRate | null>(null)
  const [customerId, setCustomerId] = useState<string>('')
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [fxRate, setFxRate] = useState<string>('')
  const [koreanShipping, setKoreanShipping] = useState<string>('0')
  const [intlShipping, setIntlShipping] = useState<string>('0')
  const [notes, setNotes] = useState<string>('')
  const [items, setItems] = useState<DraftItem[]>([{ ...EMPTY_ITEM }])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void apiClient.get<Customer[]>('/api/v1/customers?limit=100').then(setCustomers)
    apiClient
      .get<FxRate>('/api/v1/fx-rates/current')
      .then((r) => {
        setFx(r)
        setFxRate(r.rate)
      })
      .catch(() => {
        setError(t('fx.no_rate_set'))
      })
  }, [t])

  const totalKrw = items.reduce(
    (sum, i) => sum + Number(i.unit_cost_krw || 0) * Number(i.quantity || 0),
    0,
  )
  const totalVnd = items.reduce(
    (sum, i) => sum + Number(i.unit_sale_price_vnd || 0) * Number(i.quantity || 0),
    0,
  )
  const costVnd = totalKrw * Number(fxRate || 0) + Number(koreanShipping) * Number(fxRate || 0)
  const profitVnd = totalVnd - costVnd - Number(intlShipping)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const validItems = items.filter(
        (i) => i.product_name_snapshot && i.unit_cost_krw && i.unit_sale_price_vnd,
      )
      if (validItems.length === 0) {
        throw new Error(t('order.must_have_item'))
      }
      const order = await apiClient.post<Order>('/api/v1/orders', {
        customer_id: customerId || null,
        fx_rate_krw_to_vnd: fxRate,
        korean_shipping_krw: koreanShipping,
        international_shipping_vnd: intlShipping,
        notes: notes || null,
        items: validItems.map((i) => ({
          product_name_snapshot: i.product_name_snapshot,
          product_url_snapshot: i.product_url_snapshot || null,
          brand_name_snapshot: i.brand_name_snapshot || null,
          quantity: i.quantity,
          unit_cost_krw: i.unit_cost_krw,
          unit_sale_price_vnd: i.unit_sale_price_vnd,
          notes: i.notes || null,
        })),
      })
      notify.success(t('order.create_new') + ' ✓')
      navigate(`/orders/${order.id}`)
    } catch (err) {
      setError(
        err instanceof ApiException
          ? err.message
          : err instanceof Error
            ? err.message
            : t('order.create_error'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  function updateItem(idx: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  const fxAgeDays = fx
    ? Math.floor((Date.now() - new Date(fx.effective_from).getTime()) / (1000 * 60 * 60 * 24))
    : null
  const fxIsStale = fxAgeDays !== null && fxAgeDays > FX_STALE_THRESHOLD_DAYS

  return (
    <div className="p-4 md:p-6 max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-6">{t('order.create_title')}</h1>

      {fxIsStale && (
        <div className="mb-4 px-4 py-3 rounded-md bg-warning-bg border border-warning/20 flex items-start justify-between gap-3">
          <p className="text-sm">
            <span className="font-semibold" style={{ color: 'var(--color-warning)' }}>
              {t('dashboard.fx_stale_title')}
            </span>
            <span className="text-fg-muted ml-1">
              {t('dashboard.fx_stale_body', { days: fxAgeDays })}
            </span>
          </p>
          <a
            href="/fx"
            className="text-sm font-semibold whitespace-nowrap"
            style={{ color: 'var(--color-warning)' }}
          >
            {t('dashboard.fx_update_action')}
          </a>
        </div>
      )}

      {error && (
        <div className="bg-danger-bg border border-danger/20 text-danger rounded-md p-3 text-sm mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Customer + FX */}
        <section className="bg-surface border border-border rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium">{t('order.customer')}</label>
              {!showQuickAdd && (
                <button
                  type="button"
                  onClick={() => setShowQuickAdd(true)}
                  className="text-xs text-accent hover:underline"
                >
                  {t('order.add_customer_inline')}
                </button>
              )}
            </div>
            <CustomerCombobox
              customers={customers}
              value={customerId}
              onChange={setCustomerId}
              disabled={showQuickAdd}
            />
            {showQuickAdd && (
              <CustomerQuickAdd
                onCreated={(c) => {
                  setCustomers((prev) => [c, ...prev])
                  setCustomerId(c.id)
                  setShowQuickAdd(false)
                }}
                onCancel={() => setShowQuickAdd(false)}
              />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">
              {t('order.fx_rate')}{' '}
              {fx && (
                <span className="text-xs text-fg-subtle">
                  {t('order.fx_rate_current', { rate: fx.rate })}
                </span>
              )}
            </label>
            <input
              type="number"
              step="0.0001"
              required
              value={fxRate}
              onChange={(e) => setFxRate(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm tabular"
            />
          </div>
        </section>

        {/* Items */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
              {t('order.items')}
            </h2>
            <button
              type="button"
              onClick={() => setItems((prev) => [...prev, { ...EMPTY_ITEM }])}
              className="text-sm text-accent hover:underline"
            >
              {t('order.add_item')}
            </button>
          </div>
          <div className="space-y-3">
            {items.map((item, idx) => (
              <fieldset
                key={idx}
                className="bg-surface border border-border rounded-lg p-3 grid grid-cols-1 md:grid-cols-6 gap-2"
              >
                <legend className="sr-only">
                  {t('order.items')} #{idx + 1}
                </legend>
                <ItemField label={t('order.items_table.brand')} className="md:col-span-1">
                  <input
                    type="text"
                    aria-label={t('order.items_table.brand')}
                    placeholder={t('order.items_table.brand')}
                    value={item.brand_name_snapshot}
                    onChange={(e) => updateItem(idx, { brand_name_snapshot: e.target.value })}
                    className="w-full px-2 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:border-accent"
                  />
                </ItemField>
                <ItemField label={t('order.items_table.product')} required className="md:col-span-2">
                  <input
                    type="text"
                    aria-label={t('order.items_table.product')}
                    placeholder={t('order.items_table.product')}
                    required
                    value={item.product_name_snapshot}
                    onChange={(e) => updateItem(idx, { product_name_snapshot: e.target.value })}
                    className="w-full px-2 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:border-accent"
                  />
                </ItemField>
                <ItemField label={t('order.items_table.qty')} required>
                  <input
                    type="number"
                    step="0.01"
                    aria-label={t('order.items_table.qty')}
                    placeholder={t('order.items_table.qty')}
                    required
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                    className="w-full px-2 py-1.5 border border-border rounded-md text-sm tabular focus:outline-none focus:border-accent"
                  />
                </ItemField>
                <ItemField label={t('order.items_table.krw_cost')} required>
                  <input
                    type="number"
                    aria-label={t('order.items_table.krw_cost')}
                    placeholder={t('order.items_table.krw_cost')}
                    required
                    value={item.unit_cost_krw}
                    onChange={(e) => updateItem(idx, { unit_cost_krw: e.target.value })}
                    className="w-full px-2 py-1.5 border border-border rounded-md text-sm tabular focus:outline-none focus:border-accent"
                  />
                </ItemField>
                <ItemField label={t('order.items_table.vnd_sale_per_unit')} required>
                  <input
                    type="number"
                    aria-label={t('order.items_table.vnd_sale_per_unit')}
                    placeholder={t('order.items_table.vnd_sale_per_unit')}
                    required
                    value={item.unit_sale_price_vnd}
                    onChange={(e) => updateItem(idx, { unit_sale_price_vnd: e.target.value })}
                    className="w-full px-2 py-1.5 border border-border rounded-md text-sm tabular focus:outline-none focus:border-accent"
                  />
                </ItemField>
                <ItemField label={t('order.items_table.korean_url')} className="md:col-span-4">
                  <input
                    type="url"
                    aria-label={t('order.items_table.korean_url')}
                    placeholder={t('order.items_table.korean_url')}
                    value={item.product_url_snapshot}
                    onChange={(e) => updateItem(idx, { product_url_snapshot: e.target.value })}
                    className="w-full px-2 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:border-accent"
                  />
                </ItemField>
                <ItemField label={t('order.items_table.variant_notes')} className="md:col-span-2">
                  <input
                    type="text"
                    aria-label={t('order.items_table.variant_notes')}
                    placeholder={t('order.items_table.variant_notes')}
                    value={item.notes}
                    onChange={(e) => updateItem(idx, { notes: e.target.value })}
                    className="w-full px-2 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:border-accent"
                  />
                </ItemField>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                    className="md:col-span-6 text-xs text-fg-subtle hover:text-danger justify-self-end"
                  >
                    {t('order.remove_item')}
                  </button>
                )}
              </fieldset>
            ))}
          </div>
        </section>

        {/* Shipping + notes */}
        <section className="bg-surface border border-border rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('order.korean_shipping')}</label>
            <input
              type="number"
              value={koreanShipping}
              onChange={(e) => setKoreanShipping(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm tabular"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('order.intl_shipping')}</label>
            <input
              type="number"
              value={intlShipping}
              onChange={(e) => setIntlShipping(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm tabular"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1.5">{t('order.notes')}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-border rounded-md text-sm"
            />
          </div>
        </section>

        {/* Live totals */}
        <section className="bg-surface-2 border border-border rounded-lg p-4 text-sm space-y-1.5">
          <Row label={t('order.totals.preview_total_krw')} value={`${totalKrw.toLocaleString('ko-KR')} ₩`} hint />
          <Row label={t('order.totals.preview_total_vnd')} value={formatVnd(totalVnd)} bold />
          <Row label={t('order.totals.cost')} value={formatVnd(costVnd)} hint />
          <Row label={t('order.totals.preview_profit')} value={formatVnd(profitVnd)} highlight />
        </section>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting || !fxRate}
            className="px-6 py-2 bg-accent text-accent-fg rounded-md font-semibold text-sm hover:bg-accent-hover disabled:opacity-50"
          >
            {submitting ? t('order.creating') : t('order.create_new')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/orders')}
            className="px-6 py-2 bg-surface-2 text-fg rounded-md font-semibold text-sm hover:bg-border"
          >
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </div>
  )
}

function ItemField({
  label,
  required,
  className,
  children,
}: {
  label: string
  required?: boolean
  className?: string
  children: ReactNode
}) {
  // Wrapper for first-row inputs. Label is visually hidden (input has aria-label
  // + placeholder) so the dense grid layout doesn't get pushed apart, but
  // screen readers still hear it.
  return (
    <div className={className}>
      <span className="sr-only">
        {label} {required && '(required)'}
      </span>
      {children}
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
